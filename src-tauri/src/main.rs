// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{folders, notes, settings, sticked_notes};
use settings::StikSettings;
use sticked_notes::StickedNote;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct AppState {
    shortcut_to_folder: Mutex<HashMap<String, String>>,
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

fn shortcut_key_to_code(key: &str) -> Option<Code> {
    match key {
        "S" | "KeyS" => Some(Code::KeyS),
        "F" | "KeyF" => Some(Code::KeyF),
        "P" | "KeyP" => Some(Code::KeyP),
        "1" | "Digit1" => Some(Code::Digit1),
        "2" | "Digit2" => Some(Code::Digit2),
        "3" | "Digit3" => Some(Code::Digit3),
        "4" | "Digit4" => Some(Code::Digit4),
        "5" | "Digit5" => Some(Code::Digit5),
        "6" | "Digit6" => Some(Code::Digit6),
        "7" | "Digit7" => Some(Code::Digit7),
        "8" | "Digit8" => Some(Code::Digit8),
        "9" | "Digit9" => Some(Code::Digit9),
        "Comma" => Some(Code::Comma),
        _ => None,
    }
}

fn parse_shortcut_string(shortcut_str: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();
    if parts.is_empty() {
        return None;
    }

    let key = parts.last()?;
    let code = shortcut_key_to_code(key)?;

    let mut modifiers = Modifiers::empty();
    for part in &parts[..parts.len() - 1] {
        match part.to_lowercase().as_str() {
            "commandorcontrol" | "cmd" | "command" | "ctrl" | "control" => {
                modifiers |= Modifiers::SUPER;
            }
            "shift" => {
                modifiers |= Modifiers::SHIFT;
            }
            "alt" | "option" => {
                modifiers |= Modifiers::ALT;
            }
            _ => {}
        }
    }

    Some(Shortcut::new(Some(modifiers), code))
}

fn shortcut_to_string(shortcut: &Shortcut) -> String {
    let mut parts = Vec::new();
    let mods = shortcut.mods;

    if mods.contains(Modifiers::SUPER) {
        parts.push("CommandOrControl");
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Alt");
    }

    let key = match shortcut.key {
        Code::KeyS => "S",
        Code::KeyF => "F",
        Code::KeyP => "P",
        Code::Digit1 => "1",
        Code::Digit2 => "2",
        Code::Digit3 => "3",
        Code::Digit4 => "4",
        Code::Digit5 => "5",
        Code::Digit6 => "6",
        Code::Digit7 => "7",
        Code::Digit8 => "8",
        Code::Digit9 => "9",
        Code::Comma => "Comma",
        _ => "Unknown",
    };
    parts.push(key);

    parts.join("+")
}

fn register_shortcuts_from_settings(app: &AppHandle, settings: &StikSettings) {
    let state = app.state::<AppState>();
    let mut map = state.shortcut_to_folder.lock().unwrap();
    map.clear();

    // Register folder shortcuts from settings
    for mapping in &settings.shortcut_mappings {
        if !mapping.enabled {
            continue;
        }

        if let Some(shortcut) = parse_shortcut_string(&mapping.shortcut) {
            let key = shortcut_to_string(&shortcut);
            map.insert(key, mapping.folder.clone());
            let _ = app.global_shortcut().register(shortcut);
        }
    }

    // Always register the folder selector shortcut (Cmd+Shift+F)
    let folder_selector_shortcut =
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyF);
    let _ = app.global_shortcut().register(folder_selector_shortcut);
}

#[tauri::command]
fn reload_shortcuts(app: AppHandle) -> Result<bool, String> {
    // Unregister all shortcuts
    let _ = app.global_shortcut().unregister_all();

    // Load settings and re-register
    let settings = settings::get_settings()?;
    register_shortcuts_from_settings(&app, &settings);

    Ok(true)
}

fn show_postit_with_folder(app: &AppHandle, folder: &str) {
    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("shortcut-triggered", folder);
    }
}

fn show_settings(app: &AppHandle) {
    // Check if window already exists
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // Create new settings window
    let window = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("Settings")
    .inner_size(500.0, 600.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();

    if let Ok(win) = window {
        let w = win.clone();
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Focused(focused) => {
                    if !focused {
                        let _ = w.close();
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // Re-show postit when settings closes
                    if let Some(postit) = app_handle.get_webview_window("postit") {
                        let _ = postit.show();
                        let _ = postit.set_focus();
                    }
                }
                _ => {}
            }
        });
    }
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<bool, String> {
    show_settings(&app);
    Ok(true)
}

