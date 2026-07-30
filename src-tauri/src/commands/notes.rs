use base64::Engine;
use chrono::{DateTime, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

use super::analytics;
use super::embeddings::{self, EmbeddingIndex};
use super::folders::get_stik_folder;
use super::git_share;
use super::index::NoteIndex;
use crate::state::{AppState, LastSavedNote};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteSaved {
    pub path: String,
    pub folder: String,
    pub filename: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteInfo {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub content: String,
    pub created: String,
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub title: String,
    pub snippet: String,
    pub created: String,
    #[serde(default)]
    pub locked: bool,
}

/// Generate a slug from content (first 5 words, max 40 chars)
fn generate_slug(content: &str) -> String {
    let cleaned: String = content
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    let slug: String = cleaned
        .split_whitespace()
        .take(5)
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();

    if slug.len() > 40 {
        let mut end = 40;
        while end > 0 && !slug.is_char_boundary(end) {
            end -= 1;
        }
        slug[..end].to_string()
    } else if slug.is_empty() {
        "note".to_string()
    } else {
        slug
    }
}

/// Build the on-disk name for a new note.
///
/// The default `YYYYMMDD-HHMMSS-<slug>-<uuid>.md` sorts chronologically in any
/// file browser, can never collide, and carries the capture date that stats and
/// On This Day read straight off the name.
///
/// With `simple_filenames` the note is just `<slug>.md`, which reads far better
/// in Finder and Obsidian. The trade is that the name no longer carries a date,
/// so those features fall back to the file's modification time, and a unique
/// name has to be claimed rather than generated.
fn generate_filename(content: &str, folder_path: &Path) -> String {
    let slug = generate_slug(content);

    if simple_filenames_enabled() {
        return claim_simple_filename(&slug, folder_path);
    }

    let timestamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let suffix = &uuid::Uuid::new_v4().to_string()[..4];
    format!("{}-{}-{}.md", timestamp, slug, suffix)
}

fn simple_filenames_enabled() -> bool {
    super::settings::load_settings_from_file()
        .map(|s| s.simple_filenames)
        .unwrap_or(false)
}

/// `note.md`, then `note-2.md`, `note-3.md`…
///
/// Creates the file as it goes rather than merely testing for absence: two
/// captures in the same instant would both see the name free and the second
/// would silently overwrite the first. `create_new` is atomic, so exactly one
/// caller can win a given name.
fn claim_simple_filename(slug: &str, folder_path: &Path) -> String {
    for n in 1..=999 {
        let candidate = if n == 1 {
            format!("{}.md", slug)
        } else {
            format!("{}-{}.md", slug, n)
        };

        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(folder_path.join(&candidate))
        {
            Ok(_) => return candidate,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            // Anything else (permissions, missing dir) is the real write's
            // problem to report, with a better message than we could give.
            Err(_) => return candidate,
        }
    }

    format!("{}-{}.md", slug, &uuid::Uuid::new_v4().to_string()[..4])
}

/// The note's capture date: the filename prefix when it has one, otherwise the
/// file's modification time. Simple filenames carry no date, so the filesystem
/// is the only source for them.
pub fn note_date(path: &Path, filename: &str) -> Option<NaiveDate> {
    if let Some(segment) = filename.split('-').next() {
        if segment.len() == 8 {
            if let Ok(date) = NaiveDate::parse_from_str(segment, "%Y%m%d") {
                return Some(date);
            }
        }
    }

    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Local>::from(modified).date_naive())
}

fn is_break_placeholder_line(line: &str) -> bool {
    line.eq_ignore_ascii_case("<br>")
        || line.eq_ignore_ascii_case("<br/>")
        || line.eq_ignore_ascii_case("<br />")
}

pub fn is_effectively_empty_markdown(content: &str) -> bool {
    content.lines().all(|line| {
        let trimmed = line.trim();
        trimmed.is_empty() || is_break_placeholder_line(trimmed)
    })
}

/// Core save logic, callable from other Rust modules without Tauri State
pub fn save_note_inner(folder: String, content: String) -> Result<NoteSaved, String> {
    if !folder.is_empty() {
        super::folders::validate_name(&folder)?;
    }

    // Don't save empty notes
    if is_effectively_empty_markdown(&content) {
        return Ok(NoteSaved {
            path: String::new(),
            folder,
            filename: String::new(),
        });
    }

    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(&folder);

    // Ensure folder exists
    super::storage::ensure_dir(&folder_path.to_string_lossy())?;

    // Generate filename and write
    let filename = generate_filename(&content, &folder_path);
    let file_path = folder_path.join(&filename);

    super::storage::write_file(&file_path.to_string_lossy(), &content)?;

    Ok(NoteSaved {
        path: file_path.to_string_lossy().to_string(),
        folder,
        filename,
    })
}

/// Post-save side effects: analytics, indexing, embeddings, last_saved_note tracking.
/// Callable from both the Tauri command and the clipboard capture shortcut handler.
pub fn post_save_processing(app: &AppHandle, result: &NoteSaved, content: &str) {
    if result.path.is_empty() {
        return;
    }

    let word_count = content.split_whitespace().count();
    analytics::track(
        "note_created",
        serde_json::json!({ "word_count": word_count }),
    );

    let index = app.state::<NoteIndex>();
    index.add(&result.path, &result.folder);
    git_share::notify_note_changed(&result.folder);

    if super::settings::load_settings_from_file()
        .map(|s| s.ai_features_enabled)
        .unwrap_or(false)
    {
        let emb_index = app.state::<EmbeddingIndex>();
        if let Some(emb) = embeddings::embed_content(content) {
            emb_index.add_entry(&result.path, emb);
            let _ = emb_index.save();
        }
    }

    let state = app.state::<AppState>();
    let mut last = state
        .last_saved_note
        .lock()
        .unwrap_or_else(|e: std::sync::PoisonError<_>| e.into_inner());
    *last = Some(LastSavedNote {
        path: result.path.clone(),
        folder: result.folder.clone(),
    });
}

#[tauri::command]
pub fn save_note(
    app: AppHandle,
    folder: String,
    content: String,
    _index: State<'_, NoteIndex>,
    _emb_index: State<'_, EmbeddingIndex>,
) -> Result<NoteSaved, String> {
    let result = save_note_inner(folder, content.clone())?;
    post_save_processing(&app, &result, &content);
    Ok(result)
}

#[tauri::command]
pub fn list_notes(
    folder: Option<String>,
    index: State<'_, NoteIndex>,
) -> Result<Vec<NoteInfo>, String> {
    let entries = index.list(folder.as_deref())?;

    Ok(entries
        .into_iter()
        .map(|e| NoteInfo {
            locked: e.locked,
            path: e.path,
            filename: e.filename,
            folder: e.folder,
            content: e.preview,
            created: e.created,
        })
        .collect())
}

#[tauri::command]
pub fn search_notes(
    query: String,
    folder: Option<String>,
    index: State<'_, NoteIndex>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let results = index.search(&query, folder.as_deref())?;

    Ok(results
        .into_iter()
        .map(|(entry, snippet)| SearchResult {
            locked: entry.locked,
            path: entry.path,
            filename: entry.filename,
            folder: entry.folder,
            title: entry.title,
            snippet,
            created: entry.created,
        })
        .collect())
}

pub fn get_note_content_inner(path: &str) -> Result<String, String> {
    let stik_folder = get_stik_folder()?;
    let note_path = PathBuf::from(path);

    // Canonicalize both sides to handle symlinks (/tmp → /private/tmp),
    // trailing slashes, and relative-component differences that would
    // otherwise break PathBuf::starts_with's component-wise compare.
    // Falls back to the raw path when canonicalize fails (e.g. the file
    // hasn't been downloaded yet in iCloud), so the existence check below
    // still reports a useful error.
    let canonical_stik = stik_folder
        .canonicalize()
        .unwrap_or_else(|_| stik_folder.clone());
    let canonical_note = note_path
        .canonicalize()
        .unwrap_or_else(|_| note_path.clone());

    if !canonical_note.starts_with(&canonical_stik) {
        return Err(format!(
            "Note is outside the Stik folder.\n  note: {}\n  root: {}",
            note_path.display(),
            stik_folder.display()
        ));
    }
    if !super::storage::path_exists(path) {
        return Err(format!("Note file not found: {}", note_path.display()));
    }

    super::storage::read_file(path)
}

#[tauri::command]
pub fn get_note_content(path: String) -> Result<String, String> {
    get_note_content_inner(&path)
}

#[tauri::command]
pub fn update_note(
    path: String,
    content: String,
    index: State<'_, NoteIndex>,
    emb_index: State<'_, EmbeddingIndex>,
) -> Result<NoteSaved, String> {
    let stik_folder = get_stik_folder()?;
    let note_path = PathBuf::from(&path);
    let in_stik_folder = note_path.starts_with(&stik_folder);

    // For viewing notes opened from Finder, allow saving external markdown files too.
    if !in_stik_folder {
        let is_markdown = note_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
            .unwrap_or(false);
        if !is_markdown {
            return Err(
                "Invalid path: only markdown files can be edited outside Stik folder".to_string(),
            );
        }
    }

    // Check file exists
    if !super::storage::path_exists(&path) {
        return Err("Note file does not exist".to_string());
    }

    // In Stik-managed notes, empty content deletes the note.
    if in_stik_folder && is_effectively_empty_markdown(&content) {
        super::storage::delete_file(&path).map_err(|e| format!("Failed to delete note: {}", e))?;
        index.remove(&path);
        emb_index.remove_entry(&path);
        let _ = emb_index.save();
        return Ok(NoteSaved {
            path: String::new(),
            folder: String::new(),
            filename: String::new(),
        });
    }

    // Get folder name from path
    let folder = note_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let filename = note_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Write updated content
    super::storage::write_file(&path, &content)?;

    let word_count = content.split_whitespace().count();
    analytics::track(
        "note_updated",
        serde_json::json!({ "word_count": word_count }),
    );

    if in_stik_folder {
        // Re-index with updated content
        index.add(&path, &folder);
        git_share::notify_note_changed(&folder);
        if super::settings::load_settings_from_file()
            .map(|s| s.ai_features_enabled)
            .unwrap_or(false)
        {
            if let Some(emb) = embeddings::embed_content(&content) {
                emb_index.add_entry(&path, emb);
                let _ = emb_index.save();
            }
        }
    }

    Ok(NoteSaved {
        path: note_path.to_string_lossy().to_string(),
        folder,
        filename,
    })
}

#[tauri::command]
pub fn delete_note(
    app: AppHandle,
    path: String,
    index: State<'_, NoteIndex>,
    emb_index: State<'_, EmbeddingIndex>,
) -> Result<bool, String> {
    let stik_folder = get_stik_folder()?;
    let note_path = PathBuf::from(&path);

    // Validate path is within Stik folder
    if !note_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }

    // Check file exists
    if !super::storage::path_exists(&path) {
        return Err("Note file does not exist".to_string());
    }

    let folder = note_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Delete referenced .assets/ images
    if let Ok(content) = super::storage::read_file(&path) {
        let folder_path = note_path.parent().unwrap_or(&stik_folder);
        delete_note_assets(&content, folder_path);
    }

    // Delete the file
    super::storage::delete_file(&path).map_err(|e| format!("Failed to delete note: {}", e))?;
    analytics::track("note_deleted", serde_json::json!({}));
    index.remove(&path);
    emb_index.remove_entry(&path);
    let _ = emb_index.save();
    git_share::notify_note_changed(&folder);

    // Notify any viewing windows so they can close themselves
    let _ = app.emit("note-deleted", &path);

    Ok(true)
}

