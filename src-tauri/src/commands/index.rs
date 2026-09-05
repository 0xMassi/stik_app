use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use chrono::{DateTime, Local};

use super::folders::get_stik_folder;

const PREVIEW_LENGTH: usize = 150;

#[cfg(test)]
#[path = "index_benchmarks.rs"]
mod benchmarks;

#[derive(Debug, Clone)]
pub struct NoteEntry {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub title: String,
    pub preview: String,
    pub created: String,
    pub locked: bool,
}

#[derive(Debug, Clone)]
struct SearchDocument {
    original: String,
    normalized: String,
}

#[derive(Debug, Clone)]
struct IndexedNote {
    entry: NoteEntry,
    // Locked-note ciphertext is intentionally never retained as searchable text.
    search: Option<SearchDocument>,
}

pub struct NoteIndex {
    entries: Mutex<HashMap<String, IndexedNote>>,
}

impl Default for NoteIndex {
    fn default() -> Self {
        Self::new()
    }
}

impl NoteIndex {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub fn build(&self) -> Result<(), String> {
        let stik_folder = get_stik_folder()?;
        let mut new_entries = HashMap::new();

        // Recursively index every .md under the Stik root (Obsidian-style nesting).
        index_dir(&stik_folder, &stik_folder, &mut new_entries);

        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        *entries = new_entries;

        Ok(())
    }

    pub fn add(&self, path: &str, folder: &str) {
        let note_path = PathBuf::from(path);
        let folder_name = folder.to_string();
        if let Some(indexed) = read_indexed_note(&note_path, &folder_name) {
            let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
            entries.insert(indexed.entry.path.clone(), indexed);
        }
    }

    pub fn remove(&self, path: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.remove(path);
    }

    /// Remove a folder and all of its descendants (used when deleting a folder).
    pub fn remove_by_folder_tree(&self, folder: &str) {
        let prefix = format!("{}/", folder);
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain(|_, indexed| {
            indexed.entry.folder != folder && !indexed.entry.folder.starts_with(&prefix)
        });
    }

    pub fn move_entry(&self, old_path: &str, new_path: &str, new_folder: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(mut indexed) = entries.remove(old_path) {
            indexed.entry.path = new_path.to_string();
            indexed.entry.folder = new_folder.to_string();
            entries.insert(new_path.to_string(), indexed);
        }
    }

    /// Handle external changes from iCloud sync — re-index specific paths.
    /// Called when DarwinKit pushes icloud.files_changed notifications.
    pub fn notify_external_change(&self, paths: &[String]) {
        let stik_folder = match get_stik_folder() {
            Ok(f) => f,
            Err(_) => return,
        };

        let mut changes = Vec::new();

        for path_str in paths {
            let path = PathBuf::from(path_str);

            // Only index .md files within the Stik root
            if !path.starts_with(&stik_folder) || !path_str.ends_with(".md") {
                continue;
            }

            // Folder = parent path relative to the Stik root (supports nesting).
            let folder = super::folders::note_folder(&stik_folder, &path);

            // Try to re-index — if file was deleted, remove from index
            if super::storage::path_exists(path_str) {
                changes.push((path_str.clone(), read_indexed_note(&path, &folder)));
            } else {
                changes.push((path_str.clone(), None));
            }
        }

        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        for (path, indexed) in changes {
            if let Some(indexed) = indexed {
                entries.insert(indexed.entry.path.clone(), indexed);
            } else {
                entries.remove(&path);
            }
        }
    }

