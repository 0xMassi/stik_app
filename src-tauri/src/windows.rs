use crate::commands::{notes, settings, sticked_notes};
use crate::state::{AppState, LastSavedNote};
use base64::Engine;
use sticked_notes::StickedNote;
use tauri::{
    AppHandle, Emitter, Listener, Manager, PhysicalPosition, TitleBarStyle, WebviewUrl,
    WebviewWindowBuilder,
};

const SETTINGS_WINDOW_WIDTH: f64 = 860.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 720.0;
const SETTINGS_WINDOW_MIN_WIDTH: f64 = 760.0;
const SETTINGS_WINDOW_MIN_HEIGHT: f64 = 560.0;

const EDITOR_WINDOW_WIDTH: f64 = 1100.0;
const EDITOR_WINDOW_HEIGHT: f64 = 740.0;
const EDITOR_WINDOW_MIN_WIDTH: f64 = 820.0;
const EDITOR_WINDOW_MIN_HEIGHT: f64 = 520.0;

/// Minimum overlap (in physical pixels) between window and monitor for the position to be usable.
const MIN_OVERLAP: f64 = 80.0;

/// Check if a window at (x, y) with the given size overlaps sufficiently with any connected
/// monitor. All coordinates are in **physical pixels** (same space as `outerPosition()`).
/// Uses rectangle intersection — handles negative coordinates from left/top monitors.
fn is_window_visible_on_any_monitor(app: &AppHandle, x: f64, y: f64, w: f64, h: f64) -> bool {
    let monitors = app
        .get_webview_window("postit")
        .and_then(|win| win.available_monitors().ok());

    let Some(monitors) = monitors else {
        return false;
    };

    for monitor in monitors {
        let pos = monitor.position();
        let size = monitor.size();

        // All values in physical pixels — no scale conversion needed.
        let mx = pos.x as f64;
        let my = pos.y as f64;
        let mw = size.width as f64;
        let mh = size.height as f64;

        // Rectangle intersection: overlap width/height between window and monitor
        let overlap_w = (x + w).min(mx + mw) - x.max(mx);
        let overlap_h = (y + h).min(my + mh) - y.max(my);

        if overlap_w >= MIN_OVERLAP && overlap_h >= MIN_OVERLAP {
            return true;
        }
    }

    false
}

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
        if let Ok(s) = settings::load_settings_from_file() {
            // Restore persisted capture window size
            let (w, h) = s.capture_window_size.unwrap_or((400.0, 280.0));
            if s.capture_window_size.is_some() {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
            }
            // Restore position only if it's visible on a connected monitor.
            if let Some((x, y)) = s.viewing_window_position {
                if is_window_visible_on_any_monitor(app, x, y, w, h) {
                    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(
                        x as i32, y as i32,
                    )));
                } else {
                    let _ = window.center();
                }
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
        let mut postit_visible = state
            .postit_was_visible
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
        win.on_window_event(move |event| match event {
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
                let postit_visible = *state
                    .postit_was_visible
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

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
        });
    }
}

pub fn show_settings(app: &AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut prev_window = state
            .previous_focused_window
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *prev_window = None;

        for (label, window) in app.webview_windows() {
            if label.starts_with("sticked-") && window.is_focused().unwrap_or(false) {
                *prev_window = Some(label.clone());
                break;
            }
        }

        let mut postit_visible = state
            .postit_was_visible
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
                let prev_window = state
                    .previous_focused_window
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let postit_visible = *state
                    .postit_was_visible
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

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

/// Stik's full editor mode: a real, decorated, taskbar-visible app window
/// (unlike the transparent always-on-top sticky windows). Singleton — if it
/// already exists we just focus it.
pub fn show_editor(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("editor") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(
        app,
        "editor",
        WebviewUrl::App("index.html?window=editor".into()),
    )
    .title("Stik Editor")
    .inner_size(EDITOR_WINDOW_WIDTH, EDITOR_WINDOW_HEIGHT)
    .min_inner_size(EDITOR_WINDOW_MIN_WIDTH, EDITOR_WINDOW_MIN_HEIGHT)
    .resizable(true)
    .title_bar_style(TitleBarStyle::Overlay)
    .hidden_title(true)
    .center()
    .build();
}

#[tauri::command]
pub fn open_editor(app: AppHandle) -> Result<bool, String> {
    show_editor(&app);
    Ok(true)
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

    let saved_position = note.position;
    let (width, height) = note.size.unwrap_or((400.0, 280.0));
    let url = format!("index.html?window=sticked&id={}", note.id);

    // Build hidden — position after creation using PhysicalPosition to avoid
    // the logical/physical mismatch in WebviewWindowBuilder::position().
    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("Sticked Note")
        .inner_size(width, height)
        .min_inner_size(320.0, 200.0)
        .max_inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build();

    match window {
        Ok(win) => {
            if let Some((x, y)) = saved_position {
                let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(
                    x as i32, y as i32,
                )));
            } else {
                let _ = win.center();
            }
            let _ = win.show();
            Ok(true)
        }
        Err(e) => Err(format!("Failed to create sticked window: {}", e)),
    }
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
        let mut viewing_notes = state
            .viewing_notes
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
    // Read saved viewing position so the pinned note opens where the last
    // sticked/viewing window was, not always centered.
    let saved = settings::load_settings_from_file().ok();
    let saved_pos = saved.as_ref().and_then(|s| s.viewing_window_position);
    let saved_size = saved.as_ref().and_then(|s| s.viewing_window_size);

    let mut note = sticked_notes::create_sticked_note(content, folder, None)?;

    // Use saved viewing position if it's on a connected monitor, otherwise center.
    let use_saved = saved_pos.is_some_and(|(x, y)| {
        let (w, h) = saved_size.unwrap_or((400.0, 280.0));
        is_window_visible_on_any_monitor(&app, x, y, w, h)
    });

    if let (true, Some((x, y))) = (use_saved, saved_pos) {
        note.position = Some((x, y));
        if let Some((w, h)) = saved_size {
            note.size = Some((w, h));
        }
        create_sticked_window(app.clone(), note.clone())?;
    } else {
        create_sticked_window_centered(app.clone(), note.clone())?;
    }

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

            // Keep the global viewing geometry in sync.
            let scale = win.scale_factor().unwrap_or(1.0);
            let lw = size.width as f64 / scale;
            let lh = size.height as f64 / scale;
            let _ = settings::save_viewing_window_geometry(lw, lh, pos.x as f64, pos.y as f64);
        }
    }

    if let Some(window) = app.get_webview_window("postit") {
        let _ = window.hide();
    }

    Ok(note)
}

