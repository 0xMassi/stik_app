// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod shortcuts;
mod state;
mod tray;
mod windows;

use commands::embeddings::EmbeddingIndex;
use commands::index::NoteIndex;
use commands::{
    ai_assistant, analytics, apple_notes, cursor_positions, darwinkit, embeddings, file_watcher,
    folders, git_share, icloud, index, note_lock, notes, on_this_day, settings, share,
    stats, sticked_notes, storage,
};
use shortcuts::shortcut_to_string;
use state::AppState;
use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
use windows::{show_command_palette, show_postit_with_folder, show_settings};

fn folder_for_opened_note(path: &std::path::Path, stik_root: &std::path::Path) -> String {
    if let Ok(relative) = path.strip_prefix(stik_root) {
        let mut components = relative.components();
        if let (Some(first), Some(_second)) = (components.next(), components.next()) {
            return first.as_os_str().to_string_lossy().to_string();
        }
    }
    String::new()
}

fn handle_opened_files(app: &AppHandle, paths: Vec<std::path::PathBuf>) {
    for path in paths {
        let is_markdown = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
            .unwrap_or(false);
        if !is_markdown {
            continue;
        }

        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let path_str = path.to_string_lossy().to_string();
            let path_for_read = path.clone();

            let content = match tauri::async_runtime::spawn_blocking(move || {
                std::fs::read_to_string(&path_for_read)
            }).await {
                Ok(Ok(content)) => content,
                Ok(Err(err)) => {
                    eprintln!("Failed to read opened markdown file {}: {}", path_str, err);
                    return;
                }
                Err(err) => {
                    eprintln!("Failed to read opened markdown file {}: task join error: {}", path_str, err);
                    return;
                }
            };

            // Files inside Stik folder get their folder name resolved;
            // external files get an empty folder (read-only viewing context).
            let folder = folders::get_stik_folder()
                .map(|root| folder_for_opened_note(&path, &root))
                .unwrap_or_default();

            if let Err(err) = windows::open_note_for_viewing(app_handle, content, folder, path_str).await {
                eprintln!("Failed to open markdown file from Finder: {}", err);
            }
        });
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .manage(NoteIndex::new())
        .manage(EmbeddingIndex::new())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    // Check system shortcuts via dynamic mapping
                    {
                        let state = app.state::<AppState>();
                        let action_map = state
                            .shortcut_to_action
                            .lock()
                            .unwrap_or_else(|e| e.into_inner());
                        let key = shortcut_to_string(shortcut);
                        let action = action_map.get(&key).cloned();
                        drop(action_map);

                        if let Some(action) = action {
                            match action.as_str() {
                                "search" => {
                                    show_command_palette(app);
                                    return;
                                }
                                "manager" => {
                                    show_command_palette(app);
                                    return;
                                }
                                "settings" => {
                                    show_settings(app);
                                    return;
                                }
                                "last_note" => {
                                    let app = app.clone();
                                    tauri::async_runtime::spawn(async move {
                                        let _ = windows::reopen_last_note(app).await;
                                    });
                                    return;
                                }
                                _ => {}
                            }
                        }
                    }

                    #[cfg(debug_assertions)]
                    if shortcut.matches(Modifiers::SUPER | Modifiers::ALT, Code::KeyI) {
                        for (_, window) in app.webview_windows() {
                            window.open_devtools();
                        }
                        return;
                    }

                    let state = app.state::<AppState>();
                    let map = state
                        .shortcut_to_folder
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    let key = shortcut_to_string(shortcut);

                    if let Some(folder) = map.get(&key) {
                        show_postit_with_folder(app, folder);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            notes::save_note,
            notes::update_note,
            notes::list_notes,
            notes::search_notes,
            notes::delete_note,
            notes::move_note,
            notes::get_note_content,
            notes::save_note_image,
            notes::save_note_image_from_path,
            folders::list_folders,
            folders::create_folder,
            folders::delete_folder,
            folders::rename_folder,
            folders::get_folder_stats,
            folders::get_notes_directory,
            index::rebuild_index,
            settings::get_settings,
            settings::save_settings,
            git_share::git_prepare_repository,
            git_share::git_sync_now,
            git_share::git_get_sync_status,
            git_share::git_open_remote_url,
            on_this_day::check_on_this_day_now,
            share::build_clipboard_payload,
            share::copy_rich_text_to_clipboard,
            share::copy_note_image_to_clipboard,
            share::copy_visible_note_image_to_clipboard,
            stats::get_capture_streak,
            sticked_notes::list_sticked_notes,
            sticked_notes::create_sticked_note,
            sticked_notes::update_sticked_note,
            sticked_notes::close_sticked_note,
            sticked_notes::get_sticked_note,
            windows::hide_window,
            windows::hide_postit,
            windows::create_sticked_window,
            windows::close_sticked_window,
            windows::pin_capture_note,
            windows::open_note_for_viewing,
            windows::get_viewing_note_content,
            windows::open_command_palette,
            windows::open_search,
            windows::open_manager,
            windows::open_settings,
            windows::transfer_to_capture,
            windows::reopen_last_note,
            shortcuts::reload_shortcuts,
            shortcuts::pause_shortcuts,
            shortcuts::resume_shortcuts,
            settings::set_dock_icon_visibility,
            settings::set_tray_icon_visibility,
            settings::save_viewing_window_size,
            settings::save_viewing_window_geometry,
            settings::save_capture_window_size,
            settings::import_theme_file,
            settings::export_theme_file,
            darwinkit::darwinkit_status,
            darwinkit::darwinkit_call,
            darwinkit::semantic_search,
            darwinkit::suggest_folder,
            analytics::get_analytics_device_id,
            ai_assistant::ai_available,
            ai_assistant::ai_rephrase,
            ai_assistant::ai_summarize,
            ai_assistant::ai_organize,
            ai_assistant::ai_generate,
            apple_notes::list_apple_notes,
            apple_notes::import_apple_note,
            apple_notes::check_apple_notes_access,
            apple_notes::open_full_disk_access_settings,
            windows::show_apple_notes_picker_cmd,
            cursor_positions::get_cursor_position,
            cursor_positions::save_cursor_position,
            cursor_positions::remove_cursor_position,
            icloud::icloud_get_status,
            icloud::icloud_enable,
            icloud::icloud_disable,
            icloud::icloud_migrate_notes,
            note_lock::auth_available,
            note_lock::authenticate,
            note_lock::is_authenticated,
            note_lock::lock_session,
            note_lock::lock_note,
            note_lock::unlock_note,
            note_lock::read_locked_note,
            note_lock::save_locked_note,
            note_lock::is_note_locked,
            note_lock::export_recovery_key,
        ])
        .setup(|app| {
            let settings = settings::get_settings().unwrap_or_default();

            // Build in-memory note index — deferred when iCloud is enabled
            // (needs DarwinKit bridge to resolve the iCloud container path)
            if !settings.icloud.enabled {
                let index = app.state::<NoteIndex>();
                if let Err(e) = index.build() {
                    eprintln!("Failed to build note index: {}", e);
                }
            }
            // Start local file watcher for non-iCloud modes
            if !settings.icloud.enabled {
                let watcher_handle = app.handle().clone();
                std::thread::Builder::new()
                    .name("stik-file-watcher".to_string())
                    .spawn(move || {
                        if let Err(e) = file_watcher::start_watching(watcher_handle) {
                            eprintln!("Failed to start file watcher: {}", e);
                        }
                    })
                    .ok();
            }

            shortcuts::register_shortcuts_from_settings(app.handle(), &settings);
            analytics::start_analytics(app.handle());

            #[cfg(target_os = "macos")]
            if settings.hide_dock_icon {
                settings::apply_dock_icon_visibility(true);
            }

            if !settings.icloud.enabled {
                if let Err(e) = on_this_day::maybe_show_on_this_day_notification() {
                    eprintln!("Failed to check On This Day notification: {}", e);
                }
            }

            // Restore capture window size from settings
            if let Some((w, h)) = settings.capture_window_size {
                if let Some(win) = app.get_webview_window("postit") {
                    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
                }
            }

            windows::restore_sticked_notes(app.handle());
            tray::setup_tray(app)?;

            // Apply tray icon visibility from settings
            if settings.hide_tray_icon {
                if let Some(tray) = app.tray_by_id("main-tray") {
                    let _ = tray.set_visible(false);
                }
            }
            git_share::start_background_worker(app.handle().clone());

            // Start DarwinKit sidecar bridge (needed for AI features or iCloud sync)
            let ai_enabled = settings::get_settings().map(|s| s.ai_features_enabled).unwrap_or(true);
            let icloud_enabled = settings.icloud.enabled;

            if ai_enabled || icloud_enabled {
                darwinkit::start_bridge(app.handle().clone());

                // Register iCloud change notification handler
                if icloud_enabled {
                    let handle = app.handle().clone();
                    darwinkit::register_notification_handler(move |method, params| {
                        if method == "icloud.files_changed" {
                            if let Some(paths) = params.get("paths").and_then(|v| v.as_array()) {
                                let path_strings: Vec<String> = paths
                                    .iter()
                                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                    .collect();

                                if !path_strings.is_empty() {
                                    // Update note index
                                    let index = handle.state::<NoteIndex>();
                                    index.notify_external_change(&path_strings);

                                    // Queue embedding for new/changed notes
                                    let emb = handle.state::<EmbeddingIndex>();
                                    for path_str in &path_strings {
                                        if let Ok(content) = storage::read_file(path_str) {
                                            if !notes::is_effectively_empty_markdown(&content) {
                                                if let Some(embedding) = embeddings::embed_content(&content) {
                                                    emb.add_entry(path_str, embedding);
                                                }
                                            }
                                        }
                                    }
                                    let _ = emb.save();

                                    // Notify frontend
                                    let _ = handle.emit("icloud-files-changed", &path_strings);
                                }
                            }
                        }
                    });

                    // Start monitoring after a short delay (let sidecar initialize)
                    let monitor_handle = app.handle().clone();
                    std::thread::Builder::new()
                        .name("stik-icloud-monitor".to_string())
                        .spawn(move || {
                            // Wait for DarwinKit to become available
                            for _ in 0..20 {
                                if darwinkit::is_available() { break; }
                                std::thread::sleep(std::time::Duration::from_millis(500));
                            }

                            // Build note index now that DarwinKit can resolve the iCloud container
                            let index = monitor_handle.state::<NoteIndex>();
                            if let Err(e) = index.build() {
                                eprintln!("Failed to build note index (iCloud): {}", e);
                            }

                            if let Err(e) = storage::start_monitoring() {
                                eprintln!("Failed to start iCloud monitoring: {}", e);
                            }
                        })
                        .ok();
                }

                if ai_enabled {
                    let handle = app.handle().clone();
                    std::thread::Builder::new()
                        .name("stik-embeddings".to_string())
                        .spawn(move || {
                            let index = handle.state::<NoteIndex>();
                            let emb = handle.state::<EmbeddingIndex>();
                            embeddings::build_embeddings(&index, &emb);
                        })
                        .ok();
                }
            }

            // Postit window: emit blur event so frontend can decide whether to hide
            if let Some(window) = app.get_webview_window("postit") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if !focused {
                            // Don't hide when Apple Notes picker took focus
                            if w.app_handle().get_webview_window("apple-notes-picker").is_some() {
                                return;
                            }
                            let _ = w.emit("postit-blur", ());
                        }
                    }
                });
            } else {
                eprintln!("Warning: postit window not found during setup");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: Tauri application failed to build: {}", e);
            std::process::exit(1);
        })
        .run(|app, event| {
            if let RunEvent::Opened { urls } = event {
                let paths = urls
                    .into_iter()
                    .filter(|url| url.scheme() == "file")
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                handle_opened_files(app, paths);
            }
        });
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use super::folder_for_opened_note;

    #[test]
    fn file_in_stik_subfolder_returns_folder_name() {
        let root = Path::new("/Users/test/Documents/Stik");
        let path = Path::new("/Users/test/Documents/Stik/Work/20260301-note-abc1.md");
        assert_eq!(folder_for_opened_note(path, root), "Work");
    }

    #[test]
    fn file_directly_in_root_returns_empty() {
        let root = Path::new("/Users/test/Documents/Stik");
        let path = Path::new("/Users/test/Documents/Stik/note.md");
        assert_eq!(folder_for_opened_note(path, root), "");
    }

    #[test]
    fn nested_subfolder_returns_top_level_folder() {
        let root = Path::new("/Users/test/Documents/Stik");
        let path = Path::new("/Users/test/Documents/Stik/Projects/sub/deep/note.md");
        assert_eq!(folder_for_opened_note(path, root), "Projects");
    }

    #[test]
    fn file_outside_root_returns_empty() {
        let root = Path::new("/Users/test/Documents/Stik");
        let path = Path::new("/tmp/random/note.md");
        assert_eq!(folder_for_opened_note(path, root), "");
    }
}
