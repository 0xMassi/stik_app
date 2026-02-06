use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

use super::embeddings::{self, EmbeddingIndex};
use super::folders::get_stik_folder;
use super::git_share;
use super::index::NoteIndex;

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

/// Generate timestamp-based filename with UUID suffix to prevent collisions
fn generate_filename(content: &str) -> String {
    let now = Local::now();
    let timestamp = now.format("%Y%m%d-%H%M%S").to_string();
    let slug = generate_slug(content);
    let suffix = &uuid::Uuid::new_v4().to_string()[..4];
    format!("{}-{}-{}.md", timestamp, slug, suffix)
}

/// Core save logic, callable from other Rust modules without Tauri State
pub fn save_note_inner(folder: String, content: String) -> Result<NoteSaved, String> {
    super::folders::validate_name(&folder)?;

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
pub fn save_note(
    folder: String,
    content: String,
    index: State<'_, NoteIndex>,
    emb_index: State<'_, EmbeddingIndex>,
) -> Result<NoteSaved, String> {
    let result = save_note_inner(folder, content.clone())?;

    if !result.path.is_empty() {
        index.add(&result.path, &result.folder);
        git_share::notify_note_changed(&result.folder);
        if super::settings::load_settings_from_file().map(|s| s.ai_features_enabled).unwrap_or(false) {
            if let Some(emb) = embeddings::embed_content(&content) {
                emb_index.add_entry(&result.path, emb);
                let _ = emb_index.save();
            }
        }
    }

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
    index: State<'_, NoteIndex>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let results = index.search(&query)?;

    Ok(results
        .into_iter()
        .map(|(entry, snippet)| SearchResult {
            path: entry.path,
            filename: entry.filename,
            folder: entry.folder,
            snippet,
            created: entry.created,
        })
        .collect())
}

#[tauri::command]
pub fn get_note_content(path: String) -> Result<String, String> {
    let stik_folder = get_stik_folder()?;
    let note_path = PathBuf::from(&path);

    if !note_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    fs::read_to_string(&note_path).map_err(|e| e.to_string())
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
    fs::write(&note_path, &content).map_err(|e| e.to_string())?;

    // Re-index with updated content
    index.add(&path, &folder);
    git_share::notify_note_changed(&folder);
    if super::settings::load_settings_from_file().map(|s| s.ai_features_enabled).unwrap_or(false) {
        if let Some(emb) = embeddings::embed_content(&content) {
            emb_index.add_entry(&path, emb);
            let _ = emb_index.save();
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
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    let folder = note_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Delete the file
    fs::remove_file(&note_path).map_err(|e| format!("Failed to delete note: {}", e))?;
    index.remove(&path);
    emb_index.remove_entry(&path);
    let _ = emb_index.save();
    git_share::notify_note_changed(&folder);

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

    let new_path_str = target_path.to_string_lossy().to_string();
    index.move_entry(&path, &new_path_str, &target_folder);
    emb_index.move_entry(&path, &new_path_str);
    let _ = emb_index.save();
    git_share::notify_note_changed(&source_folder);
    git_share::notify_note_changed(&target_folder);

    // Extract created date from filename
    let created = filename.split('-').take(2).collect::<Vec<_>>().join("-");

    Ok(NoteInfo {
        path: new_path_str,
        filename,
        folder: target_folder,
        content,
        created,
    })
}
