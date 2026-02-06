use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;

const CURRENT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct VersionedStore {
    version: u32,
    data: Value,
}

/// Load a versioned JSON file. Handles both legacy (unversioned) and versioned formats.
/// Returns the deserialized data after applying any necessary migrations.
pub fn load_versioned<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    // Check if it's a versioned store (has "version" and "data" keys)
    if let Some(obj) = value.as_object() {
        if obj.contains_key("version") && obj.contains_key("data") {
            let store: VersionedStore =
                serde_json::from_value(value).map_err(|e| e.to_string())?;
            let migrated = migrate(store.version, store.data)?;
            let result: T = serde_json::from_value(migrated).map_err(|e| e.to_string())?;
            return Ok(Some(result));
        }
    }

    // Legacy unversioned format — treat as version 0, migrate to current
    let migrated = migrate(0, value)?;
    let result: T = serde_json::from_value(migrated).map_err(|e| e.to_string())?;
    Ok(Some(result))
}

/// Save data in versioned format.
pub fn save_versioned<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let data_value = serde_json::to_value(data).map_err(|e| e.to_string())?;
    let store = VersionedStore {
        version: CURRENT_VERSION,
        data: data_value,
    };
    let content = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;

    // Atomic write via temp file
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &content).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, path).map_err(|e| e.to_string())
}

/// Apply migrations from `from_version` to CURRENT_VERSION.
/// Version 0 → 1 is a no-op (data format unchanged, just wrapping in envelope).
fn migrate(from_version: u32, data: Value) -> Result<Value, String> {
    let mut current = data;
    let mut version = from_version;

    while version < CURRENT_VERSION {
        current = match version {
            0 => migrate_v0_to_v1(current)?,
            _ => return Err(format!("Unknown migration version: {}", version)),
        };
        version += 1;
    }

    Ok(current)
}

/// v0 → v1: No structural changes, just wrapping in versioned envelope.
fn migrate_v0_to_v1(data: Value) -> Result<Value, String> {
    Ok(data)
}
