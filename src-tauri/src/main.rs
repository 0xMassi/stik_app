// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{folders, notes, settings};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let folder = if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyS) {
                            "Inbox"
                        } else if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::Digit1) {
                            "Work"
                        } else if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::Digit2) {
                            "Ideas"
                        } else if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::Digit3) {
                            "Personal"
                        } else {
                            return;
                        };

                        if let Some(window) = app.get_webview_window("postit") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("shortcut-triggered", folder);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            notes::save_note,
            notes::list_notes,
            folders::list_folders,
            folders::create_folder,
            settings::get_settings,
            settings::set_setting,
            hide_window,
        ])
        .setup(|app| {
            // Register global shortcuts
            let shortcuts = vec![
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyS),
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit1),
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit2),
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Digit3),
            ];

            for shortcut in shortcuts {
                app.global_shortcut().register(shortcut)?;
            }

            // Create tray icon
            let quit = MenuItem::with_id(app, "quit", "Quit Stik", true, None::<&str>)?;
            let new_note =
                MenuItem::with_id(app, "new_note", "New Note (⌘⇧S)", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&new_note, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "new_note" => {
                        if let Some(window) = app.get_webview_window("postit") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("shortcut-triggered", "Inbox");
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Hide window on blur
            let window = app.get_webview_window("postit").unwrap();
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(focused) = event {
                    if !focused {
                        let _ = w.hide();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
