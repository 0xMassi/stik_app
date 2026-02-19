use crate::commands::{notes, settings, sticked_notes};
use crate::state::{AppState, LastSavedNote};
use sticked_notes::StickedNote;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const SETTINGS_WINDOW_WIDTH: f64 = 860.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 720.0;
const SETTINGS_WINDOW_MIN_WIDTH: f64 = 760.0;
const SETTINGS_WINDOW_MIN_HEIGHT: f64 = 560.0;

fn remember_last_note(state: &AppState, path: &str, folder: &str) {
    if path.trim().is_empty() {
        return;
    }

    let mut last = state
        .last_saved_note
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *last = Some(LastSavedNote {
        path: path.to_string(),
        folder: folder.to_string(),
    });
}

pub fn show_postit_with_folder(app: &AppHandle, folder: &str) {
    if let Some(window) = app.get_webview_window("postit") {
        // Restore persisted capture window size (if any)
        if let Ok(s) = settings::load_settings_from_file() {
            if let Some((w, h)) = s.capture_window_size {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
            }
        }
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("shortcut-triggered", folder);
    }
}

pub fn show_command_palette(app: &AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut postit_visible = state.postit_was_visible.lock().unwrap_or_else(|e| e.into_inner());
        *postit_visible = app
            .get_webview_window("postit")
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
    }

    for (label, window) in app.webview_windows() {
        if label.starts_with("sticked-") {
            let _ = window.set_always_on_top(false);
        }
    }

    if let Some(window) = app.get_webview_window("command-palette") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window = WebviewWindowBuilder::new(
        app,
        "command-palette",
        WebviewUrl::App("index.html?window=command-palette".into()),
    )
    .title("Command Palette")
    .inner_size(700.0, 480.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();

    if let Ok(win) = window {
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Focused(focused) => {
                    if !focused {
                        for (label, window) in app_handle.webview_windows() {
                            if label.starts_with("sticked-") {
                                let _ = window.set_always_on_top(true);
                            }
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    for (label, window) in app_handle.webview_windows() {
                        if label.starts_with("sticked-") {
                            let _ = window.set_always_on_top(true);
                        }
                    }

                    let state = app_handle.state::<AppState>();
                    let postit_visible = *state.postit_was_visible.lock().unwrap_or_else(|e| e.into_inner());

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

pub fn show_settings(app: &AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut prev_window = state.previous_focused_window.lock().unwrap_or_else(|e| e.into_inner());
        *prev_window = None;

        for (label, window) in app.webview_windows() {
            if label.starts_with("sticked-") {
                if window.is_focused().unwrap_or(false) {
                    *prev_window = Some(label.clone());
                    break;
                }
            }
        }

        let mut postit_visible = state.postit_was_visible.lock().unwrap_or_else(|e| e.into_inner());
        *postit_visible = app
            .get_webview_window("postit")
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
    }

    for (label, window) in app.webview_windows() {
        if label.starts_with("sticked-") {
            let _ = window.set_always_on_top(false);
        }
    }

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html?window=settings".into()),
    )
    .title("Settings")
    .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
    .min_inner_size(SETTINGS_WINDOW_MIN_WIDTH, SETTINGS_WINDOW_MIN_HEIGHT)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();

    if let Ok(win) = window {
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                for (label, window) in app_handle.webview_windows() {
                    if label.starts_with("sticked-") {
                        let _ = window.set_always_on_top(true);
                    }
                }

                let state = app_handle.state::<AppState>();
                let prev_window = state.previous_focused_window.lock().unwrap_or_else(|e| e.into_inner());
                let postit_visible = *state.postit_was_visible.lock().unwrap_or_else(|e| e.into_inner());

                if let Some(label) = prev_window.as_ref() {
                    if let Some(window) = app_handle.get_webview_window(label) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else if postit_visible {
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
pub fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
pub fn hide_postit(app: AppHandle) {
    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn create_sticked_window(app: AppHandle, note: StickedNote) -> Result<bool, String> {
    let window_label = format!("sticked-{}", note.id);

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

pub fn create_sticked_window_centered(app: AppHandle, note: StickedNote) -> Result<bool, String> {
    let window_label = format!("sticked-{}", note.id);

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
        .center()
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
pub fn close_sticked_window(app: AppHandle, id: String) -> Result<bool, String> {
    let window_label = format!("sticked-{}", id);

    if let Some(window) = app.get_webview_window(&window_label) {
        let _ = window.close();
    }

    // Clean up viewing note cache to prevent memory leak
    if id.starts_with("view-") {
        let state = app.state::<AppState>();
        let mut viewing_notes = state.viewing_notes.lock().unwrap_or_else(|e| e.into_inner());
        viewing_notes.remove(&id);
    }

    Ok(true)
}

#[tauri::command]
pub async fn pin_capture_note(
    app: AppHandle,
    content: String,
    folder: String,
) -> Result<StickedNote, String> {
    let note = sticked_notes::create_sticked_note(content, folder, None)?;

    create_sticked_window_centered(app.clone(), note.clone())?;

    // Persist the actual window position/size so it restores correctly
    let window_label = format!("sticked-{}", note.id);
    if let Some(win) = app.get_webview_window(&window_label) {
        if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
            let _ = sticked_notes::update_sticked_note(
                note.id.clone(),
                None,
                None,
                Some((pos.x as f64, pos.y as f64)),
                Some((size.width as f64, size.height as f64)),
            );
        }
    }

    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.hide();
    }

    Ok(note)
}

#[tauri::command]
pub async fn open_note_for_viewing(
    app: AppHandle,
    content: String,
    folder: String,
    path: String,
) -> Result<bool, String> {
    {
        let state = app.state::<AppState>();
        remember_last_note(&state, &path, &folder);
    }

    let id = format!("view-{}", path.replace(['/', '\\', '.', ' '], "-"));
    let window_label = format!("sticked-{}", id);

    if app.get_webview_window(&window_label).is_some() {
        return Ok(true);
    }

    {
        let state = app.state::<AppState>();
        let mut viewing_notes = state.viewing_notes.lock().unwrap_or_else(|e| e.into_inner());
        viewing_notes.insert(
            id.clone(),
            crate::state::ViewingNoteContent {
                id: id.clone(),
                content,
                folder,
                path: path.clone(),
            },
        );
    }

    let url = format!("index.html?window=sticked&id={}&viewing=true", id);

    let (width, height) = settings::load_settings_from_file()
        .ok()
        .and_then(|s| s.viewing_window_size)
        .unwrap_or((450.0, 320.0));

    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("View Note")
        .inner_size(width, height)
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
pub fn get_viewing_note_content(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    let viewing_notes = state.viewing_notes.lock().unwrap_or_else(|e| e.into_inner());

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

#[tauri::command]
pub fn transfer_to_capture(app: AppHandle, content: String, folder: String) -> Result<bool, String> {
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

#[tauri::command]
pub fn open_command_palette(app: AppHandle) -> Result<bool, String> {
    show_command_palette(&app);
    Ok(true)
}

#[tauri::command]
pub fn open_search(app: AppHandle) -> Result<bool, String> {
    show_command_palette(&app);
    Ok(true)
}

#[tauri::command]
pub fn open_manager(app: AppHandle) -> Result<bool, String> {
    show_command_palette(&app);
    Ok(true)
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<bool, String> {
    show_settings(&app);
    Ok(true)
}

#[tauri::command]
pub async fn reopen_last_note(app: AppHandle) -> Result<bool, String> {
    let (path, folder) = {
        let state = app.state::<AppState>();
        let last = state.last_saved_note.lock().unwrap_or_else(|e| e.into_inner());
        match last.as_ref() {
            Some(note) => (note.path.clone(), note.folder.clone()),
            None => return Err("No note saved yet".to_string()),
        }
    };

    let content = notes::get_note_content_inner(&path)?;
    open_note_for_viewing(app, content, folder, path).await
}

pub fn show_apple_notes_picker(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("apple-notes-picker") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let window = WebviewWindowBuilder::new(
        app,
        "apple-notes-picker",
        WebviewUrl::App("index.html?window=apple-notes-picker".into()),
    )
    .title("Import from Apple Notes")
    .inner_size(550.0, 500.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();

    if let Ok(win) = window {
        let app_handle = app.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if !focused {
                    if let Some(w) = app_handle.get_webview_window("apple-notes-picker") {
                        let _ = w.close();
                    }
                }
            }
        });
    }
}

#[tauri::command]
pub fn show_apple_notes_picker_cmd(app: AppHandle) -> Result<bool, String> {
    show_apple_notes_picker(&app);
    Ok(true)
}

pub fn restore_sticked_notes(app: &AppHandle) {
    if let Ok(notes) = sticked_notes::list_sticked_notes() {
        for note in notes {
            let _ = create_sticked_window(app.clone(), note);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{remember_last_note, SETTINGS_WINDOW_MIN_WIDTH, SETTINGS_WINDOW_WIDTH};
    use crate::state::AppState;

    #[test]
    fn remember_last_note_updates_state_for_shortcuts() {
        let state = AppState::new();
        remember_last_note(&state, "/tmp/stik/foo.md", "Inbox");

        let last = state.last_saved_note.lock().unwrap_or_else(|e| e.into_inner());
        let note = last.as_ref().expect("last note should be set");
        assert_eq!(note.path, "/tmp/stik/foo.md");
        assert_eq!(note.folder, "Inbox");
    }

    #[test]
    fn settings_window_min_width_is_large_enough_for_full_menu_bar() {
        assert!(SETTINGS_WINDOW_MIN_WIDTH >= 760.0);
        assert!(SETTINGS_WINDOW_WIDTH > SETTINGS_WINDOW_MIN_WIDTH);
    }
}
