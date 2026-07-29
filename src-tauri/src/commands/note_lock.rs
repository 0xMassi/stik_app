/// Note locking — AES-256-GCM encryption with file-based key storage
/// and Touch ID / device-password authentication via DarwinKit.
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
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
//
// The encryption key lives at `~/.stik/note-key` with 0600 permissions.
// Touch ID / device-password is the access gate — the key file is just
// the storage mechanism. No Keychain prompts.

fn key_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".stik").join("note-key"))
}

fn save_key_file(path: &std::path::Path, key: &[u8; 32]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, key).map_err(|e| format!("Failed to write key file: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set key file permissions: {}", e))?;
    }
    Ok(())
}

/// Migrate key from Keychain → file (one-time, then Keychain entry can be ignored).
#[cfg(target_os = "macos")]
fn migrate_from_keychain(path: &std::path::Path) -> Option<[u8; 32]> {
    use security_framework::passwords::get_generic_password;
    let data = get_generic_password("com.0xmassi.stik", "note-encryption-key").ok()?;
    if data.len() != 32 {
        return None;
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&data);
    let _ = save_key_file(path, &key);
    Some(key)
}

fn get_or_create_key() -> Result<[u8; 32], String> {
    let path = key_path()?;

    // 1. File-based key (primary)
    if path.exists() {
        let data = std::fs::read(&path).map_err(|e| format!("Failed to read key file: {}", e))?;
        if data.len() != 32 {
            return Err(format!(
                "Key file has wrong length: {} (expected 32)",
                data.len()
            ));
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&data);
        return Ok(key);
    }

    // 2. Migrate from Keychain if it exists (one-time)
    #[cfg(target_os = "macos")]
    if let Some(key) = migrate_from_keychain(&path) {
        return Ok(key);
    }

    // 3. Generate new key
    let mut key = [0u8; 32];
    rand::rng().fill_bytes(&mut key);
    save_key_file(&path, &key)?;
    Ok(key)
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
) -> Result<(), String> {
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

    Ok(())
}

/// Permanently unlock a note (decrypt and save as plaintext).
/// Requires active authentication session.
#[tauri::command]
pub fn unlock_note(
    path: String,
    index: tauri::State<'_, super::index::NoteIndex>,
) -> Result<(), String> {
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