    pub fn get(&self, path: &str) -> Option<NoteEntry> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.get(path).map(|indexed| indexed.entry.clone())
    }

    pub fn len(&self) -> usize {
        self.entries.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn list(&self, folder: Option<&str>) -> Result<Vec<NoteEntry>, String> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());

        let mut result: Vec<NoteEntry> = entries
            .values()
            .filter(|indexed| folder.is_none_or(|f| indexed.entry.folder == f))
            .map(|indexed| indexed.entry.clone())
            .collect();

        result.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(result)
    }

    pub fn search(
        &self,
        query: &str,
        folder: Option<&str>,
    ) -> Result<Vec<(NoteEntry, String)>, String> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let query_lower = query.to_lowercase();

        let mut results: Vec<(NoteEntry, String)> = Vec::new();

        for indexed in entries.values() {
            let entry = &indexed.entry;
            if entry.locked {
                continue; // Can't search encrypted content
            }
            if let Some(f) = folder {
                if entry.folder != f {
                    continue;
                }
            }

            let Some(search) = &indexed.search else {
                continue;
            };
            // `contains` rejects misses faster than `find` in our release benchmarks.
            if !search.normalized.contains(&query_lower) {
                continue;
            }
            if let Some(pos) = search.normalized.find(&query_lower) {
                let snippet = extract_snippet(&search.original, pos, query.len());
                results.push((entry.clone(), snippet));
            }
        }

        results.sort_by(|a, b| b.0.created.cmp(&a.0.created));
        Ok(results)
    }
}

#[tauri::command]
pub fn rebuild_index(index: tauri::State<'_, NoteIndex>) -> Result<bool, String> {
    index.build()?;
    Ok(true)
}

/// Recursively index every `.md` file under `dir`, skipping hidden directories
/// (`.assets`, `.git`, …). `folder` is each note's parent path relative to root.
fn index_dir(stik_root: &Path, dir: &Path, into: &mut HashMap<String, IndexedNote>) {
    let entries = match super::storage::list_dir(&dir.to_string_lossy()) {
        Ok(e) => e,
        Err(_) => return,
    };
    for e in entries {
        if e.is_directory {
            if e.name.starts_with('.') {
                continue;
            }
            index_dir(stik_root, &dir.join(&e.name), into);
        } else if e.name.ends_with(".md") {
            let path = dir.join(&e.name);
            let folder = super::folders::note_folder(stik_root, &path);
            if let Some(indexed) = read_indexed_note(&path, &folder) {
                into.insert(indexed.entry.path.clone(), indexed);
            }
        }
    }
}

fn read_indexed_note(path: &PathBuf, folder: &str) -> Option<IndexedNote> {
    let path_str = path.to_string_lossy();
    let content = super::storage::read_file(&path_str).ok()?;
    let locked = super::note_lock::is_locked_content(&content);

    let (title, preview, search) = if locked {
        // Derive title from filename: YYYYMMDD-HHMMSS-slug-uuid.md → slug
        let fname = path.file_stem().unwrap_or_default().to_string_lossy();
        let title = fname
            .splitn(3, '-') // ["YYYYMMDD", "HHMMSS", "slug-uuid"]
            .nth(2) // "slug-uuid"
            .and_then(|rest| rest.rfind('-').map(|i| &rest[..i])) // drop UUID suffix
            .filter(|s| !s.is_empty())
            .map(|s| s.replace('-', " "))
            .unwrap_or_else(|| fname.to_string());
        (title, String::new(), None)
    } else {
        let title = extract_title(&content);
        let preview = if content.len() > PREVIEW_LENGTH {
            let mut end = PREVIEW_LENGTH;
            while end > 0 && !content.is_char_boundary(end) {
                end -= 1;
            }
            content[..end].to_string()
        } else {
            content.clone()
        };
        let normalized = content.to_lowercase();
        (
            title,
            preview,
            Some(SearchDocument {
                original: content,
                normalized,
            }),
        )
    };

    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let created = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(format_timestamp)
        .unwrap_or_else(|_| filename.split('-').take(2).collect::<Vec<_>>().join("-"));

    Some(IndexedNote {
        entry: NoteEntry {
            path: path.to_string_lossy().to_string(),
            filename,
            folder: folder.to_string(),
            title,
            preview,
            created,
            locked,
        },
        search,
    })
}

fn format_timestamp(time: SystemTime) -> String {
    let dt: DateTime<Local> = time.into();
    dt.format("%Y%m%d-%H%M%S").to_string()
}

fn is_break_placeholder_line(line: &str) -> bool {
    line.eq_ignore_ascii_case("<br>")
        || line.eq_ignore_ascii_case("<br/>")
        || line.eq_ignore_ascii_case("<br />")
}

