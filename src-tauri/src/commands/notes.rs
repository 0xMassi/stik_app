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
