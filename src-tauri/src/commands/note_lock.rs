/// Note locking — AES-256-GCM encryption with macOS Keychain key storage
/// and Touch ID / device-password authentication via DarwinKit.
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use super::darwinkit;
use super::storage;

// ── Constants ────────────────────────────────────────────────────

const LOCKED_HEADER: &str = "---stik-locked---";
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

// ── Session State ────────────────────────────────────────────────

static SESSION: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));

fn is_session_unlocked(timeout_minutes: u64) -> bool {
    let guard = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    match *guard {
        Some(unlocked_at) => {
            if timeout_minutes == 0 {
                true // "until quit" — never expires
            } else {
                unlocked_at.elapsed() < Duration::from_secs(timeout_minutes * 60)
            }
        }
        None => false,
    }
}

fn unlock_session() {
    let mut guard = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(Instant::now());
}

fn lock_session_inner() {
    let mut guard = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    *guard = None;
}

// ── File Format ──────────────────────────────────────────────────

/// Check if file content represents a locked note.
pub fn is_locked_content(content: &str) -> bool {
    content.starts_with(LOCKED_HEADER)
}

/// Encrypt plaintext into the locked file format.
fn encrypt(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    rand::rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    Ok(format!(
        "{}\nnonce: {}\n{}",
        LOCKED_HEADER,
        B64.encode(nonce_bytes),
        B64.encode(ciphertext),
    ))
}

/// Decrypt the locked file format back to plaintext.
fn decrypt(locked_content: &str, key: &[u8; 32]) -> Result<String, String> {
    let lines: Vec<&str> = locked_content.lines().collect();
    if lines.len() < 3 || lines[0] != LOCKED_HEADER {
        return Err("Not a valid locked note".to_string());
    }

    let nonce_b64 = lines[1]
        .strip_prefix("nonce: ")
        .ok_or("Missing nonce line")?;
    let nonce_bytes = B64
        .decode(nonce_b64)
        .map_err(|e| format!("Invalid nonce: {}", e))?;
    if nonce_bytes.len() != 12 {
        return Err("Invalid nonce length".to_string());
    }

    // Remaining lines are the ciphertext (join in case base64 wraps)
    let ciphertext_b64: String = lines[2..].join("");
    let ciphertext = B64
        .decode(&ciphertext_b64)
        .map_err(|e| format!("Invalid ciphertext: {}", e))?;

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Decryption failed — wrong key or corrupted data".to_string())?;

    String::from_utf8(plaintext).map_err(|e| format!("Decrypted content is not valid UTF-8: {}", e))
}

// ── Key Storage ─────────────────────────────────────────────────

const KEYCHAIN_SERVICE: &str = "com.0xmassi.stik";
const KEYCHAIN_ACCOUNT: &str = "note-encryption-key";

trait KeyStore {
    fn read(&self) -> Result<Option<Vec<u8>>, String>;
    fn write(&self, key: &[u8]) -> Result<(), String>;
}

struct KeychainKeyStore;

#[cfg(target_os = "macos")]
impl KeyStore for KeychainKeyStore {
    fn read(&self) -> Result<Option<Vec<u8>>, String> {
        use security_framework::passwords::get_generic_password;
        const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
        match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
            Ok(key) => Ok(Some(key)),
            Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(error) => Err(format!("Failed to read note key from Keychain: {error}")),
        }
    }

    fn write(&self, key: &[u8]) -> Result<(), String> {
        security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key)
            .map_err(|error| format!("Failed to store note key in Keychain: {error}"))
    }
}

#[cfg(not(target_os = "macos"))]
impl KeyStore for KeychainKeyStore {
    fn read(&self) -> Result<Option<Vec<u8>>, String> {
        Err("Locked notes require macOS Keychain".to_string())
    }

    fn write(&self, _key: &[u8]) -> Result<(), String> {
        Err("Locked notes require macOS Keychain".to_string())
    }
}

fn legacy_key_path() -> Result<PathBuf, String> {
    Ok(super::paths::config_dir()?.join("note-key"))
}

fn key_from_bytes(data: &[u8], source: &str) -> Result<[u8; 32], String> {
    data.try_into().map_err(|_| {
        format!(
            "{source} key has wrong length: {} (expected 32)",
            data.len()
        )
    })
}

