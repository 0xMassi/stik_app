/// Apple Notes linked sync — one-way (Apple Notes → Stik) background poller.
///
/// Persists link state to `~/.stik/apple_notes_sync.json`. On each poll cycle,
/// checks modification dates via the Apple Notes SQLite DB and re-imports any
/// changed notes, overwriting the Stik copy (Apple Notes is source of truth).
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

use super::apple_notes;
use super::embeddings::EmbeddingIndex;
use super::index::NoteIndex;
use super::settings;

// ── Sync entry ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncEntry {
    pub apple_note_id: i64,
    pub stik_path: String,
    pub stik_folder: String,
    pub last_synced_mod_date: f64,
    pub imported_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedNoteInfo {
    pub apple_note_id: i64,
    pub stik_path: String,
    pub stik_folder: String,
    pub last_synced: String,
}

// ── Sync state (managed by Tauri) ───────────────────────────────────

pub struct AppleNotesSyncState {
    entries: Mutex<HashMap<i64, SyncEntry>>,
    loaded: Mutex<bool>,
}

impl AppleNotesSyncState {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            loaded: Mutex::new(false),
        }
    }

    fn sync_path() -> Result<std::path::PathBuf, String> {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        let config = home.join(".stik");
        fs::create_dir_all(&config).map_err(|e| e.to_string())?;
        Ok(config.join("apple_notes_sync.json"))
    }

    pub fn ensure_loaded(&self) {
        let mut loaded = self.loaded.lock().unwrap_or_else(|e| e.into_inner());
        if *loaded {
            return;
        }
        *loaded = true;
        drop(loaded);

        let path = match Self::sync_path() {
            Ok(p) => p,
            Err(_) => return,
        };
        if !path.exists() {
            return;
        }
        let data = match fs::read_to_string(&path) {
            Ok(d) => d,
            Err(_) => return,
        };
        let map: HashMap<i64, SyncEntry> = match serde_json::from_str(&data) {
            Ok(m) => m,
            Err(_) => return,
        };
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        *entries = map;
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::sync_path()?;
        let tmp = path.with_extension("json.tmp");
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let json = serde_json::to_string_pretty(&*entries).map_err(|e| e.to_string())?;
        drop(entries);
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn add_link(&self, entry: SyncEntry) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.insert(entry.apple_note_id, entry);
    }

    pub fn remove_link(&self, apple_note_id: i64) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.remove(&apple_note_id);
    }

    pub fn get_link_by_id(&self, apple_note_id: i64) -> Option<SyncEntry> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.get(&apple_note_id).cloned()
    }

    /// Remove a sync link by Stik file path (used when deleting a note).
    pub fn remove_link_by_path(&self, path: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain(|_, e| e.stik_path != path);
    }

    /// Remove all sync links whose path starts with `prefix` (used when deleting a folder).
    pub fn remove_links_by_path_prefix(&self, prefix: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain(|_, e| !e.stik_path.starts_with(prefix));
    }

    /// Update the path and folder for a moved note.
    pub fn update_link_path(&self, old_path: &str, new_path: &str, new_folder: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        for entry in entries.values_mut() {
            if entry.stik_path == old_path {
                entry.stik_path = new_path.to_string();
                entry.stik_folder = new_folder.to_string();
                break;
            }
        }
    }

    pub fn list_links(&self) -> Vec<SyncEntry> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.values().cloned().collect()
    }

    pub fn count(&self) -> usize {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.len()
    }

    /// Snapshot all entries for the sync worker (clone under lock, release quickly).
    fn snapshot_entries(&self) -> HashMap<i64, SyncEntry> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.clone()
    }

    fn update_mod_date(&self, apple_note_id: i64, new_mod_date: f64) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = entries.get_mut(&apple_note_id) {
            entry.last_synced_mod_date = new_mod_date;
        }
    }
}

// ── Background worker ───────────────────────────────────────────────

enum SyncMessage {
    ForceSync,
}

#[derive(Debug, Clone, Default, Serialize)]
struct RuntimeStatus {
    syncing: bool,
    last_sync_at: Option<String>,
    last_error: Option<String>,
}

