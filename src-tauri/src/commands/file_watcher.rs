/// Local file system watcher for detecting external changes to notes.
/// Mirrors the iCloud monitoring flow: detects .md file changes, updates the
/// NoteIndex + EmbeddingIndex, and emits a frontend event.
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use tauri::{AppHandle, Emitter, Manager};

use super::embeddings::{self, EmbeddingIndex};
use super::index::NoteIndex;
use super::{notes, storage};

static WATCHER_RUNNING: OnceLock<()> = OnceLock::new();

/// Start watching the Stik root directory for .md file changes.
/// No-ops if already running or if root cannot be resolved.
pub fn start(app: AppHandle) {
    if WATCHER_RUNNING.set(()).is_err() {
        return; // already running
    }

    let root = match super::folders::get_stik_folder() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("file_watcher: cannot resolve stik root: {}", e);
            return;
        }
    };

    std::thread::Builder::new()
        .name("stik-file-watcher".to_string())
        .spawn(move || run(app, root))
        .ok();
}

fn run(app: AppHandle, root: PathBuf) {
    let (tx, rx) = std::sync::mpsc::channel();

    let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("file_watcher: failed to create debouncer: {}", e);
            return;
        }
    };

    if let Err(e) = debouncer
        .watcher()
        .watch(&root, notify::RecursiveMode::Recursive)
    {
        eprintln!("file_watcher: failed to watch {}: {}", root.display(), e);
        return;
    }

    loop {
        match rx.recv() {
            Ok(Ok(events)) => {
                let paths: Vec<String> = events
                    .iter()
                    .filter(|e| e.kind == DebouncedEventKind::Any)
                    .filter(|e| {
                        e.path
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .map(|ext| ext.eq_ignore_ascii_case("md"))
                            .unwrap_or(false)
                    })
                    .map(|e| e.path.to_string_lossy().to_string())
                    .collect();

                if paths.is_empty() {
                    continue;
                }

                // Deduplicate
                let mut unique: Vec<String> = paths;
                unique.sort();
                unique.dedup();

                eprintln!(
                    "file_watcher: detected {} changed file(s): {:?}",
                    unique.len(),
                    unique
                );
                handle_changes(&app, &unique);
            }
            Ok(Err(err)) => {
                eprintln!("file_watcher: watch error: {}", err);
            }
            Err(_) => break, // channel closed
        }
    }

    // Keep debouncer alive — drop stops the watcher
    drop(debouncer);
}

/// Shared handler: update NoteIndex, EmbeddingIndex, emit frontend event.
/// Used by both the local file watcher and iCloud notification handler.
pub fn handle_changes(app: &AppHandle, paths: &[String]) {
    // Our own saves already updated the index, so re-handling them would
    // re-embed and re-broadcast every keystroke the app itself wrote.
    let external: Vec<String> = paths
        .iter()
        .filter(|p| !storage::take_self_write(p))
        .cloned()
        .collect();

    if external.is_empty() {
        return;
    }

    let index = app.state::<NoteIndex>();
    index.notify_external_change(&external);

    // Embedding costs two blocking sidecar round trips per note, so it is gated
    // on the AI setting (as the save path is) and skipped when the content hash
    // already matches. Without both, landing a large batch of files — an import,
    // an iCloud download, a restore — serialises thousands of RPCs here.
    if super::settings::load_settings_from_file()
        .map(|s| s.ai_features_enabled)
        .unwrap_or(false)
    {
        let emb = app.state::<EmbeddingIndex>();
        let mut embedded = 0;
        for path_str in &external {
            let Ok(content) = storage::read_file(path_str) else {
                continue;
            };
            if notes::is_effectively_empty_markdown(&content) || emb.is_current(path_str, &content)
            {
                continue;
            }
            if let Some(embedding) = embeddings::embed_content(&content) {
                emb.add_entry(path_str, embedding);
                embedded += 1;
            }
        }
        if embedded > 0 {
            let _ = emb.save();
        }
    }

    let _ = app.emit("files-changed", &external);
}
