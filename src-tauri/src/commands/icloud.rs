/// iCloud sync commands — status checking, enable/disable, and migration.
use serde::Serialize;
use std::path::Path;
use tauri::Manager;

use super::embeddings::EmbeddingIndex;
use super::index::NoteIndex;
use super::settings;
use super::storage;

#[derive(Debug, Clone, Serialize)]
pub struct ICloudStatus {
    pub available: bool,
    pub enabled: bool,
    pub migrated: bool,
    pub container_url: String,
    pub storage_mode: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MigrationResult {
    pub files_copied: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn icloud_get_status() -> Result<ICloudStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = settings::load_settings_from_file().unwrap_or_default();
        let mode = storage::current_mode();

        // Check iCloud availability using well-known macOS path (no sidecar needed)
        let available = storage::icloud_available();
        let container_url = storage::icloud_container_path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let mode_str = match mode {
            storage::StorageMode::ICloud => "icloud",
            storage::StorageMode::Custom(_) => "custom",
            storage::StorageMode::Local => "local",
        };

        Ok(ICloudStatus {
            available,
            enabled: settings.icloud.enabled,
            migrated: settings.icloud.migrated,
            container_url,
            storage_mode: mode_str.to_string(),
        })
    })
    .await
    .map_err(|e| format!("Failed to get iCloud status: {}", e))?
}

#[tauri::command]
pub async fn icloud_enable(app: tauri::AppHandle) -> Result<ICloudStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Verify iCloud container exists on disk
        if !storage::icloud_available() {
            return Err(
                "iCloud is not available. Please enable iCloud Drive in System Settings."
                    .to_string(),
            );
        }

        // Enable iCloud in settings
        let mut settings = settings::load_settings_from_file()?;
        settings.icloud.enabled = true;
        settings::save_settings_without_app(settings.clone())?;

        // Ensure the iCloud Stik directory exists
        let _ = storage::stik_root()?;

        // Start monitoring if DarwinKit is running
        if super::darwinkit::is_available() {
            let _ = storage::start_monitoring();
        }

        // Rebuild index against new root
        let index = app.state::<NoteIndex>();
        let _ = index.build();

        let container_url = storage::icloud_container_path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Ok(ICloudStatus {
            available: true,
            enabled: true,
            migrated: settings.icloud.migrated,
            container_url,
            storage_mode: "icloud".to_string(),
        })
    })
    .await
    .map_err(|e| format!("Failed to enable iCloud: {}", e))?
}

#[tauri::command]
pub async fn icloud_disable(app: tauri::AppHandle) -> Result<ICloudStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Stop monitoring
        let _ = storage::stop_monitoring();

        // Disable iCloud in settings
        let mut settings = settings::load_settings_from_file()?;
        settings.icloud.enabled = false;
        settings::save_settings_without_app(settings)?;

        // Rebuild index against local root
        let index = app.state::<NoteIndex>();
        let _ = index.build();

        Ok(ICloudStatus {
            available: super::darwinkit::is_available(),
            enabled: false,
            migrated: false,
            container_url: String::new(),
            storage_mode: "local".to_string(),
        })
    })
    .await
    .map_err(|e| format!("Failed to disable iCloud: {}", e))?
}

#[tauri::command]
pub async fn icloud_migrate_notes(app: tauri::AppHandle) -> Result<MigrationResult, String> {
    if super::paths::dev_root()?.is_some() {
        return Err("iCloud migration is unavailable in the isolated development profile".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = MigrationResult {
            files_copied: 0,
            errors: Vec::new(),
        };

        // Get the local Stik folder (source)
        let local_docs = dirs::document_dir().ok_or("Could not find Documents directory")?;
        let local_stik = local_docs.join("Stik");

        if !local_stik.exists() {
            return Ok(result); // Nothing to migrate
        }

        // Get the iCloud Stik folder (destination)
        let icloud_root = storage::stik_root()?;

        // Walk local Stik directory and copy everything
        migrate_directory(&local_stik, &icloud_root, &mut result)?;

        // Mark as migrated
        let mut settings = settings::load_settings_from_file()?;
        settings.icloud.migrated = true;
        settings::save_settings_without_app(settings)?;

        // Rebuild indices
        let index = app.state::<NoteIndex>();
        let _ = index.build();

        let emb = app.state::<EmbeddingIndex>();
        let _ = emb.save();

        Ok(result)
    })
    .await
    .map_err(|e| format!("Migration failed: {}", e))?
}

/// Recursively copy files from source to destination, preserving directory structure.
fn migrate_directory(
    source: &Path,
    dest: &Path,
    result: &mut MigrationResult,
) -> Result<(), String> {
    let entries = std::fs::read_dir(source).map_err(|e| e.to_string())?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs (except .assets)
        if name.starts_with('.') && name != ".assets" {
            continue;
        }

        let dest_path = dest.join(&name);

        if path.is_dir() {
            storage::ensure_dir(&dest_path.to_string_lossy())?;
            migrate_directory(&path, &dest_path, result)?;
        } else {
            match storage::copy_file(&path.to_string_lossy(), &dest_path.to_string_lossy()) {
                Ok(()) => result.files_copied += 1,
                Err(e) => result.errors.push(format!("{}: {}", name, e)),
            }
        }
    }

    Ok(())
}
