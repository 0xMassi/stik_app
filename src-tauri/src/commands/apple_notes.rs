use chrono::Local;
use flate2::read::GzDecoder;
use prost::Message;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::process::Command;
use tauri::State;

use super::apple_notes_sync::{AppleNotesSyncState, SyncEntry};
use super::embeddings::{self, EmbeddingIndex};
use super::index::NoteIndex;
use super::notes;

// Generated protobuf types from apple_notes.proto
mod proto {
    include!(concat!(env!("OUT_DIR"), "/apple.notes.rs"));
}

// Core Foundation epoch offset: seconds between 1970-01-01 and 2001-01-01
const CF_EPOCH_OFFSET: i64 = 978_307_200;

// ── Data types returned to frontend ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppleNoteEntry {
    pub note_id: i64,
    pub title: String,
    pub folder_name: String,
    pub snippet: String,
    pub modified_date: String,
    pub account_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppleNotesExportResult {
    pub note_id: String,
}

// ── SQLite connection ──

fn notes_db_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    home.join("Library/Group Containers/group.com.apple.notes/NoteStore.sqlite")
        .to_string_lossy()
        .to_string()
}

fn open_readonly_connection() -> Result<Connection, String> {
    let path = notes_db_path();
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;

    let conn = Connection::open_with_flags(&path, flags).map_err(|e| {
        let msg = e.to_string();
        if msg.contains("unable to open") || msg.contains("permission") || msg.contains("denied") {
            format!(
                "FULL_DISK_ACCESS_REQUIRED: Stik needs Full Disk Access to read Apple Notes. \
                 Go to System Settings → Privacy & Security → Full Disk Access, then add Stik."
            )
        } else {
            format!("Failed to open Apple Notes database: {}", msg)
        }
    })?;

    conn.execute_batch("PRAGMA query_only = ON;")
        .map_err(|e| format!("Failed to set read-only pragma: {}", e))?;
    conn.busy_timeout(std::time::Duration::from_millis(2000))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    Ok(conn)
}

/// Public wrapper for other modules (e.g. apple_notes_sync) that need read-only DB access.
pub fn open_readonly_connection_pub() -> Result<Connection, String> {
    open_readonly_connection()
}

fn cf_timestamp_to_iso(cf_ts: f64) -> String {
    let unix_ts = cf_ts as i64 + CF_EPOCH_OFFSET;
    chrono::DateTime::from_timestamp(unix_ts, 0)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_default()
}

// ── Schema detection ──

/// Detect which ZACCOUNT* column links notes to accounts.
/// Apple increments this column name across macOS releases:
///   10.13–10.14 → ZACCOUNT2, 10.15–11 → ZACCOUNT3,
///   12 → ZACCOUNT4, 13+ → ZACCOUNT7
fn detect_account_column(conn: &Connection) -> &'static str {
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(ZICCLOUDSYNCINGOBJECT)")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        })
        .unwrap_or_default();

    // Check newest first so we pick the right one on modern macOS
    for candidate in &["ZACCOUNT7", "ZACCOUNT4", "ZACCOUNT3", "ZACCOUNT2"] {
        if columns.iter().any(|c| c == candidate) {
            return candidate;
        }
    }
    "ZACCOUNT2" // fallback
}

// ── List notes ──

fn list_apple_notes_inner() -> Result<Vec<AppleNoteEntry>, String> {
    let conn = open_readonly_connection()?;
    let account_col = detect_account_column(&conn);

    let query = format!(
        "SELECT
            n.Z_PK,
            n.ZTITLE1,
            COALESCE(f.ZTITLE2, 'Notes') as folder_name,
            n.ZSNIPPET,
            n.ZMODIFICATIONDATE1,
            COALESCE(a.ZNAME, 'Local') as account_name
        FROM ZICCLOUDSYNCINGOBJECT n
        LEFT JOIN ZICCLOUDSYNCINGOBJECT f ON n.ZFOLDER = f.Z_PK
        LEFT JOIN ZICCLOUDSYNCINGOBJECT a ON n.{} = a.Z_PK
        WHERE n.ZTITLE1 IS NOT NULL
          AND (n.ZMARKEDFORDELETION IS NULL OR n.ZMARKEDFORDELETION != 1)
        ORDER BY n.ZMODIFICATIONDATE1 DESC",
        account_col
    );

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare notes query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let note_id: i64 = row.get(0)?;
            let title: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
            let folder_name: String = row.get(2)?;
            let snippet: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
            let mod_date: f64 = row.get::<_, Option<f64>>(4)?.unwrap_or(0.0);
            let account_name: String = row.get(5)?;

            Ok(AppleNoteEntry {
                note_id,
                title,
                folder_name,
                snippet,
                modified_date: cf_timestamp_to_iso(mod_date),
                account_name,
            })
        })
        .map_err(|e| format!("Failed to query notes: {}", e))?;

    let mut notes = Vec::new();
    for row in rows {
        match row {
            Ok(entry) => notes.push(entry),
            Err(e) => eprintln!("Skipping note row: {}", e),
        }
    }

    Ok(notes)
}

