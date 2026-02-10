use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use super::settings::StikSettings;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderStats {
    pub name: String,
    pub note_count: usize,
}

fn is_visible_folder_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty() && !trimmed.starts_with('.')
}

fn list_visible_folder_names(stik_folder: &Path) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(stik_folder).map_err(|e| e.to_string())?;
    let mut folders: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| is_visible_folder_name(name))
        .collect();
    folders.sort_unstable();
    Ok(folders)
}

fn uses_folder_root_layout(settings: &StikSettings) -> bool {
    !settings
        .git_sharing
        .repository_layout
        .trim()
        .eq_ignore_ascii_case("stik_root")
}

fn reconcile_settings_after_folder_delete(
    settings: &mut StikSettings,
    deleted_folder: &str,
    fallback_folder: Option<&str>,
) {
    let fallback = fallback_folder.unwrap_or_default();

    if settings.default_folder == deleted_folder {
        settings.default_folder = fallback.to_string();
    }

    for mapping in &mut settings.shortcut_mappings {
        if mapping.folder == deleted_folder {
            mapping.folder = fallback.to_string();
        }
    }

    if uses_folder_root_layout(settings) && settings.git_sharing.shared_folder == deleted_folder {
        settings.git_sharing.shared_folder = fallback.to_string();
    }

    settings.folder_colors.remove(deleted_folder);
}

fn reconcile_settings_after_folder_rename(
    settings: &mut StikSettings,
    old_name: &str,
    new_name: &str,
) {
    if settings.default_folder == old_name {
        settings.default_folder = new_name.to_string();
    }

    for mapping in &mut settings.shortcut_mappings {
        if mapping.folder == old_name {
            mapping.folder = new_name.to_string();
        }
    }

    if uses_folder_root_layout(settings) && settings.git_sharing.shared_folder == old_name {
        settings.git_sharing.shared_folder = new_name.to_string();
    }

    if let Some(color) = settings.folder_colors.remove(old_name) {
        settings.folder_colors.insert(new_name.to_string(), color);
    }
}

fn sync_settings_after_folder_delete(
    deleted_folder: &str,
    fallback_folder: Option<&str>,
) -> Result<(), String> {
    let mut settings = super::settings::get_settings()?;
    reconcile_settings_after_folder_delete(&mut settings, deleted_folder, fallback_folder);
    let _ = super::settings::save_settings(settings)?;
    Ok(())
}

fn sync_settings_after_folder_rename(old_name: &str, new_name: &str) -> Result<(), String> {
    let mut settings = super::settings::get_settings()?;
    reconcile_settings_after_folder_rename(&mut settings, old_name, new_name);
    let _ = super::settings::save_settings(settings)?;
    Ok(())
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
    list_visible_folder_names(&stik_folder)
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

    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(&name);

    // Check folder exists
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Folder does not exist".to_string());
    }

    // Delete folder and all contents
    fs::remove_dir_all(&folder_path).map_err(|e| format!("Failed to delete folder: {}", e))?;
    let fallback = list_visible_folder_names(&stik_folder)?
        .into_iter()
        .next();
    sync_settings_after_folder_delete(&name, fallback.as_deref())?;

    Ok(true)
}

#[tauri::command]
pub fn rename_folder(old_name: String, new_name: String) -> Result<bool, String> {
    validate_name(&old_name)?;
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
    sync_settings_after_folder_rename(&old_name, &new_name)?;

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

    stats.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::{
        is_visible_folder_name, reconcile_settings_after_folder_delete,
        reconcile_settings_after_folder_rename, validate_name,
    };
    use crate::commands::settings::{GitSharingSettings, ShortcutMapping, StikSettings};
    use std::collections::HashMap;

    fn sample_settings() -> StikSettings {
        StikSettings {
            default_folder: "Inbox".to_string(),
            shortcut_mappings: vec![
                ShortcutMapping {
                    shortcut: "Cmd+Shift+1".to_string(),
                    folder: "Inbox".to_string(),
                    enabled: true,
                },
                ShortcutMapping {
                    shortcut: "Cmd+Shift+2".to_string(),
                    folder: "Work".to_string(),
                    enabled: true,
                },
            ],
            git_sharing: GitSharingSettings {
                enabled: false,
                shared_folder: "Inbox".to_string(),
                remote_url: String::new(),
                branch: "main".to_string(),
                repository_layout: "folder_root".to_string(),
                sync_interval_seconds: 300,
            },
            ai_features_enabled: true,
            vim_mode_enabled: false,
            theme_mode: String::new(),
            notes_directory: String::new(),
            hide_dock_icon: false,
            folder_colors: HashMap::new(),
            system_shortcuts: HashMap::new(),
        }
    }

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

    #[test]
    fn delete_reconciles_settings_to_fallback_folder() {
        let mut settings = sample_settings();

        reconcile_settings_after_folder_delete(&mut settings, "Inbox", Some("Notes"));

        assert_eq!(settings.default_folder, "Notes");
        assert_eq!(settings.shortcut_mappings[0].folder, "Notes");
        assert_eq!(settings.shortcut_mappings[1].folder, "Work");
        assert_eq!(settings.git_sharing.shared_folder, "Notes");
    }

    #[test]
    fn delete_without_fallback_clears_references() {
        let mut settings = sample_settings();

        reconcile_settings_after_folder_delete(&mut settings, "Inbox", None);

        assert_eq!(settings.default_folder, "");
        assert_eq!(settings.shortcut_mappings[0].folder, "");
        assert!(settings.shortcut_mappings[0].enabled);
        assert_eq!(settings.git_sharing.shared_folder, "");
    }

    #[test]
    fn rename_reconciles_all_settings_references() {
        let mut settings = sample_settings();

        reconcile_settings_after_folder_rename(&mut settings, "Inbox", "Notes");

        assert_eq!(settings.default_folder, "Notes");
        assert_eq!(settings.shortcut_mappings[0].folder, "Notes");
        assert_eq!(settings.shortcut_mappings[1].folder, "Work");
        assert_eq!(settings.git_sharing.shared_folder, "Notes");
    }
}
