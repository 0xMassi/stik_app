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

struct ViewingNoteContent {
    id: String,
    content: String,
    folder: String,
    path: String,
}

struct AppState {
    shortcut_to_folder: Mutex<HashMap<String, String>>,
    viewing_notes: Mutex<HashMap<String, ViewingNoteContent>>,
    previous_focused_window: Mutex<Option<String>>,
    postit_was_visible: Mutex<bool>,
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

fn show_search(app: &AppHandle) {
    // Track if postit was visible before opening search
    {
        let state = app.state::<AppState>();
        let mut postit_visible = state.postit_was_visible.lock().unwrap();
        *postit_visible = app
            .get_webview_window("postit")
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
    }

    // Temporarily lower sticked windows so search can be on top
    for (label, window) in app.webview_windows() {
        if label.starts_with("sticked-") {
            let _ = window.set_always_on_top(false);
        }
    }

    // Check if window already exists
    if let Some(window) = app.get_webview_window("search") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("search-opened", ());
        return;
    }

    // Create new search window
    let window = WebviewWindowBuilder::new(
        app,
        "search",
        WebviewUrl::App("index.html?window=search".into()),
    )
    .title("Search Notes")
    .inner_size(550.0, 450.0)
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
                    // Restore always_on_top for sticked windows
                    for (label, window) in app_handle.webview_windows() {
                        if label.starts_with("sticked-") {
                            let _ = window.set_always_on_top(true);
                        }
                    }

                    // Only show postit if it was visible before AND no viewing notes are open
                    let state = app_handle.state::<AppState>();
                    let postit_visible = *state.postit_was_visible.lock().unwrap();

                    if postit_visible {
                        let has_viewing_windows = app_handle
                            .webview_windows()
                            .iter()
                            .any(|(label, _)| label.starts_with("sticked-view-"));
                        if !has_viewing_windows {
                            if let Some(postit) = app_handle.get_webview_window("postit") {
                                let _ = postit.show();
                                let _ = postit.set_focus();
                            }
                        }
                    }
                }
                _ => {}
            }
        });
    }
}

