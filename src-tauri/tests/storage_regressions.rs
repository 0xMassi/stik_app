//! Release regressions against real files in a process-local development vault.
#![cfg(debug_assertions)]

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use stik_lib::{embeddings::EmbeddingIndex, index::NoteIndex, notes, settings, storage, trash};

// All tests share one process-local settings/cache directory; each test may
// still create its own concurrent writers/movers inside this guard.
static PROFILE: Mutex<()> = Mutex::new(());

fn vault() -> &'static PathBuf {
    static VAULT: OnceLock<PathBuf> = OnceLock::new();
    VAULT.get_or_init(|| {
        let profile = std::env::temp_dir().join(format!("stik-release-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&profile).unwrap();
        std::env::set_var("STIK_DEV_ROOT", &profile);
        settings::get_settings().unwrap();
        eprintln!("Release regression data: {}", profile.display());
        storage::stik_root().unwrap()
    })
}

#[test]
fn trash_watcher_events_do_not_resurrect_deleted_notes() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let root = vault();
    let saved =
        notes::save_note_inner("TrashRegression".into(), "trash-only-marker".into()).unwrap();
    let index = NoteIndex::new();
    index.add(&saved.path, &saved.folder);
    let trashed = trash::trash_managed_note(root, std::path::Path::new(&saved.path)).unwrap();
    index.remove(&saved.path);
    let trash_path = root.join(".trash").join(format!("{}.md", trashed.id));
    index.notify_external_change(&[
        saved.path.clone(),
        trash_path.to_string_lossy().into_owned(),
    ]);
    assert!(index.search("trash-only-marker", None).unwrap().is_empty());
    let restored = trash::restore_trashed_note_at(root, &trashed.id).unwrap();
    index.notify_external_change(&[restored.to_string_lossy().into_owned()]);
    assert_eq!(index.search("trash-only-marker", None).unwrap().len(), 1);
}

#[test]
fn conflicting_note_move_leaves_both_notes_and_assets_unchanged() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let root = vault();
    let from = root.join("MoveSource");
    let to = root.join("MoveDestination");
    std::fs::create_dir_all(from.join(".assets")).unwrap();
    std::fs::create_dir_all(to.join(".assets")).unwrap();
    let source = from.join("meeting.md");
    let destination = to.join("meeting.md");
    let content = "source ![image](.assets/shared.png)";
    std::fs::write(&source, content).unwrap();
    std::fs::write(&destination, "destination content").unwrap();
    std::fs::write(from.join(".assets/shared.png"), "source image").unwrap();
    std::fs::write(to.join(".assets/shared.png"), "destination image").unwrap();

    assert!(notes::move_note_inner(
        source.to_string_lossy().into_owned(),
        "MoveDestination".into(),
        &NoteIndex::new(),
        &EmbeddingIndex::new()
    )
    .is_err());
    assert_eq!(std::fs::read_to_string(source).unwrap(), content);
    assert_eq!(
        std::fs::read_to_string(destination).unwrap(),
        "destination content"
    );
    assert_eq!(
        std::fs::read_to_string(from.join(".assets/shared.png")).unwrap(),
        "source image"
    );
    assert_eq!(
        std::fs::read_to_string(to.join(".assets/shared.png")).unwrap(),
        "destination image"
    );
}

#[test]
fn racing_moves_never_replace_the_winning_note() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let directory = vault().join("RacingMoves");
    std::fs::create_dir(&directory).unwrap();
    let destination = directory.join("winner.md");
    let barrier = std::sync::Barrier::new(4);
    let winners: Vec<_> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..4)
            .map(|id| {
                let source = directory.join(format!("source-{id}.md"));
                std::fs::write(&source, id.to_string()).unwrap();
                let destination = &destination;
                let barrier = &barrier;
                scope.spawn(move || {
                    barrier.wait();
                    let moved =
                        storage::move_file(source.to_str().unwrap(), destination.to_str().unwrap())
                            .is_ok();
                    assert_eq!(source.exists(), !moved);
                    (id, moved)
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .filter_map(|(id, moved)| moved.then_some(id))
            .collect()
    });
    assert_eq!(winners.len(), 1);
    assert_eq!(
        std::fs::read_to_string(destination).unwrap(),
        winners[0].to_string()
    );
}

#[test]
fn ordinary_update_cannot_replace_locked_content() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let note = vault().join("locked-regression.md");
    let ciphertext = "---stik-locked---\nnonce: fixture\nencrypted-fixture";
    std::fs::write(&note, ciphertext).unwrap();
    assert!(notes::update_note_inner(
        note.to_string_lossy().into_owned(),
        "plaintext".into(),
        &NoteIndex::new(),
        &EmbeddingIndex::new(),
        None
    )
    .is_err());
    assert_eq!(std::fs::read_to_string(note).unwrap(), ciphertext);
}

