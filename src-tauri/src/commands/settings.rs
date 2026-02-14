use super::{git_share, versioning};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutMapping {
    pub shortcut: String,
    pub folder: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomTemplate {
    pub name: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GitSharingSettings {
    pub enabled: bool,
    pub shared_folder: String,
    pub remote_url: String,
    pub branch: String,
    pub repository_layout: String,
    pub sync_interval_seconds: u64,
}

impl Default for GitSharingSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            shared_folder: "Inbox".to_string(),
            remote_url: String::new(),
            branch: "main".to_string(),
            repository_layout: "folder_root".to_string(),
            sync_interval_seconds: 300,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_font_size() -> u32 {
    14
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StikSettings {
    pub shortcut_mappings: Vec<ShortcutMapping>,
    pub default_folder: String,
    #[serde(default)]
    pub git_sharing: GitSharingSettings,
    #[serde(default = "default_true")]
    pub ai_features_enabled: bool,
    #[serde(default)]
    pub vim_mode_enabled: bool,
    #[serde(default)]
    pub theme_mode: String,
    #[serde(default)]
    pub notes_directory: String,
    #[serde(default)]
    pub hide_dock_icon: bool,
    #[serde(default)]
    pub folder_colors: HashMap<String, String>,
    #[serde(default)]
    pub system_shortcuts: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub analytics_enabled: bool,
    #[serde(default)]
    pub analytics_notice_dismissed: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default)]
    pub viewing_window_size: Option<(f64, f64)>,
    #[serde(default)]
    pub custom_templates: Vec<CustomTemplate>,
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
            git_sharing: GitSharingSettings::default(),
            ai_features_enabled: true,
            vim_mode_enabled: false,
            theme_mode: String::new(),
            notes_directory: String::new(),
            hide_dock_icon: false,
            folder_colors: HashMap::new(),
            system_shortcuts: default_system_shortcuts(),
            analytics_enabled: true,
            analytics_notice_dismissed: false,
            font_size: 14,
            viewing_window_size: None,
            custom_templates: vec![],
        }
    }
}

pub fn default_system_shortcuts() -> HashMap<String, String> {
    HashMap::from([
        ("search".to_string(), "Cmd+Shift+P".to_string()),
        ("manager".to_string(), "Cmd+Shift+M".to_string()),
        ("settings".to_string(), "Cmd+Shift+Comma".to_string()),
        ("last_note".to_string(), "Cmd+Shift+L".to_string()),
    ])
}

fn normalize_system_shortcuts(shortcuts: &mut HashMap<String, String>) {
    let defaults = default_system_shortcuts();
    for (action, default_shortcut) in &defaults {
        shortcuts
            .entry(action.clone())
            .or_insert_with(|| default_shortcut.clone());
    }
}

fn normalize_loaded_settings(mut settings: StikSettings) -> StikSettings {
    // The UI has no enable/disable toggle — users delete shortcuts to remove them.
    // Force all visible shortcuts to enabled so stale disabled state can't persist.
    for mapping in &mut settings.shortcut_mappings {
        mapping.enabled = true;
    }

    normalize_system_shortcuts(&mut settings.system_shortcuts);

    settings
}

fn get_settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("settings.json"))
}

pub(crate) fn load_settings_from_file() -> Result<StikSettings, String> {
    let path = get_settings_path()?;

    match versioning::load_versioned::<StikSettings>(&path)? {
        Some(settings) => Ok(normalize_loaded_settings(settings)),
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
    git_share::notify_force_sync();
    Ok(true)
}

#[cfg(target_os = "macos")]
pub fn apply_dock_icon_visibility(hide: bool) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplicationActivationPolicy;

    if let Some(mtm) = MainThreadMarker::new() {
        let app = objc2_app_kit::NSApplication::sharedApplication(mtm);
        let policy = if hide {
            NSApplicationActivationPolicy::Accessory
        } else {
            NSApplicationActivationPolicy::Regular
        };
        app.setActivationPolicy(policy);
    }
}

#[tauri::command]
pub fn save_viewing_window_size(width: f64, height: f64) -> Result<(), String> {
    let mut settings = load_settings_from_file()?;
    settings.viewing_window_size = Some((width, height));
    save_settings_to_file(&settings)
}

#[tauri::command]
pub fn set_dock_icon_visibility(hide: bool) {
    #[cfg(target_os = "macos")]
    apply_dock_icon_visibility(hide);
}

#[cfg(test)]
mod tests {
    use super::{normalize_loaded_settings, ShortcutMapping, StikSettings};

    #[test]
    fn normalization_reenables_all_disabled_shortcuts() {
        let mut settings = StikSettings::default();
        settings.shortcut_mappings = vec![
            ShortcutMapping {
                shortcut: "Cmd+Shift+S".to_string(),
                folder: "Inbox".to_string(),
                enabled: false,
            },
            ShortcutMapping {
                shortcut: "Cmd+Shift+1".to_string(),
                folder: "Work".to_string(),
                enabled: false,
            },
        ];

        let normalized = normalize_loaded_settings(settings);
        assert!(normalized.shortcut_mappings[0].enabled);
        assert!(normalized.shortcut_mappings[1].enabled);
    }
}