fn write_and_verify_key(store: &impl KeyStore, key: &[u8; 32]) -> Result<(), String> {
    store.write(key)?;
    let persisted = store
        .read()?
        .ok_or_else(|| "Keychain write could not be verified".to_string())?;
    if persisted.as_slice() != key {
        return Err("Keychain write verification did not match".to_string());
    }
    Ok(())
}

fn get_or_create_key_with<F>(
    store: &impl KeyStore,
    legacy_path: &Path,
    generate: F,
) -> Result<[u8; 32], String>
where
    F: FnOnce() -> [u8; 32],
{
    // The file was the primary store in v0.8 and must win if both locations
    // exist. Remove it only after a matching Keychain read-back.
    if legacy_path.exists() {
        let data = std::fs::read(legacy_path)
            .map_err(|error| format!("Failed to read legacy key file: {error}"))?;
        let key = key_from_bytes(&data, "Legacy")?;
        write_and_verify_key(store, &key)?;
        std::fs::remove_file(legacy_path)
            .map_err(|error| format!("Failed to remove migrated key file: {error}"))?;
        return Ok(key);
    }

    if let Some(data) = store.read()? {
        return key_from_bytes(&data, "Keychain");
    }

    let key = generate();
    write_and_verify_key(store, &key)?;
    Ok(key)
}

fn get_or_create_key() -> Result<[u8; 32], String> {
    if super::paths::dev_root()?.is_some() {
        return Err(
            "Keychain note locking is unavailable in the isolated development profile".into(),
        );
    }
    let legacy = legacy_key_path()?;
    get_or_create_key_with(&KeychainKeyStore, &legacy, || {
        let mut key = [0u8; 32];
        rand::rng().fill_bytes(&mut key);
        key
    })
}

fn authorize_managed_note_path(root: &Path, path: &Path) -> Result<PathBuf, String> {
    super::path_security::authorize_existing_path(root, path)
}

fn managed_note_path(path: &str) -> Result<String, String> {
    let root = super::folders::get_stik_folder()?;
    let authorized = authorize_managed_note_path(&root, Path::new(path))?;
    Ok(authorized.to_string_lossy().to_string())
}

// ── Authentication ───────────────────────────────────────────────

fn trigger_auth(reason: &str) -> Result<bool, String> {
    let result = darwinkit::call_with_timeout(
        "auth.authenticate",
        Some(serde_json::json!({ "reason": reason })),
        60, // 60s — user may need time with Touch ID / password
    )?;

    result
        .get("success")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| "auth.authenticate returned unexpected response".to_string())
}

// ── Settings ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct NoteLockSettings {
    pub enabled: bool,
    pub timeout_minutes: u64,
    pub lock_on_sleep: bool,
}

impl Default for NoteLockSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            timeout_minutes: 15,
            lock_on_sleep: true,
        }
    }
}

// ── Tauri Commands ───────────────────────────────────────────────

