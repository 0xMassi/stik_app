use chrono::Local;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::index::NoteIndex;
use super::storage::{self, StorageMode};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultHealthIssue {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultHealthReport {
    pub status: String,
    pub storage_mode: String,
    pub root_path: Option<String>,
    pub root_exists: bool,
    pub root_is_directory: bool,
    pub root_writable: bool,
    pub indexed_note_count: usize,
    pub disk_note_count: Option<usize>,
    pub checked_at: String,
    pub issues: Vec<VaultHealthIssue>,
}

struct HealthObservation {
    storage_mode: String,
    root_path: Option<PathBuf>,
    root_error: Option<String>,
    root_exists: bool,
    root_is_directory: bool,
    root_writable: bool,
    indexed_note_count: usize,
    disk_note_count: Result<usize, String>,
}

fn issue(code: &str, severity: &str, message: String, suggestion: &str) -> VaultHealthIssue {
    VaultHealthIssue {
        code: code.to_string(),
        severity: severity.to_string(),
        message,
        suggestion: suggestion.to_string(),
    }
}

fn assess_observation(observation: HealthObservation) -> VaultHealthReport {
    let mut issues = Vec::new();

    if let Some(error) = &observation.root_error {
        issues.push(issue(
            "vault_unavailable",
            "error",
            error.clone(),
            "Review the storage location in Settings and make sure it is available.",
        ));
    } else if !observation.root_exists {
        issues.push(issue(
            "vault_missing",
            "error",
            "The configured vault folder does not exist.".to_string(),
            "Review the storage location in Settings before capturing another note.",
        ));
    } else if !observation.root_is_directory {
        issues.push(issue(
            "vault_not_directory",
            "error",
            "The configured vault path is not a folder.".to_string(),
            "Choose a folder as the notes location.",
        ));
    } else if !observation.root_writable {
        issues.push(issue(
            "vault_not_writable",
            "error",
            "Stik cannot write to the configured vault.".to_string(),
            "Restore folder permissions or choose a writable notes location.",
        ));
    }

    let disk_note_count = match observation.disk_note_count {
        Ok(count) => {
            if count != observation.indexed_note_count {
                issues.push(issue(
                    "index_out_of_sync",
                    "warning",
                    format!(
                        "The vault contains {count} notes, but the search index contains {}.",
                        observation.indexed_note_count
                    ),
                    "Rebuild the search index.",
                ));
            }
            Some(count)
        }
        Err(error) => {
            if observation.root_error.is_none() && observation.root_is_directory {
                issues.push(issue(
                    "vault_scan_failed",
                    "warning",
                    format!("Stik could not scan the vault: {error}"),
                    "Retry the check. If it still fails, review folder permissions.",
                ));
            }
            None
        }
    };

    let status = if issues.iter().any(|item| item.severity == "error") {
        "error"
    } else if issues.iter().any(|item| item.severity == "warning") {
        "warning"
    } else {
        "healthy"
    };

    VaultHealthReport {
        status: status.to_string(),
        storage_mode: observation.storage_mode,
        root_path: observation
            .root_path
            .map(|path| path.to_string_lossy().to_string()),
        root_exists: observation.root_exists,
        root_is_directory: observation.root_is_directory,
        root_writable: observation.root_writable,
        indexed_note_count: observation.indexed_note_count,
        disk_note_count,
        checked_at: Local::now().to_rfc3339(),
        issues,
    }
}

fn mode_label(mode: &StorageMode) -> String {
    match mode {
        StorageMode::Local => "local",
        StorageMode::ICloud => "icloud",
        StorageMode::Custom(_) => "custom",
    }
    .to_string()
}

fn count_markdown_notes(root: &Path, dir: &Path) -> Result<usize, String> {
    let mut count = 0;
    for entry in storage::list_dir(&dir.to_string_lossy())? {
        if entry.name.starts_with('.') {
            continue;
        }
        let path = dir.join(&entry.name);
        // A symlink can look lexically contained while pointing outside the
        // vault. Health checks must never walk arbitrary external trees.
        if fs::symlink_metadata(&path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            continue;
        }
        if entry.is_directory {
            if !path.starts_with(root) {
                return Err("A scanned folder escaped the vault root".to_string());
            }
            count += count_markdown_notes(root, &path)?;
        } else if Path::new(&entry.name)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            count += 1;
        }
    }
    Ok(count)
}

