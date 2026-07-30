use super::{git_share, versioning};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

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
pub struct CustomFontEntry {
    pub name: String,
    pub path: String,
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
    #[serde(default)]
    pub highlight: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ICloudSettings {
    pub enabled: bool,
    pub migrated: bool,
}

impl Default for ICloudSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            migrated: false,
        }
    }
}

pub use super::note_lock::NoteLockSettings;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DictationSettings {
    /// WhisperKit model variant id. None = not yet configured.
    pub active_model: Option<String>,
    /// ISO language code ("en", "it", …) or None for auto-detect.
    pub active_language: Option<String>,
    /// Master toggle for the dictation feature.
    pub enabled: bool,
}

impl Default for DictationSettings {
    fn default() -> Self {
        Self {
            active_model: None,
            active_language: None,
            enabled: true,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_window_opacity() -> f64 {
    1.0
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
    pub viewing_window_position: Option<(f64, f64)>,
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
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default = "default_window_opacity")]
    pub window_opacity: f64,
    #[serde(default)]
    pub custom_fonts: Vec<CustomFontEntry>,
    #[serde(default)]
    pub icloud: ICloudSettings,
    #[serde(default)]
    pub note_lock: NoteLockSettings,
    #[serde(default)]
    pub use_directory_as_root: bool,
    /// Save notes as `<slug>.md` instead of `YYYYMMDD-HHMMSS-<slug>-<uuid>.md`.
    /// Nicer in Finder; costs the date-in-name that stats and On This Day read,
    /// which then fall back to the file's modification time.
    #[serde(default)]
    pub simple_filenames: bool,
    #[serde(default)]
    pub dictation: DictationSettings,
    /// BCP-47 locale tag for the UI language ("en", "zh-CN").
    /// Empty string means "follow the system language".
    #[serde(default)]
    pub language: String,
}

impl Default for StikSettings {
    fn default() -> Self {
        Self {
            default_folder: "Inbox".to_string(),
            language: String::new(),
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
            viewing_window_position: None,
            custom_templates: vec![],
            sidebar_position: String::new(),
            auto_update_enabled: true,
            text_direction: "auto".to_string(),
            hide_tray_icon: false,
            capture_window_size: None,
            active_theme: String::new(),
            custom_themes: vec![],
            font_family: None,
            window_opacity: 1.0,
            custom_fonts: vec![],
            icloud: ICloudSettings::default(),
            note_lock: NoteLockSettings::default(),
            use_directory_as_root: false,
            simple_filenames: false,
            dictation: DictationSettings::default(),
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
        ("dictation".to_string(), "Cmd+Shift+D".to_string()),
        ("voice_note".to_string(), "Cmd+Shift+V".to_string()),
        ("clip_capture".to_string(), "Cmd+Shift+C".to_string()),
    ])
}

/// Actions that are in-app only (not registered as OS-level global shortcuts).
pub fn local_only_actions() -> &'static [&'static str] {
    &["zen_mode", "dictation"]
}

fn normalize_system_shortcuts(shortcuts: &mut HashMap<String, String>) {
    let defaults = default_system_shortcuts();
    for (action, default_shortcut) in &defaults {
        shortcuts
            .entry(action.clone())
            .or_insert_with(|| default_shortcut.clone());
    }
}

const BUILTIN_THEME_IDS: &[&str] = &[
    "light",
    "dark",
    "sepia",
    "nord",
    "rose-pine",
    "solarized-light",
    "solarized-dark",
    "dracula",
    "tokyo-night",
];

fn is_legacy_theme_mode(mode: &str) -> bool {
    mode == "system" || mode == "light" || mode == "dark"
}

fn is_valid_active_theme(active_theme: &str, custom_themes: &[CustomThemeDefinition]) -> bool {
    active_theme.is_empty()
        || is_legacy_theme_mode(active_theme)
        || BUILTIN_THEME_IDS.contains(&active_theme)
        || custom_themes.iter().any(|theme| theme.id == active_theme)
}

