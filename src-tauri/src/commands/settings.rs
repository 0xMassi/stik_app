use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct StikSettings {
    pub default_folder: String,
    pub shortcuts: ShortcutSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShortcutSettings {
    pub open_inbox: String,
    pub open_folder1: String,
    pub open_folder2: String,
    pub open_folder3: String,
}

impl Default for ShortcutSettings {
    fn default() -> Self {
        Self {
            open_inbox: "CommandOrControl+Shift+S".to_string(),
            open_folder1: "CommandOrControl+Shift+1".to_string(),
            open_folder2: "CommandOrControl+Shift+2".to_string(),
            open_folder3: "CommandOrControl+Shift+3".to_string(),
        }
    }
}

#[tauri::command]
pub fn get_settings() -> Result<StikSettings, String> {
    // For now, return defaults
    // TODO: Integrate with tauri-plugin-store
    Ok(StikSettings {
        default_folder: "Inbox".to_string(),
        shortcuts: ShortcutSettings::default(),
    })
}

#[tauri::command]
pub fn set_setting(key: String, value: Value) -> Result<bool, String> {
    // TODO: Integrate with tauri-plugin-store
    println!("Setting {} = {:?}", key, value);
    Ok(true)
}
