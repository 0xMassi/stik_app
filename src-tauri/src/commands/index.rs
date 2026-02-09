use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use super::folders::get_stik_folder;

const PREVIEW_LENGTH: usize = 150;
const STALE_SECONDS: u64 = 60;

#[derive(Debug, Clone)]
pub struct NoteEntry {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub title: String,
    pub preview: String,
    pub created: String,
    pub content_len: usize,
}

pub struct NoteIndex {
    entries: Mutex<HashMap<String, NoteEntry>>,
    built_at: Mutex<Option<Instant>>,
}

impl NoteIndex {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            built_at: Mutex::new(None),
        }
    }

    pub fn build(&self) -> Result<(), String> {
        let stik_folder = get_stik_folder()?;
        let mut new_entries = HashMap::new();

        let folders: Vec<PathBuf> = fs::read_dir(&stik_folder)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.path())
            .collect();

        for folder_path in folders {
            let folder_name = folder_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if let Ok(entries) = fs::read_dir(&folder_path) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "md") {
                        if let Some(note_entry) = read_note_entry(&path, &folder_name) {
                            new_entries.insert(note_entry.path.clone(), note_entry);
                        }
                    }
                }
            }
        }

        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        *entries = new_entries;

        let mut built_at = self.built_at.lock().unwrap_or_else(|e| e.into_inner());
        *built_at = Some(Instant::now());

        Ok(())
    }

    fn ensure_fresh(&self) -> Result<(), String> {
        let built_at = self.built_at.lock().unwrap_or_else(|e| e.into_inner());
        let needs_rebuild = match *built_at {
            Some(t) => t.elapsed().as_secs() > STALE_SECONDS,
            None => true,
        };
        drop(built_at);

        if needs_rebuild {
            self.build()?;
        }
        Ok(())
    }

    pub fn add(&self, path: &str, folder: &str) {
        let note_path = PathBuf::from(path);
        let folder_name = folder.to_string();
        if let Some(entry) = read_note_entry(&note_path, &folder_name) {
            let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
            entries.insert(entry.path.clone(), entry);
        }
    }

    pub fn remove(&self, path: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.remove(path);
    }

    pub fn move_entry(&self, old_path: &str, new_path: &str, new_folder: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(mut entry) = entries.remove(old_path) {
            entry.path = new_path.to_string();
            entry.folder = new_folder.to_string();
            entries.insert(new_path.to_string(), entry);
        }
    }

    pub fn get(&self, path: &str) -> Option<NoteEntry> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.get(path).cloned()
    }

    pub fn list(&self, folder: Option<&str>) -> Result<Vec<NoteEntry>, String> {
        self.ensure_fresh()?;
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());

        let mut result: Vec<NoteEntry> = entries
            .values()
            .filter(|e| folder.map_or(true, |f| e.folder == f))
            .cloned()
            .collect();

        result.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(result)
    }

    pub fn search(&self, query: &str) -> Result<Vec<(NoteEntry, String)>, String> {
        self.ensure_fresh()?;
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let query_lower = query.to_lowercase();

        let mut results: Vec<(NoteEntry, String)> = Vec::new();

        for entry in entries.values() {
            let preview_lower = entry.preview.to_lowercase();
            if preview_lower.contains(&query_lower) {
                let snippet = extract_snippet(&entry.preview, query, 100);
                results.push((entry.clone(), snippet));
            } else if entry.content_len > PREVIEW_LENGTH {
                // Preview didn't match but note is longer — fall back to full read
                let path = PathBuf::from(&entry.path);
                if let Ok(content) = fs::read_to_string(&path) {
                    if content.to_lowercase().contains(&query_lower) {
                        let snippet = extract_snippet(&content, query, 100);
                        results.push((entry.clone(), snippet));
                    }
                }
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

fn read_note_entry(path: &PathBuf, folder: &str) -> Option<NoteEntry> {
    let content = fs::read_to_string(path).ok()?;
    let content_len = content.len();
    let title = extract_title(&content);

    let preview = if content.len() > PREVIEW_LENGTH {
        content[..PREVIEW_LENGTH].to_string()
    } else {
        content
    };

    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let created = filename
        .split('-')
        .take(2)
        .collect::<Vec<_>>()
        .join("-");

    Some(NoteEntry {
        path: path.to_string_lossy().to_string(),
        filename,
        folder: folder.to_string(),
        title,
        preview,
        created,
        content_len,
    })
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

fn extract_snippet(content: &str, query: &str, max_len: usize) -> String {
    let content_lower = content.to_lowercase();
    let query_lower = query.to_lowercase();

    if let Some(pos) = content_lower.find(&query_lower) {
        let start = pos.saturating_sub(30);
        let end = (pos + query.len() + 50).min(content.len());

        let mut snippet = String::new();
        if start > 0 {
            snippet.push_str("...");
        }
        snippet.push_str(&content[start..end].replace('\n', " "));
        if end < content.len() {
            snippet.push_str("...");
        }
        snippet
    } else {
        let end = max_len.min(content.len());
        let mut snippet = content[..end].replace('\n', " ");
        if end < content.len() {
            snippet.push_str("...");
        }
        snippet
    }
}

#[cfg(test)]
mod tests {
    use super::extract_title;

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
}