fn normalize_loaded_settings(mut settings: StikSettings) -> StikSettings {
    // The UI has no enable/disable toggle — users delete shortcuts to remove them.
    // Force all visible shortcuts to enabled so stale disabled state can't persist.
    for mapping in &mut settings.shortcut_mappings {
        mapping.enabled = true;
    }

    normalize_system_shortcuts(&mut settings.system_shortcuts);

    if settings.active_theme.is_empty() && is_legacy_theme_mode(&settings.theme_mode) {
        settings.active_theme = settings.theme_mode.clone();
    }

    if !is_valid_active_theme(&settings.active_theme, &settings.custom_themes) {
        settings.active_theme = if is_legacy_theme_mode(&settings.theme_mode) {
            settings.theme_mode.clone()
        } else {
            String::new()
        };
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
pub fn save_viewing_window_size(width: f64, height: f64) -> Result<(), String> {
    let mut settings = load_settings_from_file()?;
    settings.viewing_window_size = Some((width, height));
    save_settings_to_file(&settings)
}

#[tauri::command]
pub fn save_viewing_window_geometry(width: f64, height: f64, x: f64, y: f64) -> Result<(), String> {
    let mut settings = load_settings_from_file()?;
    settings.viewing_window_size = Some((width, height));
    settings.viewing_window_position = Some((x, y));
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

fn parse_color_value(color: &str) -> Option<String> {
    let trimmed = color.trim();
    if trimmed.starts_with('#') {
        let hex = trimmed.trim_start_matches('#');
        if hex.len() == 6 {
            if let (Ok(r), Ok(g), Ok(b)) = (
                u8::from_str_radix(&hex[0..2], 16),
                u8::from_str_radix(&hex[2..4], 16),
                u8::from_str_radix(&hex[4..6], 16),
            ) {
                return Some(format!("{} {} {}", r, g, b));
            }
        }
        return None;
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() != 3 {
        return None;
    }
    let parsed: Option<Vec<u8>> = parts
        .into_iter()
        .map(|part| part.parse::<u8>().ok())
        .collect();
    parsed.map(|rgb| format!("{} {} {}", rgb[0], rgb[1], rgb[2]))
}

fn parse_theme_colors(colors: ThemeColors) -> Result<ThemeColors, String> {
    let parse = |field: &str, value: &str| {
        parse_color_value(value).ok_or_else(|| format!("Invalid color format for {}", field))
    };

    Ok(ThemeColors {
        bg: parse("bg", &colors.bg)?,
        surface: parse("surface", &colors.surface)?,
        ink: parse("ink", &colors.ink)?,
        stone: parse("stone", &colors.stone)?,
        line: parse("line", &colors.line)?,
        accent: parse("accent", &colors.accent)?,
        accent_light: parse("accent_light", &colors.accent_light)?,
        accent_dark: parse("accent_dark", &colors.accent_dark)?,
        highlight: match colors.highlight {
            Some(h) => Some(parse("highlight", &h)?),
            None => None,
        },
    })
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

    let normalized_colors = parse_theme_colors(theme_file.colors)?;

    Ok(CustomThemeDefinition {
        id,
        name: theme_file.name,
        is_dark: theme_file.is_dark,
        colors: normalized_colors,
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
            highlight: colors.highlight.as_deref().map(color_to_hex),
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
    use super::{normalize_loaded_settings, parse_color_value, ShortcutMapping, StikSettings};

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

    #[test]
    fn normalization_falls_back_to_legacy_theme_mode_when_active_theme_is_invalid() {
        let mut settings = StikSettings::default();
        settings.theme_mode = "dark".to_string();
        settings.active_theme = "removed-custom-theme".to_string();

        let normalized = normalize_loaded_settings(settings);
        assert_eq!(normalized.active_theme, "dark");
    }

    #[test]
    fn parse_color_value_rejects_invalid_strings() {
        assert_eq!(parse_color_value("#112233"), Some("17 34 51".to_string()));
        assert_eq!(parse_color_value("10 20 30"), Some("10 20 30".to_string()));
        assert_eq!(parse_color_value("not-a-color"), None);
    }
}

// ── Custom Fonts ─────────────────────────────────────────────────
//
// Imported fonts are copied into ~/.stik/fonts rather than referenced where the
// user found them. A path under Downloads breaks as soon as the file moves, and
// the asset protocol's scope does not reach outside the notes folder anyway.
// The bytes go back to the webview as a data: URL, which avoids the asset
// protocol and its per-platform URL scheme entirely.

const FONT_EXTENSIONS: [&str; 4] = ["ttf", "otf", "woff", "woff2"];

fn font_mime(ext: &str) -> &'static str {
    match ext {
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "font/ttf",
    }
}

fn fonts_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let dir = home.join(".stik").join("fonts");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create fonts directory: {}", e))?;
    Ok(dir)
}

/// Derive the CSS family name from a font file's basename.
/// Mirrors the previous frontend behaviour so names do not change.
pub fn font_family_name(file_name: &str) -> String {
    let stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(file_name);
    stem.replace(['-', '_'], " ")
}

fn font_extension(path: &Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .ok_or("Font file has no extension")?;
    if !FONT_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported font format '.{}'. Use .ttf, .otf, .woff or .woff2",
            ext
        ));
    }
    Ok(ext)
}

#[tauri::command]
pub fn import_font_file(path: String) -> Result<CustomFontEntry, String> {
    let source = Path::new(&path);
    font_extension(source)?;

    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Font file has no name")?;

    let destination = fonts_dir()?.join(file_name);
    if source != destination {
        fs::copy(source, &destination)
            .map_err(|e| format!("Failed to copy font into ~/.stik/fonts: {}", e))?;
    }

    Ok(CustomFontEntry {
        name: font_family_name(file_name),
        path: destination.to_string_lossy().to_string(),
    })
}

/// Read an imported font and return it as a `data:` URL for the FontFace API.
#[tauri::command]
pub fn load_font_data(path: String) -> Result<String, String> {
    let file = Path::new(&path);
    let ext = font_extension(file)?;

    // This hands raw file bytes to the webview, so it must never read outside
    // the fonts directory — canonicalize both sides so `..` cannot escape.
    let canonical = file
        .canonicalize()
        .map_err(|e| format!("Font file not found: {}", e))?;
    let dir = fonts_dir()?
        .canonicalize()
        .map_err(|e| format!("Fonts directory unavailable: {}", e))?;
    if !canonical.starts_with(&dir) {
        return Err("Fonts can only be loaded from ~/.stik/fonts".to_string());
    }

    let bytes = fs::read(&canonical).map_err(|e| format!("Failed to read font: {}", e))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", font_mime(&ext), encoded))
}

#[cfg(test)]
mod font_tests {
    use super::*;

    #[test]
    fn family_name_strips_extension_and_separators() {
        assert_eq!(
            font_family_name("JetBrains-Mono_Regular.ttf"),
            "JetBrains Mono Regular"
        );
        assert_eq!(font_family_name("Inter.woff2"), "Inter");
    }

    #[test]
    fn family_name_survives_a_name_with_no_extension() {
        assert_eq!(font_family_name("PlainName"), "PlainName");
    }

    #[test]
    fn font_extension_accepts_every_supported_format() {
        for ext in FONT_EXTENSIONS {
            let name = format!("Some-Font.{}", ext);
            assert_eq!(font_extension(Path::new(&name)).unwrap(), ext);
        }
    }

    #[test]
    fn font_extension_is_case_insensitive() {
        assert_eq!(font_extension(Path::new("Some.TTF")).unwrap(), "ttf");
    }

    #[test]
    fn font_extension_rejects_a_non_font() {
        // The picker filters, but the path also arrives from settings.json.
        assert!(font_extension(Path::new("secrets.env")).is_err());
        assert!(font_extension(Path::new("noextension")).is_err());
    }

    #[test]
    fn load_font_data_refuses_paths_outside_the_fonts_directory() {
        // Guards the arbitrary-read primitive: a font extension alone is not
        // enough, the file has to live in ~/.stik/fonts.
        // No extension at all.
        let err = load_font_data("/etc/passwd".to_string()).unwrap_err();
        assert!(err.contains("no extension"), "got: {err}");

        // A real extension, but not a font one.
        let err = load_font_data("/etc/hosts.env".to_string()).unwrap_err();
        assert!(err.contains("Unsupported font format"), "got: {err}");

        // Font extension, but outside ~/.stik/fonts — the case that matters.
        let outside = std::env::temp_dir().join("stik-outside-fonts-dir.ttf");
        fs::write(&outside, b"not really a font").unwrap();
        let err = load_font_data(outside.to_string_lossy().to_string()).unwrap_err();
        assert!(err.contains("~/.stik/fonts"), "got: {err}");
        let _ = fs::remove_file(&outside);
    }
}