// ── Import note: gzip + protobuf pipeline ──

pub fn import_apple_note_inner(note_id: i64) -> Result<String, String> {
    let conn = open_readonly_connection()?;

    let compressed: Vec<u8> = conn
        .query_row(
            "SELECT nd.ZDATA
             FROM ZICCLOUDSYNCINGOBJECT n
             JOIN ZICNOTEDATA nd ON n.ZNOTEDATA = nd.Z_PK
             WHERE n.Z_PK = ?1",
            [note_id],
            |row| row.get(0),
        )
        .map_err(|e| {
            if e.to_string().contains("no rows") {
                format!("Note {} not found or has no data", note_id)
            } else {
                format!("Failed to read note data: {}", e)
            }
        })?;

    // Decompress gzip
    let mut decoder = GzDecoder::new(&compressed[..]);
    let mut decompressed = Vec::new();
    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("Failed to decompress note data: {}", e))?;

    // Decode protobuf
    let store = proto::NoteStoreProto::decode(&decompressed[..])
        .map_err(|e| format!("Failed to decode protobuf: {}", e))?;

    let note = store
        .document
        .and_then(|d| d.note)
        .ok_or_else(|| "Note protobuf has no document/note content".to_string())?;

    Ok(protobuf_to_markdown(&note))
}

// ── Protobuf → Markdown converter ──

fn protobuf_to_markdown(note: &proto::Note) -> String {
    let text = note.note_text.as_deref().unwrap_or("");
    let chars: Vec<char> = text.chars().collect();
    let total_chars = chars.len();
    let mut pos: usize = 0;
    let mut output = String::new();
    let mut numbered_counter: i32 = 0;
    let mut in_code_block = false;
    let mut is_first_line = true;

    for run in &note.attribute_run {
        let run_len = run.length.unwrap_or(0).max(0) as usize;
        let end = (pos + run_len).min(total_chars);
        let run_text: String = chars[pos..end].iter().collect();
        pos = end;

        // Skip attachment placeholders (U+FFFC)
        if run.attachment_info.is_some() || run_text.contains('\u{FFFC}') {
            continue;
        }

        let style_type = run
            .paragraph_style
            .as_ref()
            .and_then(|ps| ps.style_type)
            .unwrap_or(-1);

        let indent = run
            .paragraph_style
            .as_ref()
            .and_then(|ps| ps.indent_amount)
            .unwrap_or(0)
            .max(0) as usize;

        let checklist_done = run
            .paragraph_style
            .as_ref()
            .and_then(|ps| ps.checklist.as_ref())
            .and_then(|cl| cl.done);

        let font_weight = run.font_weight.unwrap_or(0);
        let strikethrough = run.strikethrough.unwrap_or(0);
        let link = run.link.as_deref();

        // Process line by line within the run
        let lines: Vec<&str> = run_text.split('\n').collect();

        for (line_idx, line) in lines.iter().enumerate() {
            // Emit newline for line breaks within a run (not the first segment)
            if line_idx > 0 {
                // Close code block if we're leaving monospaced style
                if in_code_block && style_type != 4 {
                    output.push_str("```\n");
                    in_code_block = false;
                }
                output.push('\n');

                // Reset numbered counter when we hit a non-numbered line
                if style_type != 102 {
                    numbered_counter = 0;
                }
            }

            if line.is_empty() {
                continue;
            }

            // Determine if this is the start of a new line in the output
            let at_line_start = output.is_empty() || output.ends_with('\n');

            if at_line_start {
                let indent_prefix = "  ".repeat(indent);

                match style_type {
                    0 if is_first_line => {
                        // Title: first line, no prefix (Stik treats first line as title)
                        is_first_line = false;
                    }
                    0 => {
                        output.push_str(&indent_prefix);
                        output.push_str("# ");
                    }
                    1 => {
                        output.push_str(&indent_prefix);
                        output.push_str("## ");
                    }
                    2 => {
                        output.push_str(&indent_prefix);
                        output.push_str("### ");
                    }
                    4 => {
                        // Monospaced / code block
                        if !in_code_block {
                            output.push_str("```\n");
                            in_code_block = true;
                        }
                    }
                    100 | 101 => {
                        // Bullet / dashed list
                        output.push_str(&indent_prefix);
                        output.push_str("- ");
                        numbered_counter = 0;
                    }
                    102 => {
                        // Numbered list
                        numbered_counter += 1;
                        output.push_str(&indent_prefix);
                        output.push_str(&format!("{}. ", numbered_counter));
                    }
                    103 => {
                        // Checklist
                        output.push_str(&indent_prefix);
                        if checklist_done == Some(1) {
                            output.push_str("- [x] ");
                        } else {
                            output.push_str("- [ ] ");
                        }
                        numbered_counter = 0;
                    }
                    _ => {
                        // Body text (-1 or default)
                        if is_first_line {
                            is_first_line = false;
                        }
                    }
                }
            }

            // Apply inline formatting
            let formatted = apply_inline_formatting(line, font_weight, strikethrough, link);
            output.push_str(&formatted);
        }
    }

    // Close any open code block
    if in_code_block {
        output.push_str("\n```");
    }

    // Clean up trailing whitespace
    output.trim_end().to_string()
}

