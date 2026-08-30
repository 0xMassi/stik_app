use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::settings::StikSettings;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderStats {
    pub name: String,
    pub note_count: usize,
    pub total_note_count: usize,
}

fn is_markdown_note(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

fn collect_folder_stats_with<F>(
    root: &Path,
    directory: &Path,
    list: &F,
    stats: &mut Vec<FolderStats>,
) -> Result<(usize, usize), String>
where
    F: Fn(&Path) -> Result<Vec<super::storage::DirEntry>, String>,
{
    let entries = list(directory)?;
    let direct = entries
        .iter()
        .filter(|entry| !entry.is_directory && is_markdown_note(&entry.name))
        .count();
    let mut total = direct;

    for entry in entries
        .iter()
        .filter(|entry| entry.is_directory && is_visible_folder_name(&entry.name))
    {
        let child = directory.join(&entry.name);
        let (child_direct, child_total) =
            collect_folder_stats_with(root, &child, list, stats)?;
        let relative = child
            .strip_prefix(root)
            .map_err(|_| "Folder is outside the notes root".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        stats.push(FolderStats {
            name: relative,
            note_count: child_direct,
            total_note_count: child_total,
        });
        total += child_total;
    }

    Ok((direct, total))
}

fn folder_stats_with<F>(root: &Path, list: &F) -> Result<Vec<FolderStats>, String>
where
    F: Fn(&Path) -> Result<Vec<super::storage::DirEntry>, String>,
{
    let mut stats = Vec::new();
    collect_folder_stats_with(root, root, list, &mut stats)?;
    stats.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(stats)
}

fn is_visible_folder_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty() && !trimmed.starts_with('.')
}

fn list_visible_folder_names(stik_folder: &Path) -> Result<Vec<String>, String> {
    let path_str = stik_folder.to_string_lossy();
    let entries = super::storage::list_dir(&path_str)?;
    let mut folders: Vec<String> = entries
        .into_iter()
        .filter(|e| e.is_directory)
        .map(|e| e.name)
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
    settings.folder_icons.remove(deleted_folder);
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

    if let Some(icon) = settings.folder_icons.remove(old_name) {
        settings.folder_icons.insert(new_name.to_string(), icon);
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

/// Folder identifier for a note = its parent directory's path relative to the
/// Stik root, using '/' separators. Root-level notes return "". Supports nesting.
pub fn note_folder(stik_root: &Path, note_path: &Path) -> String {
    note_path
        .parent()
        .and_then(|p| p.strip_prefix(stik_root).ok())
        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default()
}

/// Validate a relative folder path (supports nesting like "Projects/Work") while
/// blocking traversal. Each segment must be a visible, non-".."/"." name.
pub fn validate_folder_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if path.contains('\\') || path.contains('\0') {
        return Err("Invalid name: must not contain '\\' or null bytes".to_string());
    }
    if path.starts_with('/') || path.ends_with('/') {
        return Err("Invalid folder path: no leading or trailing '/'".to_string());
    }
    for seg in path.split('/') {
        let s = seg.trim();
        if s.is_empty() || s == ".." || s == "." {
            return Err("Invalid folder path: empty or traversal segment".to_string());
        }
        if !is_visible_folder_name(s) {
            return Err("Invalid name: hidden folders are not supported".to_string());
        }
    }
    Ok(())
}

/// Recursively collect every visible folder as a relative path (Obsidian-style tree).
fn collect_folders(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let entries = match super::storage::list_dir(&dir.to_string_lossy()) {
        Ok(e) => e,
        Err(_) => return,
    };
    for e in entries {
        if e.is_directory && is_visible_folder_name(&e.name) {
            let child = dir.join(&e.name);
            if let Ok(rel) = child.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
            collect_folders(root, &child, out);
        }
    }
}

/// Get the Stik folder path — delegates to storage abstraction which handles
/// iCloud, custom directory, and local default modes.
pub fn get_stik_folder() -> Result<PathBuf, String> {
    super::storage::stik_root()
}

#[tauri::command]
pub fn get_notes_directory() -> Result<String, String> {
    let path = get_stik_folder()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_folders() -> Result<Vec<String>, String> {
    let stik_folder = get_stik_folder()?;
    let mut out = Vec::new();
    collect_folders(&stik_folder, &stik_folder, &mut out);
    out.sort_unstable();
    Ok(out)
}

#[tauri::command]
pub fn create_folder(name: String) -> Result<bool, String> {
    validate_folder_path(&name)?;
    let stik_folder = get_stik_folder()?;
    let folder_path =
        super::path_security::authorize_new_path(&stik_folder, &stik_folder.join(&name))?;

    super::storage::ensure_dir(&folder_path.to_string_lossy())?;

    Ok(true)
}

#[tauri::command]
pub fn delete_folder(
    name: String,
    index: tauri::State<'_, super::index::NoteIndex>,
    emb_index: tauri::State<'_, super::embeddings::EmbeddingIndex>,
) -> Result<bool, String> {
    validate_folder_path(&name)?;

    let stik_folder = get_stik_folder()?;
    let folder_path =
        super::path_security::authorize_existing_path(&stik_folder, &stik_folder.join(&name))?;

    // Check folder exists
    if !super::storage::is_dir(&folder_path.to_string_lossy()) {
        return Err("Folder does not exist".to_string());
    }

    // Delete folder and all contents
    super::storage::remove_dir_all(&folder_path.to_string_lossy())
        .map_err(|e| format!("Failed to delete folder: {}", e))?;

    // Purge deleted notes from in-memory indices
    index.remove_by_folder_tree(&name);
    let prefix = folder_path.to_string_lossy();
    emb_index.remove_by_path_prefix(&prefix);
    let _ = emb_index.save();

    let fallback = list_visible_folder_names(&stik_folder)?.into_iter().next();
    sync_settings_after_folder_delete(&name, fallback.as_deref())?;

    Ok(true)
}

#[tauri::command]
pub fn rename_folder(old_name: String, new_name: String) -> Result<bool, String> {
    validate_folder_path(&old_name)?;
    validate_folder_path(&new_name)?;

    let stik_folder = get_stik_folder()?;
    let old_path =
        super::path_security::authorize_existing_path(&stik_folder, &stik_folder.join(&old_name))?;
    let new_path =
        super::path_security::authorize_new_path(&stik_folder, &stik_folder.join(&new_name))?;

    // Check old folder exists
    if !super::storage::is_dir(&old_path.to_string_lossy()) {
        return Err("Folder does not exist".to_string());
    }

    // Check new folder doesn't already exist
    if super::storage::path_exists(&new_path.to_string_lossy()) {
        return Err("A folder with that name already exists".to_string());
    }

    // Ensure the destination's parent exists (renaming into a nested path).
    if let Some(parent) = new_path.parent() {
        super::storage::ensure_dir(&parent.to_string_lossy())?;
    }

    // Rename folder
    super::storage::move_file(&old_path.to_string_lossy(), &new_path.to_string_lossy())
        .map_err(|e| format!("Failed to rename folder: {}", e))?;
    sync_settings_after_folder_rename(&old_name, &new_name)?;

    Ok(true)
}

#[tauri::command]
pub fn get_folder_stats() -> Result<Vec<FolderStats>, String> {
    let stik_folder = get_stik_folder()?;
    folder_stats_with(&stik_folder, &|path| {
        let authorized = super::path_security::authorize_existing_path(&stik_folder, path)?;
        super::storage::list_dir(&authorized.to_string_lossy())
    })
}

#[cfg(test)]
mod tests {
    use super::{
        folder_stats_with, is_visible_folder_name, note_folder,
        reconcile_settings_after_folder_delete, reconcile_settings_after_folder_rename,
        validate_folder_path, validate_name,
    };
    use crate::commands::storage::DirEntry;
    use std::collections::HashMap;
    use std::path::Path;

    #[test]
    fn validate_folder_path_allows_nesting_but_blocks_traversal() {
        assert!(validate_folder_path("Inbox").is_ok());
        assert!(validate_folder_path("Projects/Work").is_ok());
        assert!(validate_folder_path("a/b/c").is_ok());

        assert!(validate_folder_path("").is_err());
        assert!(validate_folder_path("../etc").is_err());
        assert!(validate_folder_path("Projects/../secret").is_err());
        assert!(validate_folder_path("/abs").is_err());
        assert!(validate_folder_path("trailing/").is_err());
        assert!(validate_folder_path(".hidden").is_err());
        assert!(validate_folder_path("Projects/.git").is_err());
        assert!(validate_folder_path("a\\b").is_err());
    }

    #[test]
    fn note_folder_returns_relative_parent_path() {
        let root = Path::new("/stik");
        assert_eq!(note_folder(root, Path::new("/stik/foo.md")), "");
        assert_eq!(note_folder(root, Path::new("/stik/Inbox/foo.md")), "Inbox");
        assert_eq!(note_folder(root, Path::new("/stik/A/B/foo.md")), "A/B");
    }

    #[test]
    fn folder_stats_include_nested_folders_and_descendant_notes() {
        let root = Path::new("/vault");
        let entries = HashMap::from([
            (
                "/vault".to_string(),
                vec![directory("Projects"), directory(".trash")],
            ),
            (
                "/vault/Projects".to_string(),
                vec![note("one.md"), directory("Work"), directory(".assets")],
            ),
            (
                "/vault/Projects/Work".to_string(),
                vec![note("two.markdown"), directory("Deep")],
            ),
            (
                "/vault/Projects/Work/Deep".to_string(),
                vec![note("three.MD"), note("ignore.txt")],
            ),
        ]);

        let stats = folder_stats_with(root, &|path| {
            Ok(entries
                .get(&path.to_string_lossy().to_string())
                .cloned()
                .unwrap_or_default())
        })
        .unwrap();

        assert_eq!(
            stats
                .iter()
                .map(|stat| {
                    (
                        stat.name.as_str(),
                        stat.note_count,
                        stat.total_note_count,
                    )
                })
                .collect::<Vec<_>>(),
            vec![
                ("Projects", 1, 3),
                ("Projects/Work", 1, 2),
                ("Projects/Work/Deep", 1, 1),
            ]
        );
    }

    fn directory(name: &str) -> DirEntry {
        DirEntry {
            name: name.to_string(),
            is_directory: true,
            size: 0,
            modified: None,
        }
    }

    fn note(name: &str) -> DirEntry {
        DirEntry {
            name: name.to_string(),
            is_directory: false,
            size: 0,
            modified: None,
        }
    }
    use crate::commands::settings::{GitSharingSettings, ShortcutMapping, StikSettings};

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
            folder_colors: HashMap::new(),
            system_shortcuts: HashMap::new(),
            ..StikSettings::default()
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