static SYNC_WORKER_SENDER: OnceLock<Sender<SyncMessage>> = OnceLock::new();
static SYNC_RUNTIME_STATUS: OnceLock<Mutex<RuntimeStatus>> = OnceLock::new();

fn runtime_status() -> &'static Mutex<RuntimeStatus> {
    SYNC_RUNTIME_STATUS.get_or_init(|| Mutex::new(RuntimeStatus::default()))
}

fn update_status(f: impl FnOnce(&mut RuntimeStatus)) {
    let mut s = runtime_status().lock().unwrap_or_else(|e| e.into_inner());
    f(&mut s);
}

fn snapshot_status() -> RuntimeStatus {
    runtime_status().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn start_sync_worker(app: tauri::AppHandle) {
    if SYNC_WORKER_SENDER.get().is_some() {
        return;
    }

    let (tx, rx) = mpsc::channel::<SyncMessage>();
    if SYNC_WORKER_SENDER.set(tx).is_err() {
        return;
    }

    if let Err(e) = thread::Builder::new()
        .name("stik-apple-notes-sync".to_string())
        .spawn(move || sync_worker_loop(app, rx))
    {
        update_status(|s| {
            s.last_error = Some(format!("Failed to start sync worker: {}", e));
        });
    }
}

fn sync_interval() -> Duration {
    let secs = settings::load_settings_from_file()
        .map(|s| s.apple_notes_sync.sync_interval_seconds)
        .unwrap_or(300);
    Duration::from_secs(secs.max(60))
}

fn sync_worker_loop(app: tauri::AppHandle, rx: Receiver<SyncMessage>) {
    let mut next_poll = Instant::now() + sync_interval();

    loop {
        // Re-check settings each loop — activates dynamically when user enables sync
        let enabled = settings::load_settings_from_file()
            .map(|s| s.apple_notes_sync.enabled)
            .unwrap_or(false);

        match rx.recv_timeout(Duration::from_secs(1)) {
            Ok(SyncMessage::ForceSync) => {
                poll_and_sync(&app);
                next_poll = Instant::now() + sync_interval();
            }
            Err(RecvTimeoutError::Timeout) => {
                if enabled && Instant::now() >= next_poll {
                    poll_and_sync(&app);
                    next_poll = Instant::now() + sync_interval();
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn poll_and_sync(app: &tauri::AppHandle) {
    let sync_state = app.state::<AppleNotesSyncState>();
    sync_state.ensure_loaded();

    let snapshot = sync_state.snapshot_entries();
    if snapshot.is_empty() {
        update_status(|s| {
            s.syncing = false;
            s.last_sync_at = Some(Local::now().to_rfc3339());
            s.last_error = None;
        });
        return;
    }

    update_status(|s| s.syncing = true);

    let conn = match apple_notes::open_readonly_connection_pub() {
        Ok(c) => c,
        Err(e) => {
            update_status(|s| {
                s.syncing = false;
                s.last_error = Some(e);
            });
            return;
        }
    };

    let ids: Vec<i64> = snapshot.keys().copied().collect();
    let mut updated_count = 0u32;
    let mut unlinked_ids: Vec<i64> = Vec::new();

    // Batch query mod dates and deletion status
    // SQLite doesn't support array params, so we chunk and use dynamic SQL
    for chunk in ids.chunks(500) {
        let placeholders: Vec<String> = chunk.iter().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT Z_PK, ZMODIFICATIONDATE1, ZMARKEDFORDELETION FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK IN ({})",
            placeholders.join(",")
        );

        let mut stmt = match conn.prepare(&sql) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[apple-notes-sync] query error: {}", e);
                continue;
            }
        };

        let params: Vec<Box<dyn rusqlite::types::ToSql>> =
            chunk.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|b| b.as_ref()).collect();

        let mut found_ids: HashMap<i64, (f64, bool)> = HashMap::new();
        if let Ok(rows) = stmt.query_map(param_refs.as_slice(), |row| {
            let pk: i64 = row.get(0)?;
            let mod_date: f64 = row.get::<_, Option<f64>>(1)?.unwrap_or(0.0);
            let deleted: bool = row.get::<_, Option<i32>>(2)?.unwrap_or(0) == 1;
            Ok((pk, mod_date, deleted))
        }) {
            for row in rows.flatten() {
                found_ids.insert(row.0, (row.1, row.2));
            }
        }

        for &id in chunk {
            let entry = match snapshot.get(&id) {
                Some(e) => e,
                None => continue,
            };

            match found_ids.get(&id) {
                None | Some((_, true)) => {
                    // Apple Note deleted/trashed/not found — unlink, keep Stik file
                    unlinked_ids.push(id);
                }
                Some((mod_date, false)) => {
                    if (*mod_date - entry.last_synced_mod_date).abs() < 0.001 {
                        continue; // unchanged
                    }

                    // Re-import the note
                    match apple_notes::import_apple_note_inner(id) {
                        Ok(markdown) => {
                            let path = std::path::Path::new(&entry.stik_path);
                            if !path.exists() {
                                // Stik file deleted by user — unlink
                                unlinked_ids.push(id);
                                continue;
                            }

                            // Atomic overwrite
                            let tmp = path.with_extension("md.tmp");
                            if fs::write(&tmp, &markdown).is_err() {
                                continue;
                            }
                            if fs::rename(&tmp, path).is_err() {
                                let _ = fs::remove_file(&tmp);
                                continue;
                            }

                            // Update index (re-reads from disk)
                            let index = app.state::<NoteIndex>();
                            index.add(&entry.stik_path, &entry.stik_folder);

                            // Mark embeddings stale
                            let emb_index = app.state::<EmbeddingIndex>();
                            emb_index.remove_entry(&entry.stik_path);
                            let _ = emb_index.save();

                            // Update mod date in sync state
                            sync_state.update_mod_date(id, *mod_date);
                            updated_count += 1;
                        }
                        Err(e) => {
                            eprintln!("[apple-notes-sync] re-import {} failed: {}", id, e);
                        }
                    }
                }
            }
        }
    }

    // Remove unlinked entries
    for id in &unlinked_ids {
        sync_state.remove_link(*id);
    }

    // Persist
    if updated_count > 0 || !unlinked_ids.is_empty() {
        let _ = sync_state.save();
    }

    update_status(|s| {
        s.syncing = false;
        s.last_sync_at = Some(Local::now().to_rfc3339());
        s.last_error = None;
    });

    if updated_count > 0 {
        let _ = app.emit("apple-notes-synced", serde_json::json!({ "updated": updated_count }));
    }
}

// ── Tauri commands ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SyncStatus {
    pub enabled: bool,
    pub linked_count: usize,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub syncing: bool,
}

#[tauri::command]
pub fn apple_notes_sync_status(
    sync_state: tauri::State<'_, AppleNotesSyncState>,
) -> Result<SyncStatus, String> {
    sync_state.ensure_loaded();
    let status = snapshot_status();
    let enabled = settings::load_settings_from_file()
        .map(|s| s.apple_notes_sync.enabled)
        .unwrap_or(false);

    Ok(SyncStatus {
        enabled,
        linked_count: sync_state.count(),
        last_sync_at: status.last_sync_at,
        last_error: status.last_error,
        syncing: status.syncing,
    })
}

#[tauri::command]
pub fn apple_notes_force_sync() -> Result<(), String> {
    if let Some(tx) = SYNC_WORKER_SENDER.get() {
        let _ = tx.send(SyncMessage::ForceSync);
    }
    Ok(())
}

#[tauri::command]
pub fn apple_notes_list_linked(
    sync_state: tauri::State<'_, AppleNotesSyncState>,
) -> Result<Vec<LinkedNoteInfo>, String> {
    sync_state.ensure_loaded();
    Ok(sync_state
        .list_links()
        .into_iter()
        .map(|e| LinkedNoteInfo {
            apple_note_id: e.apple_note_id,
            stik_path: e.stik_path,
            stik_folder: e.stik_folder,
            last_synced: e.imported_at,
        })
        .collect())
}

#[tauri::command]
pub fn apple_notes_unlink(
    apple_note_id: i64,
    sync_state: tauri::State<'_, AppleNotesSyncState>,
) -> Result<(), String> {
    sync_state.ensure_loaded();
    sync_state.remove_link(apple_note_id);
    sync_state.save()
}
