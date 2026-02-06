use super::versioning;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutMapping {
    pub shortcut: String,
    pub folder: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StikSettings {
    pub shortcut_mappings: Vec<ShortcutMapping>,
    pub default_folder: String,
}

impl Default for StikSettings {
    fn default() -> Self {
        Self {
            default_folder: "Inbox".to_string(),
            shortcut_mappings: vec![
                ShortcutMapping {
                    shortcut: "CommandOrControl+Shift+S".to_string(),
                    folder: "Inbox".to_string(),
                    enabled: true,
                },
                ShortcutMapping {
                    shortcut: "CommandOrControl+Shift+1".to_string(),
                    folder: "Work".to_string(),
                    enabled: true,
                },
                ShortcutMapping {
                    shortcut: "CommandOrControl+Shift+2".to_string(),
                    folder: "Ideas".to_string(),
                    enabled: true,
                },
                ShortcutMapping {
                    shortcut: "CommandOrControl+Shift+3".to_string(),
                    folder: "Personal".to_string(),
                    enabled: true,
                },
            ],
        }
    }
}

fn get_settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("settings.json"))
}

fn load_settings_from_file() -> Result<StikSettings, String> {
    let path = get_settings_path()?;

    match versioning::load_versioned::<StikSettings>(&path)? {
        Some(settings) => Ok(settings),
        None => {
            let default_settings = StikSettings::default();
            save_settings_to_file(&default_settings)?;
            Ok(default_settings)
        }
    }
}

fn save_settings_to_file(settings: &StikSettings) -> Result<(), String> {
    let path = get_settings_path()?;
    versioning::save_versioned(&path, settings)
}

#[tauri::command]
pub fn get_settings() -> Result<StikSettings, String> {
    load_settings_from_file()
}

#[tauri::command]
pub fn save_settings(settings: StikSettings) -> Result<bool, String> {
    save_settings_to_file(&settings)?;
    Ok(true)
}
