use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub head: usize,
    pub anchor: usize,
}

fn get_cursor_positions_path() -> Result<PathBuf, String> {
    let stik_config = super::paths::config_dir()?;
    Ok(stik_config.join("cursor_positions.json"))
}

fn load_positions() -> Result<HashMap<String, CursorPosition>, String> {
    let path = get_cursor_positions_path()?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn write_positions(positions: &HashMap<String, CursorPosition>) -> Result<(), String> {
    let path = get_cursor_positions_path()?;
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string(positions).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cursor_position(id: String) -> Result<Option<CursorPosition>, String> {
    let positions = load_positions()?;
    Ok(positions.get(&id).cloned())
}

#[tauri::command]
pub fn save_cursor_position(id: String, head: usize, anchor: usize) -> Result<(), String> {
    let mut positions = load_positions()?;
    positions.insert(id, CursorPosition { head, anchor });
    write_positions(&positions)
}

#[tauri::command]
pub fn remove_cursor_position(id: String) -> Result<(), String> {
    let mut positions = load_positions()?;
    positions.remove(&id);
    write_positions(&positions)
}
