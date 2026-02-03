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

    if !path.exists() {
        let default_settings = StikSettings::default();
        save_settings_to_file(&default_settings)?;
        return Ok(default_settings);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_settings_to_file(settings: &StikSettings) -> Result<(), String> {
    let path = get_settings_path()?;
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
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

#[tauri::command]
pub fn get_shortcut_mappings() -> Result<Vec<ShortcutMapping>, String> {
    let settings = load_settings_from_file()?;
    Ok(settings.shortcut_mappings)
}

#[tauri::command]
pub fn save_shortcut_mapping(index: usize, mapping: ShortcutMapping) -> Result<bool, String> {
    let mut settings = load_settings_from_file()?;

    if index >= settings.shortcut_mappings.len() {
        settings.shortcut_mappings.push(mapping);
    } else {
        settings.shortcut_mappings[index] = mapping;
    }

    save_settings_to_file(&settings)?;
    Ok(true)
}

#[tauri::command]
pub fn set_setting(key: String, value: String) -> Result<bool, String> {
    let mut settings = load_settings_from_file()?;

    match key.as_str() {
        "default_folder" => settings.default_folder = value,
        _ => return Err(format!("Unknown setting key: {}", key)),
    }

    save_settings_to_file(&settings)?;
    Ok(true)
}
