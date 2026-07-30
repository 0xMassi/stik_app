/// Storage abstraction — routes file I/O through either local filesystem
/// or DarwinKit's coordinated iCloud methods depending on the active mode.
///
/// When iCloud is enabled, all file operations go through NSFileCoordinator
/// via DarwinKit JSON-RPC. When local or custom, direct std::fs (current behavior).
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use super::darwinkit;
use super::settings;

// ── Storage Mode ──────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StorageMode {
    Local,
    ICloud,
    Custom(String),
}

/// Determine the active storage mode from settings.
/// Priority: icloud.enabled > notes_directory (custom) > local default.
pub fn current_mode() -> StorageMode {
    match settings::load_settings_from_file() {
        Ok(s) => {
            if s.icloud.enabled {
                StorageMode::ICloud
            } else if !s.notes_directory.is_empty() {
                let p = PathBuf::from(&s.notes_directory);
                if p.is_absolute() {
                    StorageMode::Custom(s.notes_directory)
                } else {
                    StorageMode::Local
                }
            } else {
                StorageMode::Local
            }
        }
        Err(_) => StorageMode::Local,
    }
}

/// Get the root Stik directory for the current storage mode.
/// When `use_directory_as_root` is enabled and a custom directory is set,
/// the custom path is used directly without appending a `Stik/` subfolder.
pub fn stik_root() -> Result<PathBuf, String> {
    match current_mode() {
        StorageMode::ICloud => icloud_stik_root(),
        StorageMode::Custom(dir) => {
            let use_as_root = settings::load_settings_from_file()
                .map(|s| s.use_directory_as_root)
                .unwrap_or(false);
            let path = if use_as_root {
                PathBuf::from(&dir)
            } else {
                PathBuf::from(&dir).join("Stik")
            };
            fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            Ok(path)
        }
        StorageMode::Local => {
            let docs = dirs::document_dir().ok_or("Could not find Documents directory")?;
            let path = docs.join("Stik");
            fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            Ok(path)
        }
    }
}

/// Stik uses the generic iCloud Drive folder (`com~apple~CloudDocs`) rather
/// than a dedicated ubiquity container. A dedicated container would require
/// the `com.apple.developer.icloud-container-identifiers` entitlement and a
/// provisioning profile from Apple Developer — which blocks ad-hoc signed
/// builds from launching (see v0.7.7). The generic folder requires no
/// entitlements, is visible in Finder's iCloud Drive sidebar, and is
/// available to any app whenever the user has iCloud Drive enabled.
const ICLOUD_DRIVE_FOLDER: &str = "com~apple~CloudDocs";

/// Get the root of the user's iCloud Drive. This is the folder that shows
/// up under "iCloud Drive" in Finder — not a Stik-specific container.
pub fn icloud_container_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let drive = home
        .join("Library")
        .join("Mobile Documents")
        .join(ICLOUD_DRIVE_FOLDER);
    Ok(drive)
}

/// Check whether iCloud Drive is available on this machine.
pub fn icloud_available() -> bool {
    icloud_container_path().map(|p| p.exists()).unwrap_or(false)
}

/// Resolve the iCloud Drive Stik folder, creating it if needed.
fn icloud_stik_root() -> Result<PathBuf, String> {
    let drive = icloud_container_path()?;

    if !drive.exists() {
        return Err(
            "iCloud Drive is not available. Enable iCloud Drive in System Settings → Apple ID → iCloud."
                .to_string(),
        );
    }

    let path = drive.join("Stik");
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create iCloud Stik folder: {}", e))?;
    Ok(path)
}

// ── Atomic Writes ─────────────────────────────────────────────────
//
// A truncating `fs::write` leaves a window where a reader sees a half-written
// note. Finder, Obsidian, the file watcher and any future sync agent all read
// this tree, so notes go out temp-file-then-rename — the same shape the JSON
// stores already use.

fn atomic_write(path: &str, data: &[u8]) -> Result<(), String> {
    let target = Path::new(path);
    let dir = target
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path))?;
    let name = target
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("{} has no filename", path))?;

    // Leading dot and a .tmp extension keep the partial file out of both the
    // note index (skips dot-entries) and the watcher (matches .md only).
    let tmp = dir.join(format!(".{}.tmp", name));

    fs::write(&tmp, data).map_err(|e| format!("Failed to write {}: {}", tmp.display(), e))?;
    fs::rename(&tmp, target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Failed to replace {}: {}", path, e)
    })
}

// ── Self-Write Suppression ────────────────────────────────────────
//
// The watcher cannot tell our own writes from someone editing the file in
// another app, so it re-reads, re-embeds and re-broadcasts every save we make.
// Each write records its path here and the watcher drops the matching event.

const SELF_WRITE_WINDOW: Duration = Duration::from_secs(2);

