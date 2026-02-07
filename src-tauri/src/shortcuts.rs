use crate::commands::settings::{self, StikSettings};
use crate::state::AppState;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

pub fn shortcut_key_to_code(key: &str) -> Option<Code> {
    match key {
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
        "Space" => Some(Code::Space),
        "Enter" => Some(Code::Enter),
        "Tab" => Some(Code::Tab),
        "Backspace" => Some(Code::Backspace),
        "Escape" => Some(Code::Escape),
        "Up" | "ArrowUp" => Some(Code::ArrowUp),
        "Down" | "ArrowDown" => Some(Code::ArrowDown),
        "Left" | "ArrowLeft" => Some(Code::ArrowLeft),
        "Right" | "ArrowRight" => Some(Code::ArrowRight),
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

pub fn parse_shortcut_string(shortcut_str: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();
    if parts.is_empty() {
        return None;
    }

    let key = parts.last()?;
    let code = shortcut_key_to_code(key)?;

    let mut modifiers = Modifiers::empty();
    for part in &parts[..parts.len() - 1] {
        match part.to_lowercase().as_str() {
            "commandorcontrol" | "cmd" | "command" | "meta" | "super" => {
                modifiers |= Modifiers::SUPER;
            }
            "ctrl" | "control" => {
                modifiers |= Modifiers::CONTROL;
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

pub fn shortcut_to_string(shortcut: &Shortcut) -> String {
    let mut parts = Vec::new();
    let mods = shortcut.mods;

    if mods.contains(Modifiers::SUPER) {
        parts.push("Cmd");
    }
    if mods.contains(Modifiers::CONTROL) {
        parts.push("Ctrl");
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Alt");
    }

    let key = match shortcut.key {
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
        Code::Space => "Space",
        Code::Enter => "Enter",
        Code::Tab => "Tab",
        Code::Backspace => "Backspace",
        Code::Escape => "Escape",
        Code::ArrowUp => "Up",
        Code::ArrowDown => "Down",
        Code::ArrowLeft => "Left",
        Code::ArrowRight => "Right",
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

pub fn register_shortcuts_from_settings(app: &AppHandle, settings: &StikSettings) {
    let state = app.state::<AppState>();
    let mut map = state.shortcut_to_folder.lock().unwrap_or_else(|e| e.into_inner());
    map.clear();

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

    // Always register built-in shortcuts
    let search_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyP);
    let _ = app.global_shortcut().register(search_shortcut);

    let manager_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyM);
    let _ = app.global_shortcut().register(manager_shortcut);

    let settings_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Comma);
    let _ = app.global_shortcut().register(settings_shortcut);

    #[cfg(debug_assertions)]
    {
        let devtools_shortcut =
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyI);
        let _ = app.global_shortcut().register(devtools_shortcut);
    }
}

#[tauri::command]
pub fn reload_shortcuts(app: AppHandle) -> Result<bool, String> {
    let _ = app.global_shortcut().unregister_all();
    let settings = settings::get_settings()?;
    register_shortcuts_from_settings(&app, &settings);
    Ok(true)
}

#[tauri::command]
pub fn pause_shortcuts(app: AppHandle) -> Result<bool, String> {
    let _ = app.global_shortcut().unregister_all();
    Ok(true)
}

#[tauri::command]
pub fn resume_shortcuts(app: AppHandle) -> Result<bool, String> {
    let settings = settings::get_settings()?;
    register_shortcuts_from_settings(&app, &settings);
    Ok(true)
}
