// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod shortcuts;
mod state;
mod tray;
mod windows;

use commands::index::NoteIndex;
use commands::{folders, notes, on_this_day, settings, share, stats, sticked_notes};
use shortcuts::shortcut_to_string;
use state::AppState;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
use windows::{show_manager, show_postit_with_folder, show_search, show_settings};

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .manage(NoteIndex::new())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyP) {
                        show_search(app);
                        return;
                    }
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyM) {
                        show_manager(app);
                        return;
                    }
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::Comma) {
                        show_settings(app);
                        return;
                    }

                    #[cfg(debug_assertions)]
                    if shortcut.matches(Modifiers::SUPER | Modifiers::ALT, Code::KeyI) {
                        for (_, window) in app.webview_windows() {
                            window.open_devtools();
                        }
                        return;
                    }

                    let state = app.state::<AppState>();
                    let map = state.shortcut_to_folder.lock().unwrap_or_else(|e| e.into_inner());
                    let key = shortcut_to_string(shortcut);

                    if let Some(folder) = map.get(&key) {
                        show_postit_with_folder(app, folder);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            notes::save_note,
            notes::update_note,
            notes::list_notes,
            notes::search_notes,
            notes::delete_note,
            notes::move_note,
            notes::get_note_content,
            folders::list_folders,
            folders::create_folder,
            folders::delete_folder,
            folders::rename_folder,
            folders::get_folder_stats,
            settings::get_settings,
            settings::save_settings,
            on_this_day::check_on_this_day_now,
            share::build_clipboard_payload,
            share::copy_note_image_to_clipboard,
            share::copy_visible_note_image_to_clipboard,
            stats::get_capture_streak,
            sticked_notes::list_sticked_notes,
            sticked_notes::create_sticked_note,
            sticked_notes::update_sticked_note,
            sticked_notes::close_sticked_note,
            sticked_notes::get_sticked_note,
            windows::hide_window,
            windows::create_sticked_window,
            windows::close_sticked_window,
            windows::pin_capture_note,
            windows::open_note_for_viewing,
            windows::get_viewing_note_content,
            windows::open_settings,
            windows::transfer_to_capture,
            shortcuts::reload_shortcuts,
            shortcuts::pause_shortcuts,
            shortcuts::resume_shortcuts,
        ])
        .setup(|app| {
            // Build in-memory note index for fast search/list
            let index = app.state::<NoteIndex>();
            if let Err(e) = index.build() {
                eprintln!("Failed to build note index: {}", e);
            }

            let settings = settings::get_settings().unwrap_or_default();
            shortcuts::register_shortcuts_from_settings(app.handle(), &settings);

            if let Err(e) = on_this_day::maybe_show_on_this_day_notification() {
                eprintln!("Failed to check On This Day notification: {}", e);
            }

            windows::restore_sticked_notes(app.handle());
            tray::setup_tray(app)?;

            // Postit window: emit blur event so frontend can decide whether to hide
            let window = app.get_webview_window("postit").unwrap();
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(focused) = event {
                    if !focused {
                        let _ = w.emit("postit-blur", ());
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