fn recent_writes() -> &'static Mutex<HashMap<String, Instant>> {
    static RECENT: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    RECENT.get_or_init(|| Mutex::new(HashMap::new()))
}

fn record_self_write(path: &str) {
    let mut map = recent_writes().lock().unwrap_or_else(|e| e.into_inner());
    map.retain(|_, at| at.elapsed() < SELF_WRITE_WINDOW);
    map.insert(path.to_string(), Instant::now());
}

/// True if this app wrote `path` within the suppression window. Consumes the
/// record, so a real external edit straight after ours is still seen.
pub fn take_self_write(path: &str) -> bool {
    let mut map = recent_writes().lock().unwrap_or_else(|e| e.into_inner());
    match map.remove(path) {
        Some(at) => at.elapsed() < SELF_WRITE_WINDOW,
        None => false,
    }
}

// ── File Operations ───────────────────────────────────────────────

pub fn read_file(path: &str) -> Result<String, String> {
    match current_mode() {
        StorageMode::ICloud => {
            let result = darwinkit::call_with_timeout(
                "icloud.read",
                Some(serde_json::json!({ "path": path })),
                30,
            )?;
            result
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "iCloud read returned no content".to_string())
        }
        _ => fs::read_to_string(path).map_err(|e| e.to_string()),
    }
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    record_self_write(path);
    match current_mode() {
        StorageMode::ICloud => {
            darwinkit::call_with_timeout(
                "icloud.write",
                Some(serde_json::json!({ "path": path, "content": content })),
                30,
            )?;
            Ok(())
        }
        _ => atomic_write(path, content.as_bytes()),
    }
}

pub fn write_bytes(path: &str, data: &[u8]) -> Result<(), String> {
    match current_mode() {
        StorageMode::ICloud => {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(data);
            darwinkit::call_with_timeout(
                "icloud.write_bytes",
                Some(serde_json::json!({ "path": path, "data": b64 })),
                30,
            )?;
            Ok(())
        }
        _ => atomic_write(path, data),
    }
}

pub fn delete_file(path: &str) -> Result<(), String> {
    match current_mode() {
        StorageMode::ICloud => {
            darwinkit::call_with_timeout(
                "icloud.delete",
                Some(serde_json::json!({ "path": path })),
                30,
            )?;
            Ok(())
        }
        _ => fs::remove_file(path).map_err(|e| e.to_string()),
    }
}

pub fn move_file(src: &str, dst: &str) -> Result<(), String> {
    match current_mode() {
        StorageMode::ICloud => {
            darwinkit::call_with_timeout(
                "icloud.move",
                Some(serde_json::json!({ "source": src, "destination": dst })),
                30,
            )?;
            Ok(())
        }
        _ => fs::rename(src, dst).map_err(|e| e.to_string()),
    }
}

pub fn copy_file(src: &str, dst: &str) -> Result<(), String> {
    match current_mode() {
        StorageMode::ICloud => {
            darwinkit::call_with_timeout(
                "icloud.copy_file",
                Some(serde_json::json!({ "source": src, "destination": dst })),
                30,
            )?;
            Ok(())
        }
        _ => {
            fs::copy(src, dst).map_err(|e| e.to_string())?;
            Ok(())
        }
    }
}

pub fn ensure_dir(path: &str) -> Result<(), String> {
    match current_mode() {
        StorageMode::ICloud => {
            darwinkit::call_with_timeout(
                "icloud.ensure_dir",
                Some(serde_json::json!({ "path": path })),
                30,
            )?;
            Ok(())
        }
        _ => fs::create_dir_all(path).map_err(|e| e.to_string()),
    }
}

