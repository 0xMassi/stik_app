use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use super::folders::get_stik_folder;

#[derive(Debug, Serialize, Deserialize)]
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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub content: String,
    pub snippet: String,
    pub created: String,
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
        slug[..40].to_string()
    } else if slug.is_empty() {
        "note".to_string()
    } else {
        slug
    }
}

/// Generate timestamp-based filename
fn generate_filename(content: &str) -> String {
    let now = Local::now();
    let timestamp = now.format("%Y%m%d-%H%M%S").to_string();
    let slug = generate_slug(content);
    format!("{}-{}.md", timestamp, slug)
}

#[tauri::command]
pub fn save_note(folder: String, content: String) -> Result<NoteSaved, String> {
    // Don't save empty notes
    if content.trim().is_empty() {
        return Ok(NoteSaved {
            path: String::new(),
            folder,
            filename: String::new(),
        });
    }

    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(&folder);

    // Ensure folder exists
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

    // Generate filename and write
    let filename = generate_filename(&content);
    let file_path = folder_path.join(&filename);

    fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    Ok(NoteSaved {
        path: file_path.to_string_lossy().to_string(),
        folder,
        filename,
    })
}

#[tauri::command]
pub fn list_notes(folder: Option<String>) -> Result<Vec<NoteInfo>, String> {
    let stik_folder = get_stik_folder()?;

    let folders_to_scan: Vec<PathBuf> = if let Some(f) = folder {
        vec![stik_folder.join(f)]
    } else {
        // Scan all folders
        fs::read_dir(&stik_folder)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.path().is_dir())
            .map(|entry| entry.path())
            .collect()
    };

    let mut notes = Vec::new();

    for folder_path in folders_to_scan {
        let folder_name = folder_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        if let Ok(entries) = fs::read_dir(&folder_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let filename = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();

                        // Extract date from filename (YYYYMMDD-HHMMSS)
                        let created = filename
                            .split('-')
                            .take(2)
                            .collect::<Vec<_>>()
                            .join("-");

                        notes.push(NoteInfo {
                            path: path.to_string_lossy().to_string(),
                            filename,
                            folder: folder_name.clone(),
                            content,
                            created,
                        });
                    }
                }
            }
        }
    }

    // Sort by created date, newest first
    notes.sort_by(|a, b| b.created.cmp(&a.created));

    Ok(notes)
}

/// Extract a snippet around the match
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
        // Return first part of content as snippet
        let end = max_len.min(content.len());
        let mut snippet = content[..end].replace('\n', " ");
        if end < content.len() {
            snippet.push_str("...");
        }
        snippet
    }
}

#[tauri::command]
pub fn search_notes(query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let stik_folder = get_stik_folder()?;
    let query_lower = query.to_lowercase();

    let folders: Vec<PathBuf> = fs::read_dir(&stik_folder)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.path())
        .collect();

    let mut results = Vec::new();

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
                    if let Ok(content) = fs::read_to_string(&path) {
                        // Case-insensitive search
                        if content.to_lowercase().contains(&query_lower) {
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

                            let snippet = extract_snippet(&content, &query, 100);

                            results.push(SearchResult {
                                path: path.to_string_lossy().to_string(),
                                filename,
                                folder: folder_name.clone(),
                                content,
                                snippet,
                                created,
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort by created date, newest first
    results.sort_by(|a, b| b.created.cmp(&a.created));

    Ok(results)
}

#[tauri::command]
pub fn update_note(path: String, content: String) -> Result<NoteSaved, String> {
    let stik_folder = get_stik_folder()?;
    let note_path = PathBuf::from(&path);

    // Validate path is within Stik folder
    if !note_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }

    // Check file exists
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    // Don't save empty notes - delete instead
    if content.trim().is_empty() {
        fs::remove_file(&note_path).map_err(|e| format!("Failed to delete note: {}", e))?;
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
    fs::write(&note_path, &content).map_err(|e| e.to_string())?;

    Ok(NoteSaved {
        path: note_path.to_string_lossy().to_string(),
        folder,
        filename,
    })
}

#[tauri::command]
pub fn delete_note(path: String) -> Result<bool, String> {
    let stik_folder = get_stik_folder()?;
    let note_path = PathBuf::from(&path);

    // Validate path is within Stik folder
    if !note_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }

    // Check file exists
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    // Delete the file
    fs::remove_file(&note_path).map_err(|e| format!("Failed to delete note: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub fn move_note(path: String, target_folder: String) -> Result<NoteInfo, String> {
    let stik_folder = get_stik_folder()?;
    let source_path = PathBuf::from(&path);

    // Validate source path is within Stik folder
    if !source_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }

    // Check source file exists
    if !source_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    // Ensure target folder exists
    let target_folder_path = stik_folder.join(&target_folder);
    fs::create_dir_all(&target_folder_path).map_err(|e| e.to_string())?;

    // Get filename from source
    let filename = source_path
        .file_name()
        .ok_or("Invalid filename")?
        .to_string_lossy()
        .to_string();

    // Build target path
    let target_path = target_folder_path.join(&filename);

    // Read content before moving
    let content = fs::read_to_string(&source_path).map_err(|e| e.to_string())?;

    // Move the file
    fs::rename(&source_path, &target_path).map_err(|e| format!("Failed to move note: {}", e))?;

    // Extract created date from filename
    let created = filename
        .split('-')
        .take(2)
        .collect::<Vec<_>>()
        .join("-");

    Ok(NoteInfo {
        path: target_path.to_string_lossy().to_string(),
        filename,
        folder: target_folder,
        content,
        created,
    })
}
