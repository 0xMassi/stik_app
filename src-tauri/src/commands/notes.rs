use base64::Engine;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::{AppState, LastSavedNote};
use super::analytics;
use super::embeddings::{self, EmbeddingIndex};
use super::folders::get_stik_folder;
use super::git_share;
use super::index::NoteIndex;

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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub title: String,
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
    app: AppHandle,
    folder: String,
    content: String,
    index: State<'_, NoteIndex>,
    emb_index: State<'_, EmbeddingIndex>,
) -> Result<NoteSaved, String> {
    let result = save_note_inner(folder, content.clone())?;

    if !result.path.is_empty() {
        let word_count = content.split_whitespace().count();
        analytics::track("note_created", serde_json::json!({ "word_count": word_count }));

        index.add(&result.path, &result.folder);
        git_share::notify_note_changed(&result.folder);
        if super::settings::load_settings_from_file().map(|s| s.ai_features_enabled).unwrap_or(false) {
            if let Some(emb) = embeddings::embed_content(&content) {
                emb_index.add_entry(&result.path, emb);
                let _ = emb_index.save();
            }
        }

        let state = app.state::<AppState>();
        let mut last = state.last_saved_note.lock().unwrap_or_else(|e: std::sync::PoisonError<_>| e.into_inner());
        *last = Some(LastSavedNote {
            path: result.path.clone(),
            folder: result.folder.clone(),
        });
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

    if !note_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    fs::read_to_string(&note_path).map_err(|e| e.to_string())
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

    // Validate path is within Stik folder
    if !note_path.starts_with(&stik_folder) {
        return Err("Invalid path: note must be within Stik folder".to_string());
    }

    // Check file exists
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    // Don't save empty notes - delete instead
    if is_effectively_empty_markdown(&content) {
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

    let word_count = content.split_whitespace().count();
    analytics::track("note_updated", serde_json::json!({ "word_count": word_count }));

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
    if !note_path.exists() {
        return Err("Note file does not exist".to_string());
    }

    let folder = note_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Delete referenced .assets/ images
    if let Ok(content) = fs::read_to_string(&note_path) {
        let folder_path = note_path.parent().unwrap_or(&stik_folder);
        delete_note_assets(&content, folder_path);
    }

    // Delete the file
    fs::remove_file(&note_path).map_err(|e| format!("Failed to delete note: {}", e))?;
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

    // Move referenced .assets/ images to the target folder
    if source_folder != target_folder {
        let source_folder_path = stik_folder.join(&source_folder);
        move_note_assets(&content, &source_folder_path, &target_folder_path);
    }

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
fn move_note_assets(content: &str, source_folder: &std::path::Path, target_folder: &std::path::Path) {
    let filenames = extract_asset_filenames(content);
    if filenames.is_empty() {
        return;
    }

    let source_assets = source_folder.join(".assets");
    let target_assets = target_folder.join(".assets");

    if !source_assets.exists() {
        return;
    }

    for name in filenames {
        let src = source_assets.join(&name);
        if !src.exists() {
            continue;
        }
        if fs::create_dir_all(&target_assets).is_err() {
            continue;
        }
        let dst = target_assets.join(&name);
        // Copy + remove instead of rename (works across volumes)
        if fs::copy(&src, &dst).is_ok() {
            let _ = fs::remove_file(&src);
        }
    }
}

/// Delete `.assets/` files referenced by a note.
fn delete_note_assets(content: &str, folder_path: &std::path::Path) {
    let filenames = extract_asset_filenames(content);
    let assets_dir = folder_path.join(".assets");
    for name in filenames {
        let path = assets_dir.join(&name);
        let _ = fs::remove_file(&path);
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
    fs::create_dir_all(&assets_dir).map_err(|e| format!("Failed to create .assets dir: {}", e))?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let file_path = assets_dir.join(&filename);

    fs::write(&file_path, &bytes).map_err(|e| format!("Failed to write image: {}", e))?;

    let abs = file_path.to_string_lossy().to_string();
    let rel = format!(".assets/{}", filename);
    Ok((abs, rel))
}

#[tauri::command]
pub fn save_note_image_from_path(folder: String, file_path: String) -> Result<(String, String), String> {
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
    fs::create_dir_all(&assets_dir).map_err(|e| format!("Failed to create .assets dir: {}", e))?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let destination_path = assets_dir.join(&filename);
    fs::copy(&source_path, &destination_path)
        .map_err(|e| format!("Failed to copy dropped image: {}", e))?;

    let abs = destination_path.to_string_lossy().to_string();
    let rel = format!(".assets/{}", filename);
    Ok((abs, rel))
}

#[cfg(test)]
mod tests {
    use super::is_effectively_empty_markdown;

    #[test]
    fn placeholder_breaks_only_are_treated_as_empty() {
        assert!(is_effectively_empty_markdown("<br>\n\n<br />\n"));
    }

    #[test]
    fn real_content_with_placeholders_is_not_empty() {
        assert!(!is_effectively_empty_markdown("hello\n\n<br>\n"));
    }
}
