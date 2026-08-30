use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

trait TrashStorage {
    fn exists(&self, path: &Path) -> bool;
    fn ensure_dir(&self, path: &Path) -> Result<(), String>;
    fn read(&self, path: &Path) -> Result<String, String>;
    fn write(&self, path: &Path, content: &str) -> Result<(), String>;
    fn move_path(&self, source: &Path, destination: &Path) -> Result<(), String>;
    fn delete(&self, path: &Path) -> Result<(), String>;
    fn list(&self, path: &Path) -> Result<Vec<PathBuf>, String>;
}

struct LocalTrashStorage;

impl TrashStorage for LocalTrashStorage {
    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn ensure_dir(&self, path: &Path) -> Result<(), String> {
        fs::create_dir_all(path).map_err(|error| error.to_string())
    }

    fn read(&self, path: &Path) -> Result<String, String> {
        fs::read_to_string(path).map_err(|error| error.to_string())
    }

    fn write(&self, path: &Path, content: &str) -> Result<(), String> {
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, content).map_err(|error| error.to_string())?;
        fs::rename(&temporary, path).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            error.to_string()
        })
    }

    fn move_path(&self, source: &Path, destination: &Path) -> Result<(), String> {
        fs::rename(source, destination).map_err(|error| error.to_string())
    }

    fn delete(&self, path: &Path) -> Result<(), String> {
        fs::remove_file(path).map_err(|error| error.to_string())
    }

    fn list(&self, path: &Path) -> Result<Vec<PathBuf>, String> {
        Ok(fs::read_dir(path)
            .map_err(|error| error.to_string())?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .collect())
    }
}

struct AppTrashStorage;

impl TrashStorage for AppTrashStorage {
    fn exists(&self, path: &Path) -> bool {
        super::storage::path_exists(&path.to_string_lossy())
    }

    fn ensure_dir(&self, path: &Path) -> Result<(), String> {
        super::storage::ensure_dir(&path.to_string_lossy())
    }

    fn read(&self, path: &Path) -> Result<String, String> {
        super::storage::read_file(&path.to_string_lossy())
    }

    fn write(&self, path: &Path, content: &str) -> Result<(), String> {
        super::storage::write_file(&path.to_string_lossy(), content)
    }

    fn move_path(&self, source: &Path, destination: &Path) -> Result<(), String> {
        super::storage::move_file(&source.to_string_lossy(), &destination.to_string_lossy())
    }

    fn delete(&self, path: &Path) -> Result<(), String> {
        super::storage::delete_file(&path.to_string_lossy())
    }