fn can_write_to(root: &Path) -> bool {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let probe = root.join(format!(".stik-health-{}-{nonce}", std::process::id()));
    let probe_string = probe.to_string_lossy();
    if storage::write_bytes(&probe_string, b"health-check").is_err() {
        return false;
    }
    storage::delete_file(&probe_string).is_ok()
}

fn collect_vault_health(index: &NoteIndex) -> VaultHealthReport {
    let mode = storage::current_mode();
    let indexed_note_count = index.len();
    match storage::configured_stik_root() {
        Ok(root) => {
            let root_exists = root.exists();
            let root_is_directory = root.is_dir();
            let root_writable = root_is_directory && can_write_to(&root);
            let disk_note_count = if root_is_directory {
                count_markdown_notes(&root, &root)
            } else {
                Err("The vault is not a readable directory".to_string())
            };
            assess_observation(HealthObservation {
                storage_mode: mode_label(&mode),
                root_path: Some(root),
                root_error: None,
                root_exists,
                root_is_directory,
                root_writable,
                indexed_note_count,
                disk_note_count,
            })
        }
        Err(error) => assess_observation(HealthObservation {
            storage_mode: mode_label(&mode),
            root_path: None,
            root_error: Some(error),
            root_exists: false,
            root_is_directory: false,
            root_writable: false,
            indexed_note_count,
            disk_note_count: Err("The vault root could not be resolved".to_string()),
        }),
    }
}

#[tauri::command]
pub fn get_vault_health(index: tauri::State<'_, NoteIndex>) -> VaultHealthReport {
    collect_vault_health(&index)
}

#[tauri::command]
pub fn export_vault_diagnostics(
    path: String,
    index: tauri::State<'_, NoteIndex>,
) -> Result<bool, String> {
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .filter(|directory| directory.exists())
        .ok_or_else(|| "The diagnostics destination folder does not exist".to_string())?;
    let filename = target
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Choose a valid diagnostics filename".to_string())?;
    let report = collect_vault_health(&index);
    let data = serde_json::to_vec_pretty(&report)
        .map_err(|error| format!("Failed to prepare diagnostics: {error}"))?;
    let temp = parent.join(format!(".{filename}.tmp-{}", std::process::id()));

    fs::write(&temp, data).map_err(|error| format!("Failed to write diagnostics: {error}"))?;
    fs::rename(&temp, &target).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("Failed to save diagnostics: {error}")
    })?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{assess_observation, HealthObservation};

    #[test]
    fn reports_a_healthy_vault() {
        let report = assess_observation(HealthObservation {
            storage_mode: "local".to_string(),
            root_path: Some("/tmp/Stik".into()),
            root_error: None,
            root_exists: true,
            root_is_directory: true,
            root_writable: true,
            indexed_note_count: 3,
            disk_note_count: Ok(3),
        });

        assert_eq!(report.status, "healthy");
        assert!(report.issues.is_empty());
    }

    #[test]
    fn reports_unwritable_and_out_of_sync_vaults() {
        let report = assess_observation(HealthObservation {
            storage_mode: "custom".to_string(),
            root_path: Some("/readonly/Stik".into()),
            root_error: None,
            root_exists: true,
            root_is_directory: true,
            root_writable: false,
            indexed_note_count: 2,
            disk_note_count: Ok(4),
        });

        assert_eq!(report.status, "error");
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "vault_not_writable"));
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "index_out_of_sync"));
    }

    #[test]
    fn turns_root_resolution_failures_into_an_actionable_report() {
        let report = assess_observation(HealthObservation {
            storage_mode: "icloud".to_string(),
            root_path: None,
            root_error: Some("iCloud Drive is unavailable".to_string()),
            root_exists: false,
            root_is_directory: false,
            root_writable: false,
            indexed_note_count: 0,
            disk_note_count: Err("not checked".to_string()),
        });

        assert_eq!(report.status, "error");
        assert_eq!(report.root_path, None);
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "vault_unavailable"));
    }
}