fn apply_inline_formatting(text: &str, font_weight: i32, strikethrough: i32, link: Option<&str>) -> String {
    if text.is_empty() {
        return String::new();
    }

    let mut result = text.to_string();

    // Apply formatting wrappers
    match font_weight {
        1 => result = format!("**{}**", result),     // bold
        2 => result = format!("*{}*", result),        // italic
        3 => result = format!("***{}***", result),    // bold + italic
        _ => {}
    }

    if strikethrough == 1 {
        result = format!("~~{}~~", result);
    }

    if let Some(url) = link {
        result = format!("[{}]({})", result, url);
    }

    result
}

// ── Export (AppleScript) ──

fn build_export_html(html: &str) -> String {
    html.trim().to_string()
}

#[cfg(target_os = "macos")]
fn run_apple_notes_export(note_body: &str) -> Result<String, String> {
    let script_lines = [
        "on run argv",
        "set noteBody to item 1 of argv",
        "tell application \"Notes\"",
        "if not running then launch",
        "set targetAccount to default account",
        "if targetAccount is missing value then error \"No default Notes account found.\"",
        "set targetFolder to default folder of targetAccount",
        "if targetFolder is missing value then error \"No default Notes folder found.\"",
        "set createdNote to make new note at targetFolder with properties {body:noteBody}",
        "show createdNote",
        "return id of createdNote",
        "end tell",
        "end run",
    ];

    let mut command = Command::new("osascript");
    for line in script_lines {
        command.arg("-e").arg(line);
    }
    command.arg("--").arg(note_body);

    let output = command
        .output()
        .map_err(|e| format!("Failed to launch AppleScript for Notes export: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("Failed to export note to Apple Notes: {}", stderr));
    }

    let note_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if note_id.is_empty() {
        return Err("Apple Notes export did not return a note id".to_string());
    }

    Ok(note_id)
}

#[cfg(not(target_os = "macos"))]
fn run_apple_notes_export(_note_body: &str) -> Result<String, String> {
    Err("Apple Notes integration is only available on macOS".to_string())
}

// ── Linked import helpers ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedNoteResult {
    pub path: String,
    pub folder: String,
    pub filename: String,
    pub markdown: String,
}

pub fn get_apple_note_mod_date(conn: &Connection, note_id: i64) -> Result<f64, String> {
    conn.query_row(
        "SELECT ZMODIFICATIONDATE1 FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ?1",
        [note_id],
        |row| row.get::<_, Option<f64>>(0),
    )
    .map(|opt| opt.unwrap_or(0.0))
    .map_err(|e| format!("Failed to read modification date: {}", e))
}

// ── Tauri commands ──

#[tauri::command]
pub fn list_apple_notes() -> Result<Vec<AppleNoteEntry>, String> {
    list_apple_notes_inner()
}

#[tauri::command]
pub fn import_apple_note(note_id: i64) -> Result<String, String> {
    import_apple_note_inner(note_id)
}