#[tauri::command]
pub fn move_note(
    path: String,
    target_folder: String,
    index: State<'_, NoteIndex>,
    emb_index: State<'_, EmbeddingIndex>,
) -> Result<NoteInfo, String> {
    let stik_folder = get_stik_folder()?;
    let source_path = PathBuf::from(&path);
    let source_folder = source_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Validate source path is within Stik folder
    if !source_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }

    // Check source file exists
    if !super::storage::path_exists(&path) {
        return Err("Note file does not exist".to_string());
    }

    // Ensure target folder exists
    let target_folder_path = stik_folder.join(&target_folder);
    super::storage::ensure_dir(&target_folder_path.to_string_lossy())?;

    // Get filename from source
    let filename = source_path
        .file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .to_string();

    // Build target path
    let target_path = target_folder_path.join(&filename);

    // Read content before moving
    let content = super::storage::read_file(&path)?;

    // Move referenced .assets/ images to the target folder
    if source_folder != target_folder {
        let source_folder_path = stik_folder.join(&source_folder);
        move_note_assets(&content, &source_folder_path, &target_folder_path);
    }

    // Move the file
    super::storage::move_file(&path, &target_path.to_string_lossy())
        .map_err(|e| format!("Failed to move note: {}", e))?;

    let new_path_str = target_path.to_string_lossy().to_string();
    index.move_entry(&path, &new_path_str, &target_folder);
    emb_index.move_entry(&path, &new_path_str);
    let _ = emb_index.save();
    git_share::notify_note_changed(&source_folder);
    git_share::notify_note_changed(&target_folder);

    // Extract created date from filename
    let created = filename.split('-').take(2).collect::<Vec<_>>().join("-");

    let locked = super::note_lock::is_locked_content(&content);
    Ok(NoteInfo {
        path: new_path_str,
        filename,
        folder: target_folder,
        content,
        created,
        locked,
    })
}

