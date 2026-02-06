use super::versioning;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickedNote {
    pub id: String,
    pub content: String,
    pub folder: String,
    pub position: Option<(f64, f64)>,
    pub size: Option<(f64, f64)>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StickedNotesStore {
    pub notes: Vec<StickedNote>,
}

fn get_sticked_notes_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("sticked_notes.json"))
}

fn load_sticked_notes() -> Result<StickedNotesStore, String> {
    let path = get_sticked_notes_path()?;
    match versioning::load_versioned::<StickedNotesStore>(&path)? {
        Some(store) => Ok(store),
        None => Ok(StickedNotesStore::default()),
    }
}

fn save_sticked_notes(store: &StickedNotesStore) -> Result<(), String> {
    let path = get_sticked_notes_path()?;
    versioning::save_versioned(&path, store)
}

#[tauri::command]
pub fn list_sticked_notes() -> Result<Vec<StickedNote>, String> {
    let store = load_sticked_notes()?;
    Ok(store.notes)
}

#[tauri::command]
pub fn create_sticked_note(
    content: String,
    folder: String,
    position: Option<(f64, f64)>,
) -> Result<StickedNote, String> {
    let mut store = load_sticked_notes()?;

    let now = chrono::Utc::now().to_rfc3339();
    let note = StickedNote {
        id: Uuid::new_v4().to_string(),
        content,
        folder,
        position,
        size: Some((400.0, 280.0)),
        created_at: now.clone(),
        updated_at: now,
    };

    store.notes.push(note.clone());
    save_sticked_notes(&store)?;

    Ok(note)
}

#[tauri::command]
pub fn update_sticked_note(
    id: String,
    content: Option<String>,
    folder: Option<String>,
    position: Option<(f64, f64)>,
    size: Option<(f64, f64)>,
) -> Result<StickedNote, String> {
    let mut store = load_sticked_notes()?;

    let note = store
        .notes
        .iter_mut()
        .find(|n| n.id == id)
        .ok_or_else(|| format!("Sticked note not found: {}", id))?;

    if let Some(c) = content {
        note.content = c;
    }
    if let Some(f) = folder {
        note.folder = f;
    }
    if let Some(p) = position {
        note.position = Some(p);
    }
    if let Some(s) = size {
        note.size = Some(s);
    }
    note.updated_at = chrono::Utc::now().to_rfc3339();

    let updated_note = note.clone();
    save_sticked_notes(&store)?;

    Ok(updated_note)
}

#[tauri::command]
pub fn close_sticked_note(id: String, save_to_folder: bool) -> Result<bool, String> {
    let mut store = load_sticked_notes()?;

    let note_idx = store
        .notes
        .iter()
        .position(|n| n.id == id)
        .ok_or_else(|| format!("Sticked note not found: {}", id))?;

    let note = store.notes.remove(note_idx);

    // Save content to folder if requested and has content
    if save_to_folder && !note.content.trim().is_empty() {
        use crate::commands::notes::save_note_inner;
        save_note_inner(note.folder, note.content)?;
    }

    save_sticked_notes(&store)?;

    Ok(true)
}

#[tauri::command]
pub fn get_sticked_note(id: String) -> Result<StickedNote, String> {
    let store = load_sticked_notes()?;

    store
        .notes
        .into_iter()
        .find(|n| n.id == id)
        .ok_or_else(|| format!("Sticked note not found: {}", id))
}