#[tauri::command]
pub fn import_and_link_apple_note(
    note_id: i64,
    folder: String,
    sync_state: State<'_, AppleNotesSyncState>,
    index: State<'_, NoteIndex>,
    emb_index: State<'_, EmbeddingIndex>,
) -> Result<ImportedNoteResult, String> {
    sync_state.ensure_loaded();

    // Check if already linked — but only if the target file still exists
    if let Some(existing) = sync_state.get_link_by_id(note_id) {
        if std::path::Path::new(&existing.stik_path).exists() {
            return Err(format!(
                "ALREADY_LINKED:{}:{}",
                existing.stik_folder, existing.stik_path
            ));
        }
        // Stale link (file deleted) — remove and re-import
        sync_state.remove_link(note_id);
    }

    let conn = open_readonly_connection()?;
    let markdown = import_apple_note_inner(note_id)?;
    let mod_date = get_apple_note_mod_date(&conn, note_id)?;

    // Save to disk
    let saved = notes::save_note_inner(folder.clone(), markdown.clone())?;
    if saved.path.is_empty() {
        return Err("Note content was empty after import".to_string());
    }

    // Register link
    sync_state.add_link(SyncEntry {
        apple_note_id: note_id,
        stik_path: saved.path.clone(),
        stik_folder: saved.folder.clone(),
        last_synced_mod_date: mod_date,
        imported_at: Local::now().to_rfc3339(),
    });
    sync_state.save()?;

    // Update search index
    index.add(&saved.path, &saved.folder);

    // Build embedding if AI enabled
    if super::settings::load_settings_from_file()
        .map(|s| s.ai_features_enabled)
        .unwrap_or(false)
    {
        if let Some(emb) = embeddings::embed_content(&markdown) {
            emb_index.add_entry(&saved.path, emb);
            let _ = emb_index.save();
        }
    }

    Ok(ImportedNoteResult {
        path: saved.path,
        folder: saved.folder,
        filename: saved.filename,
        markdown,
    })
}

#[tauri::command]
pub fn export_to_apple_notes(html: String) -> Result<AppleNotesExportResult, String> {
    let note_body = build_export_html(&html);
    if note_body.is_empty() {
        return Err("Cannot export an empty note".to_string());
    }

    let note_id = run_apple_notes_export(&note_body)?;
    Ok(AppleNotesExportResult { note_id })
}