/// Detect image format from a data-URL prefix or raw base64 magic bytes.
/// Returns file extension (png, jpg, gif, webp). Defaults to "png".
fn detect_image_ext(data: &str) -> &'static str {
    // Check data-URL mime type first
    let lower = data.to_ascii_lowercase();
    if lower.starts_with("data:image/jpeg") || lower.starts_with("data:image/jpg") {
        return "jpg";
    }
    if lower.starts_with("data:image/gif") {
        return "gif";
    }
    if lower.starts_with("data:image/webp") {
        return "webp";
    }
    if lower.starts_with("data:image/png") {
        return "png";
    }
    "png"
}

/// Extract `.assets/<filename>` references from markdown content.
fn extract_asset_filenames(content: &str) -> Vec<String> {
    let re_pattern = ".assets/";
    let mut filenames = Vec::new();
    for line in content.lines() {
        let mut search = line;
        while let Some(idx) = search.find(re_pattern) {
            let after = &search[idx + re_pattern.len()..];
            // Filename ends at ), ", ', whitespace, or end of string
            let end = after
                .find(|c: char| c == ')' || c == '"' || c == '\'' || c.is_whitespace())
                .unwrap_or(after.len());
            let name = &after[..end];
            if !name.is_empty() {
                filenames.push(name.to_string());
            }
            search = &after[end..];
        }
    }
    filenames
}