pub fn remove_dir_all(path: &str) -> Result<(), String> {
    // No special iCloud handling needed — coordinated delete works on directories too
    match current_mode() {
        StorageMode::ICloud => {
            darwinkit::call_with_timeout(
                "icloud.delete",
                Some(serde_json::json!({ "path": path })),
                30,
            )?;
            Ok(())
        }
        _ => fs::remove_dir_all(path).map_err(|e| e.to_string()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub is_directory: bool,
    pub size: u64,
    pub modified: Option<String>,
}

pub fn list_dir(path: &str) -> Result<Vec<DirEntry>, String> {
    match current_mode() {
        StorageMode::ICloud => {
            let result = darwinkit::call_with_timeout(
                "icloud.list_dir",
                Some(serde_json::json!({ "path": path })),
                30,
            )?;
            let entries = result
                .get("entries")
                .and_then(|v| v.as_array())
                .ok_or("iCloud list_dir returned no entries")?;

            Ok(entries
                .iter()
                .filter_map(|e| {
                    Some(DirEntry {
                        name: e.get("name")?.as_str()?.to_string(),
                        is_directory: e.get("is_directory")?.as_bool()?,
                        size: e.get("size")?.as_u64().unwrap_or(0),
                        modified: e
                            .get("modified")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                    })
                })
                .collect())
        }
        _ => {
            let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
            Ok(entries
                .filter_map(|entry| {
                    let entry = entry.ok()?;
                    let metadata = entry.metadata().ok()?;
                    let modified = metadata.modified().ok().map(|t| {
                        let dt: chrono::DateTime<chrono::Local> = t.into();
                        dt.to_rfc3339()
                    });
                    Some(DirEntry {
                        name: entry.file_name().to_string_lossy().to_string(),
                        is_directory: metadata.is_dir(),
                        size: metadata.len(),
                        modified,
                    })
                })
                .collect())
        }
    }
}

/// Check if a path exists. For iCloud mode, attempts a list_dir on the parent
/// to verify the file. For local, uses std::path::Path::exists().
pub fn path_exists(path: &str) -> bool {
    match current_mode() {
        StorageMode::ICloud => {
            // For iCloud, try reading — if it fails, the file doesn't exist
            // This is simpler than listing the parent directory
            let p = PathBuf::from(path);
            if p.is_dir() {
                list_dir(path).is_ok()
            } else {
                read_file(path).is_ok()
            }
        }
        _ => PathBuf::from(path).exists(),
    }
}

/// Check if path is a directory. For local mode only (iCloud uses list_dir).
pub fn is_dir(path: &str) -> bool {
    match current_mode() {
        StorageMode::ICloud => {
            // Try listing — if it succeeds, it's a directory
            list_dir(path).is_ok()
        }
        _ => PathBuf::from(path).is_dir(),
    }
}

/// Start iCloud file monitoring via DarwinKit
pub fn start_monitoring() -> Result<(), String> {
    if current_mode() != StorageMode::ICloud {
        return Ok(());
    }
    darwinkit::call("icloud.start_monitoring", None)?;
    Ok(())
}

/// Stop iCloud file monitoring
pub fn stop_monitoring() -> Result<(), String> {
    darwinkit::call("icloud.stop_monitoring", None)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be monotonic")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("stik-storage-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("temp dir should be creatable");
        dir
    }

    #[test]
    fn atomic_write_creates_the_file_and_leaves_no_temp_behind() {
        let dir = unique_temp_dir("create");
        let note = dir.join("20260730-120000-hello-ab12.md");

        atomic_write(note.to_str().unwrap(), b"# hello").expect("write should succeed");

        assert_eq!(fs::read_to_string(&note).unwrap(), "# hello");
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp files left behind: {leftovers:?}"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_replaces_existing_content_wholesale() {
        let dir = unique_temp_dir("replace");
        let note = dir.join("note.md");
        fs::write(&note, "a much longer previous body").unwrap();

        atomic_write(note.to_str().unwrap(), b"short").expect("write should succeed");

        // A truncating write that failed midway would leave the tail of the old
        // body; rename cannot.
        assert_eq!(fs::read_to_string(&note).unwrap(), "short");

        let _ = fs::remove_dir_all(&dir);
    }

    /// The property that matters: a concurrent reader never sees a partial note.
    /// A truncating `fs::write` fails this — the reader catches the window
    /// between truncate and the bytes landing, and reads a short or empty file.
    #[test]
    fn a_concurrent_reader_never_sees_a_partial_note() {
        let dir = unique_temp_dir("concurrent");
        let note = dir.join("note.md");
        let long = "x".repeat(64 * 1024);
        let short = "y".repeat(512);
        fs::write(&note, &long).unwrap();

        let reader_path = note.clone();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let reader_stop = stop.clone();

        let reader = std::thread::spawn(move || {
            let mut partials = 0;
            while !reader_stop.load(std::sync::atomic::Ordering::Relaxed) {
                if let Ok(seen) = fs::read_to_string(&reader_path) {
                    if seen.len() != 64 * 1024 && seen.len() != 512 {
                        partials += 1;
                    }
                }
            }
            partials
        });

        let path_str = note.to_str().unwrap();
        for i in 0..200 {
            let body = if i % 2 == 0 { &short } else { &long };
            atomic_write(path_str, body.as_bytes()).expect("write should succeed");
        }
        stop.store(true, std::sync::atomic::Ordering::Relaxed);

        let partials = reader.join().expect("reader thread should not panic");
        assert_eq!(partials, 0, "reader saw {partials} partially-written notes");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn atomic_write_rejects_a_path_with_no_filename() {
        assert!(atomic_write("/", b"x").is_err());
    }

    #[test]
    fn self_write_is_seen_once_then_forgotten() {
        let path = "/tmp/stik-self-write-once.md";
        record_self_write(path);

        assert!(take_self_write(path), "our own write should be suppressed");
        assert!(
            !take_self_write(path),
            "a second event on the same path is an external edit"
        );
    }

    #[test]
    fn a_path_we_never_wrote_is_never_suppressed() {
        assert!(!take_self_write("/tmp/stik-never-written.md"));
    }
}