fn shortcut_key_to_code(key: &str) -> Option<Code> {
    match key {
        // Letters
        "A" | "KeyA" => Some(Code::KeyA),
        "B" | "KeyB" => Some(Code::KeyB),
        "C" | "KeyC" => Some(Code::KeyC),
        "D" | "KeyD" => Some(Code::KeyD),
        "E" | "KeyE" => Some(Code::KeyE),
        "F" | "KeyF" => Some(Code::KeyF),
        "G" | "KeyG" => Some(Code::KeyG),
        "H" | "KeyH" => Some(Code::KeyH),
        "I" | "KeyI" => Some(Code::KeyI),
        "J" | "KeyJ" => Some(Code::KeyJ),
        "K" | "KeyK" => Some(Code::KeyK),
        "L" | "KeyL" => Some(Code::KeyL),
        "M" | "KeyM" => Some(Code::KeyM),
        "N" | "KeyN" => Some(Code::KeyN),
        "O" | "KeyO" => Some(Code::KeyO),
        "P" | "KeyP" => Some(Code::KeyP),
        "Q" | "KeyQ" => Some(Code::KeyQ),
        "R" | "KeyR" => Some(Code::KeyR),
        "S" | "KeyS" => Some(Code::KeyS),
        "T" | "KeyT" => Some(Code::KeyT),
        "U" | "KeyU" => Some(Code::KeyU),
        "V" | "KeyV" => Some(Code::KeyV),
        "W" | "KeyW" => Some(Code::KeyW),
        "X" | "KeyX" => Some(Code::KeyX),
        "Y" | "KeyY" => Some(Code::KeyY),
        "Z" | "KeyZ" => Some(Code::KeyZ),
        // Numbers
        "0" | "Digit0" => Some(Code::Digit0),
        "1" | "Digit1" => Some(Code::Digit1),
        "2" | "Digit2" => Some(Code::Digit2),
        "3" | "Digit3" => Some(Code::Digit3),
        "4" | "Digit4" => Some(Code::Digit4),
        "5" | "Digit5" => Some(Code::Digit5),
        "6" | "Digit6" => Some(Code::Digit6),
        "7" | "Digit7" => Some(Code::Digit7),
        "8" | "Digit8" => Some(Code::Digit8),
        "9" | "Digit9" => Some(Code::Digit9),
        // Function keys
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        // Special keys
        "Space" => Some(Code::Space),
        "Enter" => Some(Code::Enter),
        "Tab" => Some(Code::Tab),
        "Backspace" => Some(Code::Backspace),
        "Escape" => Some(Code::Escape),
        // Arrow keys
        "Up" | "ArrowUp" => Some(Code::ArrowUp),
        "Down" | "ArrowDown" => Some(Code::ArrowDown),
        "Left" | "ArrowLeft" => Some(Code::ArrowLeft),
        "Right" | "ArrowRight" => Some(Code::ArrowRight),
        // Punctuation
        "Comma" => Some(Code::Comma),
        "Period" => Some(Code::Period),
        "Slash" => Some(Code::Slash),
        "Backslash" => Some(Code::Backslash),
        "BracketLeft" => Some(Code::BracketLeft),
        "BracketRight" => Some(Code::BracketRight),
        "Semicolon" => Some(Code::Semicolon),
        "Quote" => Some(Code::Quote),
        "Backquote" => Some(Code::Backquote),
        "Minus" => Some(Code::Minus),
        "Equal" => Some(Code::Equal),
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
        // Letters
        Code::KeyA => "A",
        Code::KeyB => "B",
        Code::KeyC => "C",
        Code::KeyD => "D",
        Code::KeyE => "E",
        Code::KeyF => "F",
        Code::KeyG => "G",
        Code::KeyH => "H",
        Code::KeyI => "I",
        Code::KeyJ => "J",
        Code::KeyK => "K",
        Code::KeyL => "L",
        Code::KeyM => "M",
        Code::KeyN => "N",
        Code::KeyO => "O",
        Code::KeyP => "P",
        Code::KeyQ => "Q",
        Code::KeyR => "R",
        Code::KeyS => "S",
        Code::KeyT => "T",
        Code::KeyU => "U",
        Code::KeyV => "V",
        Code::KeyW => "W",
        Code::KeyX => "X",
        Code::KeyY => "Y",
        Code::KeyZ => "Z",
        // Numbers
        Code::Digit0 => "0",
        Code::Digit1 => "1",
        Code::Digit2 => "2",
        Code::Digit3 => "3",
        Code::Digit4 => "4",
        Code::Digit5 => "5",
        Code::Digit6 => "6",
        Code::Digit7 => "7",
        Code::Digit8 => "8",
        Code::Digit9 => "9",
        // Function keys
        Code::F1 => "F1",
        Code::F2 => "F2",
        Code::F3 => "F3",
        Code::F4 => "F4",
        Code::F5 => "F5",
        Code::F6 => "F6",
        Code::F7 => "F7",
        Code::F8 => "F8",
        Code::F9 => "F9",
        Code::F10 => "F10",
        Code::F11 => "F11",
        Code::F12 => "F12",
        // Special keys
        Code::Space => "Space",
        Code::Enter => "Enter",
        Code::Tab => "Tab",
        Code::Backspace => "Backspace",
        Code::Escape => "Escape",
        // Arrow keys
        Code::ArrowUp => "Up",
        Code::ArrowDown => "Down",
        Code::ArrowLeft => "Left",
        Code::ArrowRight => "Right",
        // Punctuation
        Code::Comma => "Comma",
        Code::Period => "Period",
        Code::Slash => "Slash",
        Code::Backslash => "Backslash",
        Code::BracketLeft => "BracketLeft",
        Code::BracketRight => "BracketRight",
        Code::Semicolon => "Semicolon",
        Code::Quote => "Quote",
        Code::Backquote => "Backquote",
        Code::Minus => "Minus",
        Code::Equal => "Equal",
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

    // Always register the search shortcut (Cmd+Shift+P)
    let search_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyP);
    let _ = app.global_shortcut().register(search_shortcut);

    // Always register the manager shortcut (Cmd+Shift+M)
    let manager_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyM);
    let _ = app.global_shortcut().register(manager_shortcut);

    // Always register the settings shortcut (Cmd+Shift+Comma)
    let settings_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Comma);
    let _ = app.global_shortcut().register(settings_shortcut);

    // Debug: Register devtools shortcut (Cmd+Option+I)
    #[cfg(debug_assertions)]
    {
        let devtools_shortcut =
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyI);
        let _ = app.global_shortcut().register(devtools_shortcut);
    }
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