/// Move referenced `.assets/` files from source folder to target folder.
fn move_note_assets(
    content: &str,
    source_folder: &std::path::Path,
    target_folder: &std::path::Path,
) {
    let filenames = extract_asset_filenames(content);
    if filenames.is_empty() {
        return;
    }

    let source_assets = source_folder.join(".assets");
    let target_assets = target_folder.join(".assets");

    if !super::storage::path_exists(&source_assets.to_string_lossy()) {
        return;
    }

    for name in filenames {
        let src = source_assets.join(&name);
        let src_str = src.to_string_lossy();
        if !super::storage::path_exists(&src_str) {
            continue;
        }
        if super::storage::ensure_dir(&target_assets.to_string_lossy()).is_err() {
            continue;
        }
        let dst = target_assets.join(&name);
        // Copy + remove instead of rename (works across volumes and iCloud)
        if super::storage::copy_file(&src_str, &dst.to_string_lossy()).is_ok() {
            let _ = super::storage::delete_file(&src_str);
        }
    }
}

/// Delete `.assets/` files referenced by a note.
fn delete_note_assets(content: &str, folder_path: &std::path::Path) {
    let filenames = extract_asset_filenames(content);
    let assets_dir = folder_path.join(".assets");
    for name in filenames {
        let path = assets_dir.join(&name);
        let _ = super::storage::delete_file(&path.to_string_lossy());
    }
}

fn is_supported_image_ext(ext: &str) -> bool {
    matches!(
        ext,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif"
    )
}

