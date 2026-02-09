use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderStats {
    pub name: String,
    pub note_count: usize,
}

fn is_visible_folder_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty() && !trimmed.starts_with('.')
}

/// Validate a name for path traversal attacks
pub fn validate_name(name: &str) -> Result<(), String> {
    if name.contains("..") || name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("Invalid name: must not contain '..', '/', '\\', or null bytes".to_string());
    }
    if name.trim().is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if !is_visible_folder_name(name) {
        return Err("Invalid name: hidden folders are not supported".to_string());
    }
    Ok(())
}

/// Default Stik folder: ~/Documents/Stik
fn default_stik_folder() -> Result<PathBuf, String> {
    let docs = dirs::document_dir().ok_or("Could not find Documents directory")?;
    Ok(docs.join("Stik"))
}

/// Get the Stik folder path — respects `notes_directory` in settings, falls back to ~/Documents/Stik
pub fn get_stik_folder() -> Result<PathBuf, String> {
    let stik_folder = match super::settings::load_settings_from_file() {
        Ok(s) if !s.notes_directory.is_empty() => {
            let p = PathBuf::from(&s.notes_directory);
            if p.is_absolute() {
                p.join("Stik")
            } else {
                default_stik_folder()?
            }
        }
        _ => default_stik_folder()?,
    };

    fs::create_dir_all(&stik_folder).map_err(|e| e.to_string())?;
    Ok(stik_folder)
}

#[tauri::command]
pub fn get_notes_directory() -> Result<String, String> {
    let path = get_stik_folder()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_folders() -> Result<Vec<String>, String> {
    let stik_folder = get_stik_folder()?;

    // List all directories
    let entries = fs::read_dir(&stik_folder).map_err(|e| e.to_string())?;

    let mut folders: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| is_visible_folder_name(name))
        .collect();

    // Sort with Inbox first, then alphabetically
    folders.sort_by(|a, b| {
        if a == "Inbox" {
            std::cmp::Ordering::Less
        } else if b == "Inbox" {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });

    Ok(folders)
}

#[tauri::command]
pub fn create_folder(name: String) -> Result<bool, String> {
    validate_name(&name)?;
    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(&name);

    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn delete_folder(name: String) -> Result<bool, String> {
    validate_name(&name)?;

    // Prevent deletion of Inbox
    if name == "Inbox" {
        return Err("Cannot delete the Inbox folder".to_string());
    }

    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(&name);

    // Check folder exists
    if !folder_path.exists() {
        return Err("Folder does not exist".to_string());
    }

    // Delete folder and all contents
    fs::remove_dir_all(&folder_path).map_err(|e| format!("Failed to delete folder: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub fn rename_folder(old_name: String, new_name: String) -> Result<bool, String> {
    validate_name(&old_name)?;

    // Prevent renaming of Inbox
    if old_name == "Inbox" {
        return Err("Cannot rename the Inbox folder".to_string());
    }

    validate_name(&new_name)?;

    let stik_folder = get_stik_folder()?;
    let old_path = stik_folder.join(&old_name);
    let new_path = stik_folder.join(&new_name);

    // Check old folder exists
    if !old_path.exists() {
        return Err("Folder does not exist".to_string());
    }

    // Check new folder doesn't already exist
    if new_path.exists() {
        return Err("A folder with that name already exists".to_string());
    }

    // Rename folder
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename folder: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub fn get_folder_stats() -> Result<Vec<FolderStats>, String> {
    let stik_folder = get_stik_folder()?;

    // List all directories and count notes
    let entries = fs::read_dir(&stik_folder).map_err(|e| e.to_string())?;

    let mut stats: Vec<FolderStats> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let note_count = fs::read_dir(entry.path())
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
                        .count()
                })
                .unwrap_or(0);

            FolderStats { name, note_count }
        })
        .filter(|stat| is_visible_folder_name(&stat.name))
        .collect();

    // Sort with Inbox first, then alphabetically
    stats.sort_by(|a, b| {
        if a.name == "Inbox" {
            std::cmp::Ordering::Less
        } else if b.name == "Inbox" {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::{is_visible_folder_name, validate_name};

    #[test]
    fn rejects_hidden_folder_names() {
        assert!(validate_name(".git").is_err());
        assert!(validate_name(".private").is_err());
    }

    #[test]
    fn folder_visibility_hides_dot_directories() {
        assert!(is_visible_folder_name("Inbox"));
        assert!(!is_visible_folder_name(".git"));
        assert!(!is_visible_folder_name(".cache"));
    }
}