#[tauri::command]
fn pause_shortcuts(app: AppHandle) -> Result<bool, String> {
    // Temporarily unregister all shortcuts (for shortcut recording)
    let _ = app.global_shortcut().unregister_all();
    Ok(true)
}

#[tauri::command]
fn resume_shortcuts(app: AppHandle) -> Result<bool, String> {
    // Re-register all shortcuts after recording
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

#[tauri::command]
fn transfer_to_capture(app: AppHandle, content: String, folder: String) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("transfer-content", serde_json::json!({
            "content": content,
            "folder": folder
        }));
        Ok(true)
    } else {
        Err("Postit window not found".to_string())
    }
}

fn show_settings(app: &AppHandle) {
    // Track which sticked window was focused before opening settings
    // and whether postit was visible
    {
        let state = app.state::<AppState>();
        let mut prev_window = state.previous_focused_window.lock().unwrap();
        *prev_window = None;

        // Find the focused sticked window
        for (label, window) in app.webview_windows() {
            if label.starts_with("sticked-") {
                if window.is_focused().unwrap_or(false) {
                    *prev_window = Some(label.clone());
                    break;
                }
            }
        }

        // Track if postit was visible
        let mut postit_visible = state.postit_was_visible.lock().unwrap();
        *postit_visible = app
            .get_webview_window("postit")
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
    }

    // Lower sticked windows temporarily so settings can be on top
    for (label, window) in app.webview_windows() {
        if label.starts_with("sticked-") {
            let _ = window.set_always_on_top(false);
        }
    }

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

    // Settings window does NOT close on blur (user needs to interact with it)
    if let Ok(win) = window {
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Restore always_on_top for sticked windows
                for (label, window) in app_handle.webview_windows() {
                    if label.starts_with("sticked-") {
                        let _ = window.set_always_on_top(true);
                    }
                }

                // Restore focus to the previously focused window
                let state = app_handle.state::<AppState>();
                let prev_window = state.previous_focused_window.lock().unwrap();
                let postit_visible = *state.postit_was_visible.lock().unwrap();

                if let Some(label) = prev_window.as_ref() {
                    // Was on a sticked window
                    if let Some(window) = app_handle.get_webview_window(label) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else if postit_visible {
                    // Was on the normal postit window (only if it was visible)
                    if let Some(postit) = app_handle.get_webview_window("postit") {
                        let _ = postit.show();
                        let _ = postit.set_focus();
                    }
                }
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
    // Temporarily lower sticked windows so folder selector can be on top
    for (label, window) in app.webview_windows() {
        if label.starts_with("sticked-") {
            let _ = window.set_always_on_top(false);
        }
    }

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
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Focused(focused) => {
                    if !focused {
                        let _ = w.close();
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // Restore always_on_top for sticked windows
                    for (label, window) in app_handle.webview_windows() {
                        if label.starts_with("sticked-") {
                            let _ = window.set_always_on_top(true);
                        }
                    }
                }
                _ => {}
            }
        });
    }
}

fn show_manager(app: &AppHandle) {
    // Track if postit was visible before opening manager
    {
        let state = app.state::<AppState>();
        let mut postit_visible = state.postit_was_visible.lock().unwrap();
        *postit_visible = app
            .get_webview_window("postit")
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
    }

    // Temporarily lower sticked windows so manager can be on top
    for (label, window) in app.webview_windows() {
        if label.starts_with("sticked-") {
            let _ = window.set_always_on_top(false);
        }
    }

    // Check if window already exists
    if let Some(window) = app.get_webview_window("manager") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("manager-opened", ());
        return;
    }

    // Create new manager window
    let window = WebviewWindowBuilder::new(
        app,
        "manager",
        WebviewUrl::App("index.html?window=manager".into()),
    )
    .title("Manage Notes")
    .inner_size(500.0, 450.0)
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
                    // Restore always_on_top for sticked windows
                    for (label, window) in app_handle.webview_windows() {
                        if label.starts_with("sticked-") {
                            let _ = window.set_always_on_top(true);
                        }
                    }

                    // Only show postit if it was visible before AND no viewing notes are open
                    let state = app_handle.state::<AppState>();
                    let postit_visible = *state.postit_was_visible.lock().unwrap();

                    if postit_visible {
                        let has_viewing_windows = app_handle
                            .webview_windows()
                            .iter()
                            .any(|(label, _)| label.starts_with("sticked-view-"));
                        if !has_viewing_windows {
                            if let Some(postit) = app_handle.get_webview_window("postit") {
                                let _ = postit.show();
                                let _ = postit.set_focus();
                            }
                        }
                    }
                }
                _ => {}
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
        .min_inner_size(320.0, 200.0)
        .max_inner_size(800.0, 600.0)
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

