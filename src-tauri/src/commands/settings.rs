use super::{git_share, versioning};
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
        }
    }
}

fn normalize_loaded_settings(mut settings: StikSettings) -> StikSettings {
    // Self-heal legacy state from folder deletion bug:
    // shortcuts were disabled when no fallback folder existed.
    let all_shortcuts_disabled = settings.shortcut_mappings.iter().all(|m| !m.enabled);
    let has_empty_folder_mapping = settings
        .shortcut_mappings
        .iter()
        .any(|m| m.folder.trim().is_empty());

    if all_shortcuts_disabled && has_empty_folder_mapping {
        if let Some(first_mapping) = settings.shortcut_mappings.first_mut() {
            first_mapping.enabled = true;
        }
    }

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
pub fn set_dock_icon_visibility(hide: bool) {
    #[cfg(target_os = "macos")]
    apply_dock_icon_visibility(hide);
}

#[cfg(test)]
mod tests {
    use super::{normalize_loaded_settings, ShortcutMapping, StikSettings};

    #[test]
    fn normalization_reenables_first_shortcut_for_legacy_empty_folder_state() {
        let mut settings = StikSettings::default();
        settings.shortcut_mappings = vec![
            ShortcutMapping {
                shortcut: "CommandOrControl+Shift+S".to_string(),
                folder: String::new(),
                enabled: false,
            },
            ShortcutMapping {
                shortcut: "CommandOrControl+Shift+1".to_string(),
                folder: String::new(),
                enabled: false,
            },
        ];

        let normalized = normalize_loaded_settings(settings);
        assert!(normalized.shortcut_mappings[0].enabled);
    }

    #[test]
    fn normalization_keeps_intentional_disabled_shortcuts_when_folder_targets_exist() {
        let mut settings = StikSettings::default();
        settings.shortcut_mappings = vec![ShortcutMapping {
            shortcut: "CommandOrControl+Shift+S".to_string(),
            folder: "Inbox".to_string(),
            enabled: false,
        }];

        let normalized = normalize_loaded_settings(settings);
        assert!(!normalized.shortcut_mappings[0].enabled);
    }
}