fn viewing_note_id(path: &str) -> String {
    // Preserve path identity without introducing URL or window-label delimiters.
    format!(
        "view-{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path)
    )
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

    let id = viewing_note_id(&path);
    let window_label = format!("sticked-{}", id);

    if app.get_webview_window(&window_label).is_some() {
        return Ok(true);
    }

    {
        let state = app.state::<AppState>();
        let mut viewing_notes = state
            .viewing_notes
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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

    let saved_settings = settings::load_settings_from_file().ok();
    let (width, height) = saved_settings
        .as_ref()
        .and_then(|s| s.viewing_window_size)
        .unwrap_or((450.0, 320.0));
    let saved_position = saved_settings
        .as_ref()
        .and_then(|s| s.viewing_window_position);

    // Build hidden — we position after creation using PhysicalPosition to avoid
    // the logical/physical mismatch in WebviewWindowBuilder::position().
    let builder = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title("View Note")
        .inner_size(width, height)
        .min_inner_size(320.0, 200.0)
        .max_inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false);

    let window = builder.build();

    match window {
        Ok(win) => {
            // Restore saved position in physical pixels, or center as fallback.
            let positioned = saved_position
                .is_some_and(|(x, y)| is_window_visible_on_any_monitor(&app, x, y, width, height));
            if let (true, Some((x, y))) = (positioned, saved_position) {
                let _ = win.set_position(tauri::Position::Physical(PhysicalPosition::new(
                    x as i32, y as i32,
                )));
            } else {
                let _ = win.center();
            }

            let _ = win.show();
            let _ = win.set_focus();
            Ok(true)
        }
        Err(e) => Err(format!("Failed to create viewing window: {}", e)),
    }
}

#[tauri::command]
pub fn get_viewing_note_content(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let state = app.state::<AppState>();
    let viewing_notes = state
        .viewing_notes
        .lock()
        .unwrap_or_else(|e| e.into_inner());

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
pub async fn transfer_to_capture(
    app: AppHandle,
    content: String,
    folder: String,
) -> Result<bool, String> {
    let window = app
        .get_webview_window("postit")
        .ok_or("Postit window not found")?;
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = std::sync::mpsc::channel();
    let listener = app.once(format!("capture-transfer-result-{id}"), move |event| {
        let result = serde_json::from_str::<CaptureTransferResult>(event.payload())
            .map_err(|error| error.to_string())
            .and_then(|result| result.error.map_or(Ok(true), Err));
        let _ = sender.send(result);
    });
    let result = async {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        window
            .emit(
                "transfer-content",
                serde_json::json!({
                    "id": id,
                    "content": content,
                    "folder": folder
                }),
            )
            .map_err(|error| error.to_string())?;
        // Do not block the event loop that must deliver the receiver's reply.
        // A missing listener or failed save leaves the source pin untouched.
        tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv_timeout(std::time::Duration::from_secs(20))
                .map_err(|_| {
                    "Capture did not accept the note; the source is still pinned".to_string()
                })?
        })
        .await
        .map_err(|error| error.to_string())?
    }
    .await;
    app.unlisten(listener);
    result
}

#[derive(serde::Deserialize)]
struct CaptureTransferResult {
    error: Option<String>,
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
        let last = state
            .last_saved_note
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
    use super::{
        remember_last_note, viewing_note_id, SETTINGS_WINDOW_MIN_WIDTH, SETTINGS_WINDOW_WIDTH,
    };
    use crate::state::AppState;

    #[test]
    fn viewing_ids_keep_similarly_named_files_in_separate_windows() {
        let paths = [
            "/notes/a.b.md",
            "/notes/a b.md",
            "/notes/a-b.md",
            "/notes/a/b.md",
            "/notes/a\\b.md",
        ];
        let ids: std::collections::HashSet<_> = paths.into_iter().map(viewing_note_id).collect();
        assert_eq!(ids.len(), paths.len());
    }

    #[test]
    fn viewing_ids_are_safe_in_window_labels_and_url_parameters() {
        let id = viewing_note_id("/notes/你好 & question?#.md");
        assert!(id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
    }

    #[test]
    fn remember_last_note_updates_state_for_shortcuts() {
        let state = AppState::new();
        remember_last_note(&state, "/tmp/stik/foo.md", "Inbox");

        let last = state
            .last_saved_note
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let note = last.as_ref().expect("last note should be set");
        assert_eq!(note.path, "/tmp/stik/foo.md");
        assert_eq!(note.folder, "Inbox");
    }

    #[test]
    fn settings_window_min_width_is_large_enough_for_full_menu_bar() {
        const {
            assert!(SETTINGS_WINDOW_MIN_WIDTH >= 760.0);
            assert!(SETTINGS_WINDOW_WIDTH > SETTINGS_WINDOW_MIN_WIDTH);
        }
    }
}