fn show_folder_selector(app: &AppHandle) {
    // Check if window already exists
    if let Some(window) = app.get_webview_window("folder-selector") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("folder-selector-opened", ());
        return;
    }

    // Create new folder selector window
    let window = WebviewWindowBuilder::new(
        app,
        "folder-selector",
        WebviewUrl::App("index.html?window=folder-selector".into()),
    )
    .title("Select Folder")
    .inner_size(400.0, 350.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();

    if let Ok(win) = window {
        let w = win.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if !focused {
                    let _ = w.close();
                }
            }
        });
    }
}

#[tauri::command]
fn create_sticked_window(app: AppHandle, note: StickedNote) -> Result<bool, String> {
    let window_label = format!("sticked-{}", note.id);

    // Check if window already exists
    if app.get_webview_window(&window_label).is_some() {
        return Ok(true);
    }

    let (x, y) = note.position.unwrap_or((100.0, 100.0));
    let (width, height) = note.size.unwrap_or((400.0, 280.0));

    let url = format!("index.html?window=sticked&id={}", note.id);

    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("Sticked Note")
        .inner_size(width, height)
        .position(x, y)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build();

    if let Err(e) = window {
        return Err(format!("Failed to create sticked window: {}", e));
    }

    Ok(true)
}

#[tauri::command]
fn close_sticked_window(app: AppHandle, id: String) -> Result<bool, String> {
    let window_label = format!("sticked-{}", id);

    if let Some(window) = app.get_webview_window(&window_label) {
        let _ = window.close();
    }

    Ok(true)
}

#[tauri::command]
async fn pin_capture_note(
    app: AppHandle,
    content: String,
    folder: String,
) -> Result<StickedNote, String> {
    // Get postit window position to place sticked note nearby
    let position = if let Some(window) = app.get_webview_window("postit") {
        window
            .outer_position()
            .ok()
            .map(|p| (p.x as f64, p.y as f64))
    } else {
        None
    };

    // Create the sticked note in storage
    let note = sticked_notes::create_sticked_note(content, folder, position)?;

    // Create the window
    create_sticked_window(app.clone(), note.clone())?;

    // Hide the capture window
    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.hide();
    }

    Ok(note)
}

fn restore_sticked_notes(app: &AppHandle) {
    if let Ok(notes) = sticked_notes::list_sticked_notes() {
        for note in notes {
            let _ = create_sticked_window(app.clone(), note);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            shortcut_to_folder: Mutex::new(HashMap::new()),
        })
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    // Check for folder selector shortcut (Cmd+Shift+F)
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyF) {
                        show_folder_selector(app);
                        return;
                    }

                    // Check registered folder shortcuts
                    let state = app.state::<AppState>();
                    let map = state.shortcut_to_folder.lock().unwrap();
                    let key = shortcut_to_string(shortcut);

                    if let Some(folder) = map.get(&key) {
                        show_postit_with_folder(app, folder);
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
            settings::save_settings,
            settings::get_shortcut_mappings,
            settings::save_shortcut_mapping,
            settings::set_setting,
            sticked_notes::list_sticked_notes,
            sticked_notes::create_sticked_note,
            sticked_notes::update_sticked_note,
            sticked_notes::close_sticked_note,
            sticked_notes::get_sticked_note,
            hide_window,
            reload_shortcuts,
            create_sticked_window,
            close_sticked_window,
            pin_capture_note,
            open_settings,
        ])
        .setup(|app| {
            // Load settings and register shortcuts
            let settings = settings::get_settings().unwrap_or_default();
            register_shortcuts_from_settings(app.handle(), &settings);

            // Restore sticked notes from previous session
            restore_sticked_notes(app.handle());

            // Create tray icon
            let quit = MenuItem::with_id(app, "quit", "Quit Stik", true, None::<&str>)?;
            let new_note =
                MenuItem::with_id(app, "new_note", "New Note (⌘⇧S)", true, None::<&str>)?;
            let folder_selector = MenuItem::with_id(
                app,
                "folder_selector",
                "Select Folder (⌘⇧F)",
                true,
                None::<&str>,
            )?;

            let menu = Menu::with_items(app, &[&new_note, &folder_selector, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "new_note" => {
                        let settings = settings::get_settings().unwrap_or_default();
                        show_postit_with_folder(app, &settings.default_folder);
                    }
                    "folder_selector" => {
                        show_folder_selector(app);
                    }
                    _ => {}
                })
                .build(app)?;

            // Hide postit window on blur
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