#[test]
fn explicit_empty_editor_save_preserves_the_file_but_default_still_trashes() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let note = vault().join("empty-editor.md");
    std::fs::write(&note, "draft").unwrap();
    let index = NoteIndex::new();
    let embeddings = EmbeddingIndex::new();
    let saved = notes::update_note_inner(
        note.to_string_lossy().into_owned(),
        String::new(),
        &index,
        &embeddings,
        Some(true),
    )
    .unwrap();
    assert!(!saved.path.is_empty());
    assert_eq!(std::fs::read_to_string(&note).unwrap(), "");

    let saved = notes::update_note_inner(
        note.to_string_lossy().into_owned(),
        String::new(),
        &index,
        &embeddings,
        None,
    )
    .unwrap();
    assert!(saved.path.is_empty());
    assert!(!note.exists());
}

#[test]
fn folder_rename_immediately_updates_nested_search_and_embedding_paths() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let root = vault();
    let saved =
        notes::save_note_inner("RenameTree/Nested".into(), "rename-tree-marker".into()).unwrap();
    let sibling =
        notes::save_note_inner("RenameTreeOther".into(), "rename-sibling-marker".into()).unwrap();
    let index = NoteIndex::new();
    index.add(&saved.path, &saved.folder);
    index.add(&sibling.path, &sibling.folder);
    let embeddings = EmbeddingIndex::new();
    embeddings.ensure_loaded();
    embeddings.add_entry(
        &saved.path,
        stik_lib::embeddings::NoteEmbedding {
            vector: vec![1.0, 2.0],
            content_hash: "unchanged-body".into(),
            language: "en".into(),
        },
    );

    stik_lib::folders::rename_folder_inner(
        "RenameTree".into(),
        "RenamedTree".into(),
        &index,
        &embeddings,
    )
    .unwrap();

    let renamed_path = root
        .join("RenamedTree/Nested")
        .join(&saved.filename)
        .to_string_lossy()
        .into_owned();
    let results = index.search("rename-tree-marker", None).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].0.path, renamed_path);
    assert_eq!(results[0].0.folder, "RenamedTree/Nested");
    assert!(std::path::Path::new(&results[0].0.path).exists());
    assert!(index.get(&saved.path).is_none());
    assert_eq!(
        index.search("rename-sibling-marker", None).unwrap()[0]
            .0
            .path,
        sibling.path
    );
    assert_eq!(
        embeddings.get_hash(&renamed_path).as_deref(),
        Some("unchanged-body")
    );
    assert!(embeddings.get_hash(&saved.path).is_none());
}

#[test]
fn external_lock_status_never_reads_external_bytes_and_rejects_managed_escapes() {
    let _profile = PROFILE.lock().unwrap_or_else(|error| error.into_inner());
    let root = vault();
    let external = root.parent().unwrap().join("external-lock-status.md");
    // Invalid UTF-8 would fail storage::read_file: false establishes no content read.
    std::fs::write(&external, [0xff, 0xfe]).unwrap();
    assert!(!stik_lib::note_lock::is_note_locked(external.to_string_lossy().into_owned()).unwrap());
    let encrypted = "---stik-locked---\nexternal encrypted fixture";
    std::fs::write(&external, encrypted).unwrap();
    assert!(!stik_lib::note_lock::is_note_locked(external.to_string_lossy().into_owned()).unwrap());
    assert!(notes::update_note_inner(
        external.to_string_lossy().into_owned(),
        "plaintext".into(),
        &NoteIndex::new(),
        &EmbeddingIndex::new(),
        None
    )
    .is_err());
    assert_eq!(std::fs::read_to_string(&external).unwrap(), encrypted);
    let missing = root.parent().unwrap().join("absent-external.md");
    assert!(stik_lib::note_lock::is_note_locked(missing.to_string_lossy().into_owned()).is_err());
    #[cfg(unix)]
    {
        let escape = root.join("escaped-locked.md");
        std::os::unix::fs::symlink(&external, &escape).unwrap();
        assert!(
            stik_lib::note_lock::is_note_locked(escape.to_string_lossy().into_owned()).is_err()
        );
    }
    let managed = root.join("managed-lock-status.md");
    std::fs::write(&managed, "---stik-locked---\nfixture").unwrap();
    assert!(stik_lib::note_lock::is_note_locked(managed.to_string_lossy().into_owned()).unwrap());
}