#[tauri::command]
pub fn auth_available() -> Result<bool, String> {
    let result = darwinkit::call("auth.available", None)?;
    Ok(result
        .get("available")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}

#[tauri::command]
pub fn authenticate() -> Result<bool, String> {
    let settings = super::settings::load_settings_from_file().unwrap_or_default();
    let timeout = settings.note_lock.timeout_minutes;

    if is_session_unlocked(timeout) {
        return Ok(true);
    }

    let success = trigger_auth("Stik wants to access locked notes")?;
    if success {
        unlock_session();
    }
    Ok(success)
}

#[tauri::command]
pub fn is_authenticated() -> Result<bool, String> {
    let settings = super::settings::load_settings_from_file().unwrap_or_default();
    Ok(is_session_unlocked(settings.note_lock.timeout_minutes))
}

#[tauri::command]
pub fn lock_session() -> Result<(), String> {
    lock_session_inner();
    Ok(())
}

#[tauri::command]
pub fn lock_note(
    path: String,
    index: tauri::State<'_, super::index::NoteIndex>,
    embeddings: tauri::State<'_, super::embeddings::EmbeddingIndex>,
) -> Result<(), String> {
    let path = managed_note_path(&path)?;
    let content = storage::read_file(&path)?;

    if is_locked_content(&content) {
        return Err("Note is already locked".to_string());
    }

    let folder = index.get(&path).map(|e| e.folder).unwrap_or_default();

    let key = get_or_create_key()?;
    let locked = encrypt(&content, &key)?;
    storage::write_file(&path, &locked)?;

    // Re-index so the UI sees the updated locked state
    index.add(&path, &folder);

    // The embedding is derived from plaintext, so keeping it would leave a
    // readable shadow of a locked note in ~/.stik/embeddings.json. build_embeddings
    // already skips locked notes; this closes the same hole on the way in.
    embeddings.remove_entry(&path);
    let _ = embeddings.save();

    Ok(())
}

/// Permanently unlock a note (decrypt and save as plaintext).
/// Requires active authentication session.
#[tauri::command]
pub fn unlock_note(
    path: String,
    index: tauri::State<'_, super::index::NoteIndex>,
) -> Result<(), String> {
    let path = managed_note_path(&path)?;
    let settings = super::settings::load_settings_from_file().unwrap_or_default();
    if !is_session_unlocked(settings.note_lock.timeout_minutes) {
        return Err("Not authenticated".to_string());
    }

    let content = storage::read_file(&path)?;
    if !is_locked_content(&content) {
        return Ok(()); // Already unlocked
    }

    let folder = index.get(&path).map(|e| e.folder).unwrap_or_default();

    let key = get_or_create_key()?;
    let plaintext = decrypt(&content, &key)?;
    storage::write_file(&path, &plaintext)?;

    // Re-index so the UI sees the updated unlocked state
    index.add(&path, &folder);

    Ok(())
}

/// Read a locked note's decrypted content (in-memory only, doesn't modify the file).
/// Requires active authentication session.
#[tauri::command]
pub fn read_locked_note(path: String) -> Result<String, String> {
    let path = managed_note_path(&path)?;
    let settings = super::settings::load_settings_from_file().unwrap_or_default();
    if !is_session_unlocked(settings.note_lock.timeout_minutes) {
        return Err("Not authenticated".to_string());
    }

    let content = storage::read_file(&path)?;
    if !is_locked_content(&content) {
        return Ok(content);
    }

    let key = get_or_create_key()?;
    decrypt(&content, &key)
}

/// Save content to a locked note (encrypts before writing).
/// Used by the editor when saving changes to a note that's lock-protected.
#[tauri::command]
pub fn save_locked_note(path: String, content: String) -> Result<(), String> {
    let path = managed_note_path(&path)?;
    let settings = super::settings::load_settings_from_file().unwrap_or_default();
    if !is_session_unlocked(settings.note_lock.timeout_minutes) {
        return Err("Not authenticated".to_string());
    }

    let key = get_or_create_key()?;
    let locked = encrypt(&content, &key)?;
    storage::write_file(&path, &locked)?;

    Ok(())
}

/// Check if a note at the given path is locked.
#[tauri::command]
pub fn is_note_locked(path: String) -> Result<bool, String> {
    let path = managed_note_path(&path)?;
    let content = storage::read_file(&path)?;
    Ok(is_locked_content(&content))
}

/// Export the encryption key as base64 for recovery purposes.
/// Requires active authentication session.
#[tauri::command]
pub fn export_recovery_key() -> Result<String, String> {
    let settings = super::settings::load_settings_from_file().unwrap_or_default();
    if !is_session_unlocked(settings.note_lock.timeout_minutes) {
        return Err("Not authenticated".to_string());
    }

    let key = get_or_create_key()?;
    Ok(B64.encode(key))
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[derive(Default)]
    struct MemoryKeyStore {
        value: Mutex<Option<Vec<u8>>>,
        corrupt_reads: bool,
    }

    impl KeyStore for MemoryKeyStore {
        fn read(&self) -> Result<Option<Vec<u8>>, String> {
            let value = self
                .value
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone();
            if self.corrupt_reads && value.is_some() {
                Ok(Some(vec![0; 31]))
            } else {
                Ok(value)
            }
        }

        fn write(&self, key: &[u8]) -> Result<(), String> {
            *self.value.lock().unwrap_or_else(|error| error.into_inner()) = Some(key.to_vec());
            Ok(())
        }
    }

    fn temp_path(label: &str) -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("stik-key-{label}-{nonce}"))
            .join("note-key")
    }

    #[test]
    fn creates_and_reads_a_key_from_the_store() {
        let store = MemoryKeyStore::default();
        let legacy = temp_path("create");

        let created = get_or_create_key_with(&store, &legacy, || [7; 32]).unwrap();
        let loaded = get_or_create_key_with(&store, &legacy, || [9; 32]).unwrap();

        assert_eq!(created, [7; 32]);
        assert_eq!(loaded, created);
        assert!(!legacy.exists());

        let _ = fs::remove_dir_all(legacy.parent().unwrap());
    }

    #[test]
    fn migrates_a_legacy_file_only_after_store_readback_matches() {
        let store = MemoryKeyStore::default();
        let legacy = temp_path("migrate");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, [4; 32]).unwrap();

        let key = get_or_create_key_with(&store, &legacy, || [8; 32]).unwrap();

        assert_eq!(key, [4; 32]);
        assert!(!legacy.exists());
        assert_eq!(store.read().unwrap(), Some(vec![4; 32]));

        let _ = fs::remove_dir_all(legacy.parent().unwrap());
    }

    #[test]
    fn failed_store_verification_keeps_the_legacy_key() {
        let store = MemoryKeyStore {
            corrupt_reads: true,
            ..MemoryKeyStore::default()
        };
        let legacy = temp_path("verify-failure");
        fs::create_dir_all(legacy.parent().unwrap()).unwrap();
        fs::write(&legacy, [5; 32]).unwrap();

        assert!(get_or_create_key_with(&store, &legacy, || [8; 32]).is_err());
        assert_eq!(fs::read(&legacy).unwrap(), vec![5; 32]);

        let _ = fs::remove_dir_all(legacy.parent().unwrap());
    }

    #[test]
    fn managed_note_authorization_rejects_outside_and_symlink_paths() {
        let root = temp_path("root").parent().unwrap().to_path_buf();
        let outside_root = temp_path("outside").parent().unwrap().to_path_buf();
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside_root).unwrap();
        let inside = root.join("nested/note.md");
        fs::create_dir_all(inside.parent().unwrap()).unwrap();
        fs::write(&inside, "note").unwrap();
        let outside = outside_root.join("secret.md");
        fs::write(&outside, "secret").unwrap();

        assert_eq!(
            authorize_managed_note_path(&root, &inside).unwrap(),
            inside.canonicalize().unwrap()
        );
        assert!(authorize_managed_note_path(&root, &outside).is_err());

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, root.join("linked.md")).unwrap();
            assert!(authorize_managed_note_path(&root, &root.join("linked.md")).is_err());
        }

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside_root);
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let plaintext = "# My secret note\n\nThis is confidential.";

        let locked = encrypt(plaintext, &key).unwrap();
        assert!(locked.starts_with(LOCKED_HEADER));
        assert!(is_locked_content(&locked));

        let decrypted = decrypt(&locked, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_key_fails() {
        let key1 = [42u8; 32];
        let key2 = [99u8; 32];
        let plaintext = "secret";

        let locked = encrypt(plaintext, &key1).unwrap();
        let result = decrypt(&locked, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn test_not_locked() {
        assert!(!is_locked_content("# Normal note"));
        assert!(!is_locked_content(""));
    }

    #[test]
    fn test_is_locked() {
        assert!(is_locked_content("---stik-locked---\nnonce: abc\ndata"));
    }

    #[test]
    fn test_empty_content() {
        let key = [42u8; 32];
        let locked = encrypt("", &key).unwrap();
        let decrypted = decrypt(&locked, &key).unwrap();
        assert_eq!(decrypted, "");
    }

    #[test]
    fn test_unicode_content() {
        let key = [42u8; 32];
        let plaintext = "# 日本語のノート\n\nEmoji: 🔒🗝️";
        let locked = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&locked, &key).unwrap();
        assert_eq!(decrypted, plaintext);
    }
}
