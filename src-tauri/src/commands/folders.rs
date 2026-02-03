use std::fs;
use std::path::PathBuf;

/// Get the Stik folder path (~/Documents/Stik)
pub fn get_stik_folder() -> Result<PathBuf, String> {
    let home = dirs::document_dir().ok_or("Could not find Documents directory")?;
    let stik_folder = home.join("Stik");

    // Ensure base folder exists
    fs::create_dir_all(&stik_folder).map_err(|e| e.to_string())?;

    Ok(stik_folder)
}

/// Ensure default folders exist
fn ensure_default_folders(stik_folder: &PathBuf) -> Result<(), String> {
    let defaults = ["Inbox", "Work", "Ideas", "Personal", "Projects"];

    for folder in defaults {
        let path = stik_folder.join(folder);
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_folders() -> Result<Vec<String>, String> {
    let stik_folder = get_stik_folder()?;

    // Ensure defaults exist
    ensure_default_folders(&stik_folder)?;

    // List all directories
    let entries = fs::read_dir(&stik_folder).map_err(|e| e.to_string())?;

    let mut folders: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();

    // Sort with Inbox first, then alphabetically
    folders.sort_by(|a, b| {
        if a == "Inbox" {
            std::cmp::Ordering::Less
        } else if b == "Inbox" {
            std::cmp::Ordering::Greater
        } else {
            a.cmp(b)
        }
    });

    Ok(folders)
}

#[tauri::command]
pub fn create_folder(name: String) -> Result<bool, String> {
    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(&name);

    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

    Ok(true)
}