fn create_sticked_window_centered(app: AppHandle, note: StickedNote) -> Result<bool, String> {
    let window_label = format!("sticked-{}", note.id);

    // Check if window already exists
    if app.get_webview_window(&window_label).is_some() {
        return Ok(true);
    }

    let (width, height) = note.size.unwrap_or((400.0, 280.0));
    let url = format!("index.html?window=sticked&id={}", note.id);

    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("Sticked Note")
        .inner_size(width, height)
        .min_inner_size(320.0, 200.0)
        .max_inner_size(800.0, 600.0)
        .center()  // Center on current screen instead of using position
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
    // Create the sticked note in storage (position will be set by center())
    let note = sticked_notes::create_sticked_note(content, folder, None)?;

    // Create the window (centered)
    create_sticked_window_centered(app.clone(), note.clone())?;

    // Hide the capture window
    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.hide();
    }

    Ok(note)
}

#[tauri::command]
async fn open_note_for_viewing(
    app: AppHandle,
    content: String,
    folder: String,
    path: String,
) -> Result<bool, String> {
    // Generate a unique ID for the viewing window based on the file path
    let id = format!("view-{}", path.replace(['/', '\\', '.', ' '], "-"));
    let window_label = format!("sticked-{}", id);

    // Check if window already exists
    if app.get_webview_window(&window_label).is_some() {
        return Ok(true);
    }

    // Store content in app state for the window to retrieve when ready
    {
        let state = app.state::<AppState>();
        let mut viewing_notes = state.viewing_notes.lock().unwrap();
        viewing_notes.insert(
            id.clone(),
            ViewingNoteContent {
                id: id.clone(),
                content,
                folder,
                path: path.clone(),
            },
        );
    }

    // Create the viewing window
    let url = format!("index.html?window=sticked&id={}&viewing=true", id);

    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("View Note")
        .inner_size(450.0, 320.0)
        .min_inner_size(320.0, 200.0)
        .max_inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .build();

    if let Err(e) = window {
        return Err(format!("Failed to create viewing window: {}", e));
    }

    Ok(true)
}

#[tauri::command]
fn get_viewing_note_content(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    let viewing_notes = state.viewing_notes.lock().unwrap();

    if let Some(note) = viewing_notes.get(&id) {
        Ok(serde_json::json!({
            "id": note.id,
            "content": note.content,
            "folder": note.folder,
            "path": note.path
        }))
    } else {
        Err("Viewing note content not found".to_string())
    }
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
            viewing_notes: Mutex::new(HashMap::new()),
            previous_focused_window: Mutex::new(None),
            postit_was_visible: Mutex::new(false),
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

                    // Check for search shortcut (Cmd+Shift+P)
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyP) {
                        show_search(app);
                        return;
                    }

                    // Check for manager shortcut (Cmd+Shift+M)
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::KeyM) {
                        show_manager(app);
                        return;
                    }

                    // Check for settings shortcut (Cmd+Shift+Comma)
                    if shortcut.matches(Modifiers::SUPER | Modifiers::SHIFT, Code::Comma) {
                        show_settings(app);
                        return;
                    }

                    // Debug: Check for devtools shortcut (Cmd+Option+I)
                    #[cfg(debug_assertions)]
                    if shortcut.matches(Modifiers::SUPER | Modifiers::ALT, Code::KeyI) {
                        // Open devtools for all windows
                        for (_, window) in app.webview_windows() {
                            window.open_devtools();
                        }
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
            notes::update_note,
            notes::list_notes,
            notes::search_notes,
            notes::delete_note,
            notes::move_note,
            folders::list_folders,
            folders::create_folder,
            folders::delete_folder,
            folders::rename_folder,
            folders::get_folder_stats,
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
            pause_shortcuts,
            resume_shortcuts,
            create_sticked_window,
            close_sticked_window,
            pin_capture_note,
            open_note_for_viewing,
            get_viewing_note_content,
            open_settings,
            transfer_to_capture,
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
