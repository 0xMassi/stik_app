use crate::commands::{settings, stats};
use crate::windows::show_postit_with_folder;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Emitter, Manager};

#[derive(Default)]
struct EditorQuitState {
    requested: AtomicBool,
    approved: AtomicBool,
}

impl EditorQuitState {
    fn complete(&self, window_label: &str, saved: bool) -> Result<bool, String> {
        if window_label != "editor" {
            return Err("Only the editor can acknowledge its pending saves".to_string());
        }
        if !self.requested.swap(false, Ordering::SeqCst) {
            return Err("No editor quit request is pending".to_string());
        }
        self.approved.store(saved, Ordering::SeqCst);
        Ok(saved)
    }
}

static EDITOR_QUIT: EditorQuitState = EditorQuitState {
    requested: AtomicBool::new(false),
    approved: AtomicBool::new(false),
};

/// Defer ordinary app exits until the full editor acknowledges durable saves.
pub fn defer_exit_for_editor(app: &AppHandle) -> bool {
    if EDITOR_QUIT.approved.load(Ordering::SeqCst) || app.get_webview_window("editor").is_none() {
        return false;
    }
    EDITOR_QUIT.requested.store(true, Ordering::SeqCst);
    if let Err(error) = app.emit_to("editor", "editor-quit-requested", ()) {
        EDITOR_QUIT.requested.store(false, Ordering::SeqCst);
        eprintln!("Cannot request editor saves before quitting: {error}");
    }
    true
}

#[tauri::command]
pub fn complete_editor_quit(
    window: tauri::Window,
    app: AppHandle,
    saved: bool,
) -> Result<(), String> {
    if EDITOR_QUIT.complete(window.label(), saved)? {
        app.exit(0);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn install_orderly_quit_menu(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::PredefinedMenuItem;

    // Native Quit invokes NSApplication terminate: directly, bypassing
    // ExitRequested. Keep the native menu but route Cmd+Q through app.exit.
    let menu = app.menu().ok_or("Application menu is unavailable")?;
    let quit_text = PredefinedMenuItem::quit(app, None)?.text()?;
    for item in menu.items()? {
        if let Some(submenu) = item.as_submenu() {
            for (position, item) in submenu.items()?.iter().enumerate() {
                if let Some(native) = item.as_predefined_menuitem() {
                    if native.text()? == quit_text {
                        let quit = MenuItem::with_id(
                            app,
                            "stik-orderly-quit",
                            &quit_text,
                            true,
                            Some("Cmd+Q"),
                        )?;
                        submenu.remove(native)?;
                        submenu.insert(&quit, position)?;
                        app.on_menu_event(|app, event| {
                            if event.id.as_ref() == "stik-orderly-quit" {
                                app.exit(0);
                            }
                        });
                        return Ok(());
                    }
                }
            }
        }
    }
    Err("Cannot replace native Quit with safe editor shutdown".into())
}

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    install_orderly_quit_menu(app)?;

    let streak_days = stats::calculate_and_persist_capture_streak().unwrap_or_else(|e| {
        eprintln!("Failed to compute capture streak: {}", e);
        0
    });
    let streak_label = stats::format_capture_streak_label(streak_days);

    let quit = MenuItem::with_id(app, "quit", "Quit Stik", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, "new_note", "New Note", true, None::<&str>)?;
    let capture_streak =
        MenuItem::with_id(app, "capture_streak", &streak_label, false, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_note, &capture_streak, &quit])?;

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "new_note" => {
                let settings = settings::get_settings().unwrap_or_default();
                show_postit_with_folder(app, &settings.default_folder);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_requested_editor_can_approve_quitting() {
        let state = EditorQuitState::default();
        assert!(state.complete("editor", true).is_err());
        state.requested.store(true, Ordering::SeqCst);
        assert!(state.complete("postit", true).is_err());
        assert!(!state.approved.load(Ordering::SeqCst));
        assert!(state.complete("editor", true).unwrap());
        assert!(state.approved.load(Ordering::SeqCst));
        assert!(state.complete("editor", true).is_err());
    }

    #[test]
    fn failed_save_cancels_quit_and_allows_a_fresh_request() {
        let state = EditorQuitState::default();
        state.requested.store(true, Ordering::SeqCst);
        assert!(!state.complete("editor", false).unwrap());
        assert!(!state.approved.load(Ordering::SeqCst));
        state.requested.store(true, Ordering::SeqCst);
        assert!(state.complete("editor", true).unwrap());
    }
}