/// Save an image (base64-encoded) into the folder's `.assets/` directory.
/// Returns `(absolute_path, relative_markdown_ref)`.
#[tauri::command]
pub fn save_note_image(folder: String, image_data: String) -> Result<(String, String), String> {
    super::folders::validate_name(&folder)?;

    let ext = detect_image_ext(&image_data);

    // Strip the data-URL prefix if present
    let raw_b64 = if let Some(idx) = image_data.find(",") {
        &image_data[idx + 1..]
    } else {
        &image_data
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64)
        .map_err(|e| format!("Invalid base64: {}", e))?;

    let stik_folder = get_stik_folder()?;
    let assets_dir = stik_folder.join(&folder).join(".assets");
    super::storage::ensure_dir(&assets_dir.to_string_lossy())
        .map_err(|e| format!("Failed to create .assets dir: {}", e))?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let file_path = assets_dir.join(&filename);

    super::storage::write_bytes(&file_path.to_string_lossy(), &bytes)
        .map_err(|e| format!("Failed to write image: {}", e))?;

    let abs = file_path.to_string_lossy().to_string();
    let rel = format!(".assets/{}", filename);
    Ok((abs, rel))
}

#[tauri::command]
pub fn save_note_image_from_path(
    folder: String,
    file_path: String,
) -> Result<(String, String), String> {
    super::folders::validate_name(&folder)?;

    let source_path = PathBuf::from(&file_path);
    if !source_path.is_absolute() {
        return Err("Image path must be absolute".to_string());
    }
    if !source_path.exists() || !source_path.is_file() {
        return Err("Dropped image file does not exist".to_string());
    }

    let ext = source_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| "Image file extension is missing".to_string())?;
    if !is_supported_image_ext(&ext) {
        return Err("Dropped file is not a supported image".to_string());
    }

    let stik_folder = get_stik_folder()?;
    let assets_dir = stik_folder.join(&folder).join(".assets");
    super::storage::ensure_dir(&assets_dir.to_string_lossy())
        .map_err(|e| format!("Failed to create .assets dir: {}", e))?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let destination_path = assets_dir.join(&filename);
    super::storage::copy_file(&file_path, &destination_path.to_string_lossy())
        .map_err(|e| format!("Failed to copy dropped image: {}", e))?;

    let abs = destination_path.to_string_lossy().to_string();
    let rel = format!(".assets/{}", filename);
    Ok((abs, rel))
}

#[cfg(test)]
mod tests {
    use super::{claim_simple_filename, is_effectively_empty_markdown, note_date};
    use chrono::{Local, NaiveDate};

    fn temp_folder(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("stik-fname-{label}-{nanos}"));
        std::fs::create_dir_all(&dir).expect("temp dir should be creatable");
        dir
    }

    #[test]
    fn simple_names_disambiguate_by_counting_up() {
        let dir = temp_folder("collide");

        assert_eq!(
            claim_simple_filename("meeting-notes", &dir),
            "meeting-notes.md"
        );
        assert_eq!(
            claim_simple_filename("meeting-notes", &dir),
            "meeting-notes-2.md"
        );
        assert_eq!(
            claim_simple_filename("meeting-notes", &dir),
            "meeting-notes-3.md"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn claiming_a_name_reserves_it_so_a_racing_save_cannot_overwrite() {
        // Guards against check-then-write: two captures in the same instant
        // would both see the name free, and the second would clobber the first.
        let dir = temp_folder("reserve");
        let first = claim_simple_filename("note", &dir);
        assert!(
            dir.join(&first).exists(),
            "claimed name should exist on disk"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn note_date_reads_the_filename_prefix_without_touching_disk() {
        let date = note_date(
            std::path::Path::new("/nonexistent/20260413-160431-hello-0e29.md"),
            "20260413-160431-hello-0e29.md",
        );
        assert_eq!(date, NaiveDate::from_ymd_opt(2026, 4, 13));
    }

    #[test]
    fn note_date_falls_back_to_mtime_for_a_simple_filename() {
        let dir = temp_folder("mtime");
        let file = dir.join("meeting-notes.md");
        std::fs::write(&file, "hi").unwrap();

        let date = note_date(&file, "meeting-notes.md").expect("mtime should resolve");
        assert_eq!(date, Local::now().date_naive());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn note_date_is_none_without_a_prefix_or_a_file() {
        assert_eq!(
            note_date(std::path::Path::new("/nonexistent/x.md"), "x.md"),
            None
        );
    }

    #[test]
    fn placeholder_breaks_only_are_treated_as_empty() {
        assert!(is_effectively_empty_markdown("<br>\n\n<br />\n"));
    }

    #[test]
    fn real_content_with_placeholders_is_not_empty() {
        assert!(!is_effectively_empty_markdown("hello\n\n<br>\n"));
    }
}
