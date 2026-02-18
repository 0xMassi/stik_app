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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeColors {
    pub bg: String,
    pub surface: String,
    pub ink: String,
    pub stone: String,
    pub line: String,
    pub accent: String,
    pub accent_light: String,
    pub accent_dark: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomThemeDefinition {
    pub id: String,
    pub name: String,
    pub is_dark: bool,
    pub colors: ThemeColors,
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

fn default_text_direction() -> String {
    "auto".to_string()
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
    #[serde(default)]
    pub sidebar_position: String,
    #[serde(default = "default_true")]
    pub auto_update_enabled: bool,
    #[serde(default = "default_text_direction")]
    pub text_direction: String,
    #[serde(default)]
    pub hide_tray_icon: bool,
    #[serde(default)]
    pub capture_window_size: Option<(f64, f64)>,
    #[serde(default)]
    pub active_theme: String,
    #[serde(default)]
    pub custom_themes: Vec<CustomThemeDefinition>,
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
            sidebar_position: String::new(),
            auto_update_enabled: true,
            text_direction: "auto".to_string(),
            hide_tray_icon: false,
            capture_window_size: None,
            active_theme: String::new(),
            custom_themes: vec![],
        }
    }
}

pub fn default_system_shortcuts() -> HashMap<String, String> {
    HashMap::from([
        ("search".to_string(), "Cmd+Shift+P".to_string()),
        ("manager".to_string(), "Cmd+Shift+M".to_string()),
        ("settings".to_string(), "Cmd+Shift+Comma".to_string()),
        ("last_note".to_string(), "Cmd+Shift+L".to_string()),
        ("zen_mode".to_string(), "Cmd+Period".to_string()),
    ])
}

/// Actions that are in-app only (not registered as OS-level global shortcuts).
pub fn local_only_actions() -> &'static [&'static str] {
    &["zen_mode"]
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
pub fn save_capture_window_size(width: f64, height: f64) -> Result<(), String> {
    let mut settings = load_settings_from_file()?;
    settings.capture_window_size = Some((width, height));
    save_settings_to_file(&settings)
}

#[tauri::command]
pub fn set_tray_icon_visibility(app: tauri::AppHandle, hide: bool) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_visible(!hide);
    }
}

#[tauri::command]
pub fn set_dock_icon_visibility(hide: bool) {
    #[cfg(target_os = "macos")]
    apply_dock_icon_visibility(hide);
}

fn normalize_color_value(color: &str) -> String {
    let trimmed = color.trim();
    if trimmed.starts_with('#') {
        let hex = trimmed.trim_start_matches('#');
        if hex.len() >= 6 {
            if let (Ok(r), Ok(g), Ok(b)) = (
                u8::from_str_radix(&hex[0..2], 16),
                u8::from_str_radix(&hex[2..4], 16),
                u8::from_str_radix(&hex[4..6], 16),
            ) {
                return format!("{} {} {}", r, g, b);
            }
        }
    }
    trimmed.to_string()
}

fn color_to_hex(rgb: &str) -> String {
    let parts: Vec<u8> = rgb
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();
    if parts.len() >= 3 {
        format!("#{:02x}{:02x}{:02x}", parts[0], parts[1], parts[2])
    } else {
        rgb.to_string()
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ThemeFile {
    name: String,
    is_dark: bool,
    colors: ThemeColors,
}

#[tauri::command]
pub fn import_theme_file(path: String) -> Result<CustomThemeDefinition, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let theme_file: ThemeFile = if path.ends_with(".toml") {
        toml::from_str(&content).map_err(|e| format!("Invalid TOML theme file: {}", e))?
    } else {
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON theme file: {}", e))?
    };

    if theme_file.name.trim().is_empty() {
        return Err("Theme file must have a name".to_string());
    }

    let id = format!(
        "imported-{}",
        &uuid::Uuid::new_v4().to_string().replace('-', "")[..12]
    );

    Ok(CustomThemeDefinition {
        id,
        name: theme_file.name,
        is_dark: theme_file.is_dark,
        colors: ThemeColors {
            bg: normalize_color_value(&theme_file.colors.bg),
            surface: normalize_color_value(&theme_file.colors.surface),
            ink: normalize_color_value(&theme_file.colors.ink),
            stone: normalize_color_value(&theme_file.colors.stone),
            line: normalize_color_value(&theme_file.colors.line),
            accent: normalize_color_value(&theme_file.colors.accent),
            accent_light: normalize_color_value(&theme_file.colors.accent_light),
            accent_dark: normalize_color_value(&theme_file.colors.accent_dark),
        },
    })
}

#[tauri::command]
pub fn export_theme_file(
    path: String,
    name: String,
    is_dark: bool,
    colors: ThemeColors,
) -> Result<(), String> {
    let theme_file = ThemeFile {
        name,
        is_dark,
        colors: ThemeColors {
            bg: color_to_hex(&colors.bg),
            surface: color_to_hex(&colors.surface),
            ink: color_to_hex(&colors.ink),
            stone: color_to_hex(&colors.stone),
            line: color_to_hex(&colors.line),
            accent: color_to_hex(&colors.accent),
            accent_light: color_to_hex(&colors.accent_light),
            accent_dark: color_to_hex(&colors.accent_dark),
        },
    };

    let content = if path.ends_with(".toml") {
        toml::to_string_pretty(&theme_file)
            .map_err(|e| format!("Failed to serialize theme: {}", e))?
    } else {
        serde_json::to_string_pretty(&theme_file)
            .map_err(|e| format!("Failed to serialize theme: {}", e))?
    };

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
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