    fn list(&self, path: &Path) -> Result<Vec<PathBuf>, String> {
        super::storage::list_dir(&path.to_string_lossy()).map(|entries| {
            entries
                .into_iter()
                .filter(|entry| !entry.is_directory)
                .map(|entry| path.join(entry.name))
                .collect()
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrashedNote {
    pub id: String,
    pub original_relative_path: String,
    pub filename: String,
    pub folder: String,
    pub deleted_at: String,
}

fn trash_directory(root: &Path) -> Result<PathBuf, String> {
    super::path_security::authorize_new_path(root, &root.join(".trash"))
}

fn trashed_note_path(root: &Path, entry: &TrashedNote) -> Result<PathBuf, String> {
    let extension = Path::new(&entry.filename)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| matches!(value.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .ok_or_else(|| "Trashed note has an invalid extension".to_string())?;
    let trash = trash_directory(root)?;
    super::path_security::authorize_new_path(
        &trash,
        &trash.join(format!("{}.{}", entry.id, extension)),
    )
}

fn metadata_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(id).map_err(|_| "Invalid trash identifier".to_string())?;
    let trash = trash_directory(root)?;
    super::path_security::authorize_new_path(&trash, &trash.join(format!("{id}.json")))
}

fn write_metadata(
    storage: &impl TrashStorage,
    path: &Path,
    entry: &TrashedNote,
) -> Result<(), String> {
    let content = serde_json::to_string_pretty(entry).map_err(|error| error.to_string())?;
    storage.write(path, &content)
}

fn trash_note_with(
    storage: &impl TrashStorage,
    root: &Path,
    note: &Path,
) -> Result<TrashedNote, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Cannot resolve notes root: {error}"))?;
    let authorized_note = super::path_security::authorize_existing_path(root, note)?;
    let relative = authorized_note
        .strip_prefix(&canonical_root)
        .map_err(|_| "Note is outside the notes root".to_string())?;
    let filename = authorized_note
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Note has no filename".to_string())?
        .to_string();
    let extension = Path::new(&filename)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| matches!(value.as_str(), "md" | "markdown"))
        .ok_or_else(|| "Only Markdown notes can be trashed".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let relative_string = relative.to_string_lossy().replace('\\', "/");
    let folder = relative
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let entry = TrashedNote {
        id: id.clone(),
        original_relative_path: relative_string,
        filename,
        folder,
        deleted_at: chrono::Utc::now().to_rfc3339(),
    };

    let trash = trash_directory(root)?;
    storage.ensure_dir(&trash)?;
    let destination = super::path_security::authorize_new_path(
        &trash,
        &trash.join(format!("{id}.{extension}")),
    )?;
    let metadata = metadata_path(root, &id)?;
    write_metadata(storage, &metadata, &entry)?;
    if let Err(error) = storage.move_path(&authorized_note, &destination) {
        let _ = storage.delete(&metadata);
        return Err(error);
    }

    Ok(entry)
}

fn list_trashed_notes_with(
    storage: &impl TrashStorage,
    root: &Path,
) -> Result<Vec<TrashedNote>, String> {
    let trash = trash_directory(root)?;
    if !storage.exists(&trash) {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for path in storage.list(&trash)? {
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let content = match storage.read(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let entry: TrashedNote = match serde_json::from_str(&content) {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if metadata_path(root, &entry.id).ok().as_deref() != Some(path.as_path()) {
            continue;
        }
        if trashed_note_path(root, &entry)
            .map(|note| storage.exists(&note))
            .unwrap_or(false)
        {
            entries.push(entry);
        }
    }
    entries.sort_by(|left, right| right.deleted_at.cmp(&left.deleted_at));
    Ok(entries)
}

fn restore_trashed_note_with(
    storage: &impl TrashStorage,
    root: &Path,
    id: &str,
) -> Result<PathBuf, String> {
    let metadata = metadata_path(root, id)?;
    let content = storage.read(&metadata)?;
    let entry: TrashedNote = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    if entry.id != id {
        return Err("Trash metadata identifier does not match".to_string());
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Cannot resolve notes root: {error}"))?;
    let target = super::path_security::authorize_new_path(
        root,
        &canonical_root.join(&entry.original_relative_path),
    )?;
    if storage.exists(&target) {
        return Err("A note already exists at the restore location".to_string());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "Restore target has no parent".to_string())?;
    storage.ensure_dir(parent)?;

    let trashed = trashed_note_path(root, &entry)?;
    let trashed = super::path_security::authorize_existing_path(&trash_directory(root)?, &trashed)?;
    storage.move_path(&trashed, &target)?;
    storage.delete(&metadata)?;
    target
        .canonicalize()
        .map_err(|error| format!("Cannot resolve restored note: {error}"))
}

fn purge_trashed_note_with(
    storage: &impl TrashStorage,
    root: &Path,
    id: &str,
) -> Result<(), String> {
    let metadata = metadata_path(root, id)?;
    let content = storage.read(&metadata)?;
    let entry: TrashedNote = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    if entry.id != id {
        return Err("Trash metadata identifier does not match".to_string());
    }

    let trashed = trashed_note_path(root, &entry)?;
    let trashed = super::path_security::authorize_existing_path(&trash_directory(root)?, &trashed)?;
    storage.delete(&trashed)?;
    storage.delete(&metadata)
}

pub fn trash_note_at(root: &Path, note: &Path) -> Result<TrashedNote, String> {
    trash_note_with(&LocalTrashStorage, root, note)
}

pub fn list_trashed_notes_at(root: &Path) -> Result<Vec<TrashedNote>, String> {
    list_trashed_notes_with(&LocalTrashStorage, root)
}

pub fn restore_trashed_note_at(root: &Path, id: &str) -> Result<PathBuf, String> {
    restore_trashed_note_with(&LocalTrashStorage, root, id)
}

pub fn purge_trashed_note_at(root: &Path, id: &str) -> Result<(), String> {
    purge_trashed_note_with(&LocalTrashStorage, root, id)
}

pub fn trash_managed_note(root: &Path, note: &Path) -> Result<TrashedNote, String> {
    trash_note_with(&AppTrashStorage, root, note)
}

#[tauri::command]
pub fn list_trashed_notes() -> Result<Vec<TrashedNote>, String> {
    let root = super::folders::get_stik_folder()?;
    list_trashed_notes_with(&AppTrashStorage, &root)
}

#[tauri::command]
pub fn restore_trashed_note(
    id: String,
    index: tauri::State<'_, super::index::NoteIndex>,
    embeddings: tauri::State<'_, super::embeddings::EmbeddingIndex>,
) -> Result<String, String> {
    let root = super::folders::get_stik_folder()?;
    let restored = restore_trashed_note_with(&AppTrashStorage, &root, &id)?;
    let restored_string = restored.to_string_lossy().to_string();
    let folder = super::folders::note_folder(&root, &restored);
    index.add(&restored_string, &folder);
    if let Ok(content) = super::storage::read_file(&restored_string) {
        if let Some(embedding) = super::embeddings::embed_content(&content) {
            embeddings.add_entry(&restored_string, embedding);
            let _ = embeddings.save();
        }
    }
    Ok(restored_string)
}

#[tauri::command]
pub fn purge_trashed_note(id: String) -> Result<(), String> {
    let root = super::folders::get_stik_folder()?;
    purge_trashed_note_with(&AppTrashStorage, &root, &id)
}

#[cfg(test)]
mod tests {
    use super::{
        list_trashed_notes_at, purge_trashed_note_at, restore_trashed_note_at, trash_note_at,
    };
    use std::fs;
    use std::path::PathBuf;

    fn temp_root(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("stik-trash-{label}-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn trash_and_restore_preserve_a_nested_note_path() {
        let root = temp_root("roundtrip");
        let note = root.join("Projects/Work/plan.md");
        fs::create_dir_all(note.parent().unwrap()).unwrap();
        fs::write(&note, "# plan").unwrap();

        let entry = trash_note_at(&root, &note).unwrap();
        assert!(!note.exists());
        assert_eq!(entry.original_relative_path, "Projects/Work/plan.md");
        assert_eq!(list_trashed_notes_at(&root).unwrap(), vec![entry.clone()]);

        let restored = restore_trashed_note_at(&root, &entry.id).unwrap();
        assert_eq!(restored, note.canonicalize().unwrap());
        assert_eq!(fs::read_to_string(&note).unwrap(), "# plan");
        assert!(list_trashed_notes_at(&root).unwrap().is_empty());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_refuses_to_overwrite_a_conflicting_note() {
        let root = temp_root("conflict");
        let note = root.join("Inbox/note.md");
        fs::create_dir_all(note.parent().unwrap()).unwrap();
        fs::write(&note, "original").unwrap();

        let entry = trash_note_at(&root, &note).unwrap();
        fs::write(&note, "new content").unwrap();

        assert!(restore_trashed_note_at(&root, &entry.id).is_err());
        assert_eq!(fs::read_to_string(&note).unwrap(), "new content");
        assert_eq!(list_trashed_notes_at(&root).unwrap(), vec![entry]);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn purge_permanently_removes_only_the_trashed_copy() {
        let root = temp_root("purge");
        let note = root.join("Inbox/temporary.md");
        fs::create_dir_all(note.parent().unwrap()).unwrap();
        fs::write(&note, "temporary").unwrap();

        let entry = trash_note_at(&root, &note).unwrap();
        purge_trashed_note_at(&root, &entry.id).unwrap();

        assert!(!note.exists());
        assert!(list_trashed_notes_at(&root).unwrap().is_empty());

        let _ = fs::remove_dir_all(root);
    }
}