fn extract_title(content: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !is_break_placeholder_line(line))
        .map(|line| line.chars().take(120).collect())
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Find the nearest valid UTF-8 char boundary at or before `pos`.
fn floor_char_boundary(s: &str, pos: usize) -> usize {
    let mut i = pos.min(s.len());
    while i > 0 && !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

/// Find the nearest valid UTF-8 char boundary at or after `pos`.
fn ceil_char_boundary(s: &str, pos: usize) -> usize {
    let mut i = pos.min(s.len());
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

fn extract_snippet(content: &str, pos: usize, query_len: usize) -> String {
    let start = ceil_char_boundary(content, pos.saturating_sub(30));
    let end = floor_char_boundary(content, (pos + query_len + 50).min(content.len()));

    let mut snippet = String::new();
    if start > 0 {
        snippet.push_str("...");
    }
    snippet.push_str(&content[start..end].replace('\n', " "));
    if end < content.len() {
        snippet.push_str("...");
    }
    snippet
}

#[cfg(test)]
mod tests {
    use super::{
        extract_title, read_indexed_note, IndexedNote, NoteEntry, NoteIndex, SearchDocument,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn title_uses_first_non_empty_line() {
        assert_eq!(
            extract_title("\n\nFirst title line\nSecond line"),
            "First title line"
        );
    }

    #[test]
    fn title_skips_break_placeholders() {
        assert_eq!(
            extract_title("<br>\n\n<br />\n\nActual title"),
            "Actual title"
        );
    }

    #[test]
    fn title_falls_back_when_content_is_effectively_empty() {
        assert_eq!(extract_title("<br>\n\n"), "Untitled");
    }

    #[test]
    fn note_entry_created_uses_modified_time_not_filename_timestamp() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();

        let test_dir = std::env::temp_dir().join(format!("stik-index-test-{}", unique));
        fs::create_dir_all(&test_dir).expect("create temp test dir");

        let note_path: PathBuf = test_dir.join("20000101-000000-legacy-title.md");
        fs::write(&note_path, "updated content").expect("write note");

        let indexed = read_indexed_note(&note_path, "Inbox").expect("note entry should load");
        assert_ne!(indexed.entry.created, "20000101-000000");

        let _ = fs::remove_file(&note_path);
        let _ = fs::remove_dir(&test_dir);
    }

    #[test]
    fn full_content_search_survives_after_the_source_file_disappears() {
        let test_dir = temp_test_dir("cached-search");
        let note_path = test_dir.join("note.md");
        fs::write(
            &note_path,
            format!("{}deep-search-needle", "padding ".repeat(40)),
        )
        .unwrap();

        let index = NoteIndex::new();
        index.add(note_path.to_str().unwrap(), "Inbox");
        fs::remove_file(&note_path).unwrap();

        let results = index.search("deep-search-needle", None).unwrap();
        assert_eq!(results.len(), 1);

        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn reindexing_replaces_the_cached_full_text() {
        let test_dir = temp_test_dir("updated-search");
        let note_path = test_dir.join("note.md");
        let index = NoteIndex::new();

        fs::write(
            &note_path,
            format!("{}old-deep-needle", "padding ".repeat(40)),
        )
        .unwrap();
        index.add(note_path.to_str().unwrap(), "Inbox");

        fs::write(
            &note_path,
            format!("{}new-deep-needle", "padding ".repeat(40)),
        )
        .unwrap();
        index.add(note_path.to_str().unwrap(), "Inbox");
        fs::remove_file(&note_path).unwrap();

        assert!(index.search("old-deep-needle", None).unwrap().is_empty());
        assert_eq!(index.search("new-deep-needle", None).unwrap().len(), 1);

        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn locked_note_ciphertext_is_not_retained_in_the_search_document() {
        let test_dir = temp_test_dir("locked-search");
        let note_path = test_dir.join("locked.md");
        fs::write(
            &note_path,
            "---stik-locked---\nnonce:dGVzdA==\ndata:c2VjcmV0",
        )
        .unwrap();

        let indexed = read_indexed_note(&note_path, "Private").unwrap();

        assert!(indexed.entry.locked);
        assert!(indexed.search.is_none());
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn search_returns_readable_context_around_the_first_case_insensitive_match() {
        let test_dir = temp_test_dir("search-snippets");
        let note_path = test_dir.join("note.md");
        let index = NoteIndex::new();
        for (content, query, expected) in [
            (
                "Needle\nnext line".into(),
                "NEEDLE".into(),
                "Needle next line".into(),
            ),
            (
                format!("{}Needle\n{}", "a".repeat(40), "b".repeat(60)),
                "needle".into(),
                format!("...{}Needle {}...", "a".repeat(30), "b".repeat(49)),
            ),
            (
                format!("{}needle", "a".repeat(40)),
                "needle".into(),
                format!("...{}needle", "a".repeat(30)),
            ),
            (
                "🌱 Café\nÉQUIPE and more café".into(),
                "CAFÉ".into(),
                "🌱 Café ÉQUIPE and more café".into(),
            ),
            (
                format!("{}needle{}", "🌱".repeat(10), "é".repeat(30)),
                "needle".into(),
                format!("...{}needle{}...", "🌱".repeat(7), "é".repeat(25)),
            ),
            (
                format!("{}tail", "needle".repeat(20)),
                "NEEDLE".repeat(20),
                format!("{}tail", "needle".repeat(20)),
            ),
        ] {
            fs::write(&note_path, content).unwrap();
            index.add(note_path.to_str().unwrap(), "Inbox");

            let results = index.search(&query, None).unwrap();
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].1, expected, "query: {query}");
        }
        fs::remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn search_filters_exact_folders_excludes_locked_notes_and_orders_newest_first() {
        let test_dir = temp_test_dir("search-order");
        let index = NoteIndex::new();
        for (number, (name, folder, content)) in [
            ("older", "Inbox", "A needle in an older note"),
            ("newer", "Inbox", "A NEEDLE in a newer note"),
            ("nested", "Inbox/Project", "A needle in a nested folder"),
            ("other", "Archive", "A needle in another folder"),
            (
                "locked",
                "Inbox",
                "---stik-locked---\nnonce:needle\ndata:needle",
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let note_path = test_dir.join(format!("{name}.md"));
            fs::write(&note_path, content).unwrap();
            fs::File::open(&note_path)
                .unwrap()
                .set_times(fs::FileTimes::new().set_modified(
                    UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000 + number as u64),
                ))
                .unwrap();
            index.add(note_path.to_str().unwrap(), folder);
        }

        let filenames = |folder| {
            index
                .search("needle", folder)
                .unwrap()
                .into_iter()
                .map(|(entry, _)| entry.filename)
                .collect::<Vec<_>>()
        };
        assert_eq!(
            filenames(None),
            ["other.md", "nested.md", "newer.md", "older.md"]
        );
        assert_eq!(filenames(Some("Inbox")), ["newer.md", "older.md"]);
        assert!(filenames(Some("Missing")).is_empty());
        fs::remove_dir_all(test_dir).unwrap();
    }

    #[test]
    fn large_in_memory_search_stays_within_the_smoke_budget() {
        let index = NoteIndex::new();
        {
            let mut entries = index.entries.lock().unwrap();
            for number in 0..10_000 {
                let original = if number == 9_999 {
                    format!("Note {number} contains the unique performance needle")
                } else {
                    format!("Note {number} contains ordinary searchable text")
                };
                entries.insert(
                    format!("/vault/{number}.md"),
                    IndexedNote {
                        entry: NoteEntry {
                            path: format!("/vault/{number}.md"),
                            filename: format!("{number}.md"),
                            folder: "Inbox".to_string(),
                            title: format!("Note {number}"),
                            preview: original.clone(),
                            created: format!("{number:08}"),
                            locked: false,
                        },
                        search: Some(SearchDocument {
                            normalized: original.to_lowercase(),
                            original,
                        }),
                    },
                );
            }
        }

        let started = std::time::Instant::now();
        let results = index.search("unique performance needle", None).unwrap();

        assert_eq!(results.len(), 1);
        assert!(
            started.elapsed() < std::time::Duration::from_millis(250),
            "10k-note in-memory search exceeded the smoke budget"
        );
    }

    fn temp_test_dir(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("stik-index-{label}-{unique}"));
        fs::create_dir_all(&directory).unwrap();
        directory
    }
}
