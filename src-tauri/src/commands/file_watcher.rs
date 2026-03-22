use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc;
use tauri::{AppHandle, Emitter, Manager};

use super::embeddings::{self, EmbeddingIndex};
use super::index::NoteIndex;
use super::notes;
use super::storage;

pub fn start_watching(app: AppHandle) -> Result<(), String> {
    let root = storage::stik_root()?;

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

    let mut watcher = RecommendedWatcher::new(tx, notify::Config::default())
        .map_err(|e| e.to_string())?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Keep watcher alive for the duration of the loop; dropping it closes the channel.
    let _watcher = watcher;

    let debounce = std::time::Duration::from_millis(500);

    loop {
        let first = match rx.recv() {
            Ok(ev) => ev,
            Err(_) => break,
        };

        let mut batch = vec![first];

        // Drain any events that arrive within the debounce window
        let deadline = std::time::Instant::now() + debounce;
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            match rx.recv_timeout(remaining) {
                Ok(ev) => batch.push(ev),
                Err(_) => break,
            }
        }

        let mut changed_paths: Vec<String> = batch
            .into_iter()
            .filter_map(|res| res.ok())
            .filter(|ev| {
                matches!(
                    ev.kind,
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                )
            })
            .flat_map(|ev| ev.paths)
            .filter(|p| {
                p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
            })
            .filter(|p| {
                let s = p.to_string_lossy();
                !s.contains("/.git/") && !s.contains("/.assets/")
            })
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        changed_paths.dedup();

        if changed_paths.is_empty() {
            continue;
        }

        let index = app.state::<NoteIndex>();
        index.notify_external_change(&changed_paths);

        let emb = app.state::<EmbeddingIndex>();
        for path_str in &changed_paths {
            if let Ok(content) = storage::read_file(path_str) {
                if !notes::is_effectively_empty_markdown(&content) {
                    if let Some(embedding) = embeddings::embed_content(&content) {
                        emb.add_entry(path_str, embedding);
                    }
                }
            }
        }
        let _ = emb.save();

        let _ = app.emit("icloud-files-changed", &changed_paths);
    }

    Ok(())
}