#[tauri::command]
pub fn open_full_disk_access_settings() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn check_apple_notes_access() -> Result<bool, String> {
    let conn = open_readonly_connection();
    match conn {
        Ok(_) => Ok(true),
        Err(e) if e.starts_with("FULL_DISK_ACCESS_REQUIRED") => Ok(false),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_note(text: &str, runs: Vec<proto::AttributeRun>) -> proto::Note {
        proto::Note {
            note_text: Some(text.to_string()),
            attribute_run: runs,
        }
    }

    fn simple_run(length: i32) -> proto::AttributeRun {
        proto::AttributeRun {
            length: Some(length),
            paragraph_style: None,
            font: None,
            font_weight: None,
            underlined: None,
            strikethrough: None,
            superscript: None,
            link: None,
            color: None,
            attachment_info: None,
        }
    }

    fn styled_run(length: i32, style_type: i32) -> proto::AttributeRun {
        proto::AttributeRun {
            length: Some(length),
            paragraph_style: Some(proto::ParagraphStyle {
                style_type: Some(style_type),
                alignment: None,
                indent_amount: None,
                checklist: None,
            }),
            font: None,
            font_weight: None,
            underlined: None,
            strikethrough: None,
            superscript: None,
            link: None,
            color: None,
            attachment_info: None,
        }
    }

    fn checklist_run(length: i32, done: bool) -> proto::AttributeRun {
        proto::AttributeRun {
            length: Some(length),
            paragraph_style: Some(proto::ParagraphStyle {
                style_type: Some(103),
                alignment: None,
                indent_amount: None,
                checklist: Some(proto::Checklist {
                    uuid: None,
                    done: Some(if done { 1 } else { 0 }),
                }),
            }),
            font: None,
            font_weight: None,
            underlined: None,
            strikethrough: None,
            superscript: None,
            link: None,
            color: None,
            attachment_info: None,
        }
    }

    #[test]
    fn plain_text_note() {
        let note = make_note("Hello world", vec![simple_run(11)]);
        assert_eq!(protobuf_to_markdown(&note), "Hello world");
    }

    #[test]
    fn title_and_body() {
        // Title line + newline + body
        let note = make_note(
            "My Title\nSome body text",
            vec![
                styled_run(9, 0),   // "My Title\n" (title)
                simple_run(14),      // "Some body text"
            ],
        );
        let md = protobuf_to_markdown(&note);
        assert!(md.starts_with("My Title"));
        assert!(md.contains("Some body text"));
    }

    #[test]
    fn headings() {
        let note = make_note(
            "Title\nHeading\nSubheading\n",
            vec![
                styled_run(6, 0),   // "Title\n"
                styled_run(8, 1),   // "Heading\n"
                styled_run(11, 2),  // "Subheading\n"
            ],
        );
        let md = protobuf_to_markdown(&note);
        assert!(md.contains("## Heading"));
        assert!(md.contains("### Subheading"));
    }

    #[test]
    fn bullet_list() {
        let note = make_note(
            "Item one\nItem two\n",
            vec![
                styled_run(9, 100),  // "Item one\n"
                styled_run(9, 100),  // "Item two\n"
            ],
        );
        let md = protobuf_to_markdown(&note);
        assert!(md.contains("- Item one"));
        assert!(md.contains("- Item two"));
    }

    #[test]
    fn numbered_list() {
        let note = make_note(
            "First\nSecond\n",
            vec![
                styled_run(6, 102),  // "First\n"
                styled_run(7, 102),  // "Second\n"
            ],
        );
        let md = protobuf_to_markdown(&note);
        assert!(md.contains("1. First"));
        assert!(md.contains("2. Second"));
    }

    #[test]
    fn checklist() {
        let note = make_note(
            "Done task\nOpen task\n",
            vec![
                checklist_run(10, true),   // "Done task\n"
                checklist_run(10, false),  // "Open task\n"
            ],
        );
        let md = protobuf_to_markdown(&note);
        assert!(md.contains("- [x] Done task"));
        assert!(md.contains("- [ ] Open task"));
    }

    #[test]
    fn bold_and_italic() {
        let note = make_note("bold text", vec![{
            let mut run = simple_run(9);
            run.font_weight = Some(1);
            run
        }]);
        assert_eq!(protobuf_to_markdown(&note), "**bold text**");

        let note = make_note("italic text", vec![{
            let mut run = simple_run(11);
            run.font_weight = Some(2);
            run
        }]);
        assert_eq!(protobuf_to_markdown(&note), "*italic text*");
    }

    #[test]
    fn strikethrough() {
        let note = make_note("deleted", vec![{
            let mut run = simple_run(7);
            run.strikethrough = Some(1);
            run
        }]);
        assert_eq!(protobuf_to_markdown(&note), "~~deleted~~");
    }

    #[test]
    fn link_formatting() {
        let note = make_note("click here", vec![{
            let mut run = simple_run(10);
            run.link = Some("https://example.com".to_string());
            run
        }]);
        assert_eq!(
            protobuf_to_markdown(&note),
            "[click here](https://example.com)"
        );
    }

    #[test]
    fn code_block() {
        let note = make_note(
            "Title\nlet x = 1\nlet y = 2\n",
            vec![
                styled_run(6, 0),   // "Title\n"
                styled_run(10, 4),  // "let x = 1\n"
                styled_run(10, 4),  // "let y = 2\n"
            ],
        );
        let md = protobuf_to_markdown(&note);
        assert!(md.contains("```\nlet x = 1"));
        assert!(md.contains("```"), "should close code block");
    }

    #[test]
    fn indented_list() {
        let note = make_note("Sub item\n", vec![{
            proto::AttributeRun {
                length: Some(9),
                paragraph_style: Some(proto::ParagraphStyle {
                    style_type: Some(100),
                    alignment: None,
                    indent_amount: Some(1),
                    checklist: None,
                }),
                font: None,
                font_weight: None,
                underlined: None,
                strikethrough: None,
                superscript: None,
                link: None,
                color: None,
                attachment_info: None,
            }
        }]);
        let md = protobuf_to_markdown(&note);
        assert!(md.contains("  - Sub item"));
    }

    #[test]
    fn cf_timestamp_conversion() {
        // 2024-01-01 00:00:00 UTC = 1704067200 unix
        // CF timestamp = 1704067200 - 978307200 = 725760000
        let iso = cf_timestamp_to_iso(725_760_000.0);
        assert_eq!(iso, "2024-01-01T00:00:00Z");
    }

    #[test]
    fn export_html_trims() {
        assert_eq!(build_export_html("  <p>Hi</p>  "), "<p>Hi</p>");
    }
}
