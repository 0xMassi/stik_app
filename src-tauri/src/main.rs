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
    ai_assistant, analytics, apple_notes, cursor_positions, darwinkit, dictation, embeddings,
    file_watcher, folders, git_share, icloud, index, macos_notify, note_lock, notes,
    on_this_day, settings, share, stats, sticked_notes, storage,
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

/// Tracks whether we've already opened System Settings and notified
/// the user about missing Accessibility this session. Reset back to
/// false as soon as a clip_capture succeeds — so if the user grants
/// permission and it starts working, the flag clears and we're ready
/// to warn again if it breaks later. Without this, every failed clip
/// press would pop System Settings open, which is awful.
static CLIP_PERMISSION_WARNED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Clipboard capture: read the currently-selected text directly from
/// the focused UI element via the macOS Accessibility API and save it
/// as a note.
///
/// We used to do this by simulating ⌘C and then reading the pasteboard,
/// but that approach had a long list of failure modes: osascript TCC
/// error 1002, CGEventPost silently dropped on synthetic events,
/// pasteboard race conditions, clobbering the user's clipboard, etc.
/// Reading from `AXUIElementCopyAttributeValue(focused, kAXSelectedText)`
/// sidesteps ALL of that: no keystroke simulation, no pasteboard dance,
/// the text comes straight from the source app's accessibility tree.
/// This is the same approach PopClip, Alfred, and Raycast use.
fn clip_capture(app: &AppHandle) {
    // Write to a dedicated file so the trace survives across process
    // boundaries and is trivially grep-able. eprintln also goes to the
    // parent's stderr in debug, but that's swallowed when Stik is
    // launched via `open`.
    //
    // Each call logs a tag with the Stik version + a build marker so
    // you can check `/tmp/stik-clip.log` and know *which* Stik binary
    // just ran — useful when iterating rapidly.
    let log = |msg: &str| {
        eprintln!("[clip_capture] {}", msg);
        if cfg!(debug_assertions) {
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("/tmp/stik-clip.log")
            {
                let _ = writeln!(
                    f,
                    "[{}] {}",
                    chrono::Local::now().format("%H:%M:%S%.3f"),
                    msg
                );
            }
        }
    };

    log(&format!(
        "--- clip_capture v{} (AX-read) ---",
        env!("CARGO_PKG_VERSION")
    ));

    // 1. Pre-check Accessibility. AXUIElementCopyAttributeValue returns
    //    no error even when TCC denies it — it just returns an empty
    //    result — so this pre-check is the only way to give the user
    //    a clear "permission needed" message upfront.
    if !is_accessibility_granted() {
        log("AXIsProcessTrusted = false — Accessibility NOT granted");
        warn_about_accessibility();
        return;
    }
    log("AXIsProcessTrusted = true");

    // 2. Read the selected text directly from the focused UI element
    //    via the Accessibility API. No keystroke simulation, no
    //    pasteboard, no race conditions — the text comes straight
    //    from the source app's accessibility tree.
    let text = match read_selected_text_via_ax() {
        Some(t) if !t.trim().is_empty() => {
            log(&format!("AX read OK, selected text length = {}", t.len()));
            t
        }
        Some(_) => {
            log("AX read OK but selected text is empty");
            let _ = macos_notify::show(
                "Stik",
                "Nothing selected",
                "Highlight some text first, then press the shortcut.",
            );
            return;
        }
        None => {
            log("AX read failed — app doesn't expose selected text");
            let _ = macos_notify::show(
                "Stik",
                "Can't read selection",
                "This app doesn't expose selected text. Copy it manually, then paste into Stik.",
            );
            return;
        }
    };

    // 3. Resolve target folder
    let folder = settings::load_settings_from_file()
        .map(|s| s.default_folder)
        .unwrap_or_else(|_| "Inbox".to_string());

    // 4. Save the note
    match notes::save_note_inner(folder.clone(), text.clone()) {
        Ok(result) => {
            log(&format!("saved note: {}", result.path));
            notes::post_save_processing(app, &result, &text);

            // Clear the warned flag now that capture actually works —
            // if it breaks later (permission revoked, Settings closed
            // the app out), we're allowed to warn again.
            CLIP_PERMISSION_WARNED
                .store(false, std::sync::atomic::Ordering::Relaxed);

            // Notify any open webview (Command Palette, manager) that a
            // new file exists so they can refresh. file_watcher would
            // catch this eventually, but emitting directly avoids a
            // visible delay.
            let _ = app.emit("files-changed", vec![result.path.clone()]);

            let preview: String = text.lines().next().unwrap_or("").chars().take(60).collect();
            let _ = macos_notify::show(
                "Stik",
                &format!("Saved to {}", folder),
                &preview,
            );
        }
        Err(e) => {
            log(&format!("save failed: {}", e));
            let _ = macos_notify::show("Stik", "Save failed", &e);
        }
    }
}

/// Emits the "Accessibility permission needed" notification and, ONLY
/// the first time this session, also pops the System Settings pane.
/// Subsequent failures show a concise banner without re-opening
/// Settings — we trust the user to remember the fix from the first
/// prompt, and it's infuriating to have Settings pop open on every
/// shortcut press while debugging.
fn warn_about_accessibility() {
    use std::sync::atomic::Ordering;
    let already_warned = CLIP_PERMISSION_WARNED.swap(true, Ordering::Relaxed);
    if !already_warned {
        open_accessibility_settings();
        let _ = macos_notify::show(
            "Stik",
            "Accessibility permission needed",
            "Opened System Settings. Enable Stik, quit + relaunch Stik, then try again.",
        );
    } else {
        let _ = macos_notify::show(
            "Stik",
            "Clipboard capture still blocked",
            "Quit & relaunch Stik after toggling Accessibility back on.",
        );
    }
}

/// Checks whether the Stik process currently has Accessibility
/// permission, *without* prompting the user. This is the authoritative
/// TCC query — if it returns false, CGEventPost will silently drop
/// any keystrokes we send, so there's no point trying.
#[cfg(target_os = "macos")]
fn is_accessibility_granted() -> bool {
    // AXIsProcessTrustedWithOptions is declared in ApplicationServices/
    // AXUIElement.h and takes a CFDictionaryRef (or nullptr). Passing
    // nullptr performs a silent check without popping the system
    // prompt — which is what we want here since we open the Settings
    // pane ourselves via `open -b`.
    use std::ffi::c_void;
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    }
    unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
}

/// Reads the currently-selected text from whatever UI element is
/// focused system-wide, via the macOS Accessibility API.
///
/// The chain is:
///   AXUIElementCreateSystemWide()
///     → copyAttributeValue(kAXFocusedUIElement)
///       → copyAttributeValue(kAXSelectedText)
///         → Rust String
///
/// Returns `None` if any step fails, including the common case where
/// the focused element doesn't expose `kAXSelectedText` (some Electron
/// apps, some custom text views, most terminals). Returns `Some("")`
/// when the attribute exists but the selection is empty.
#[cfg(target_os = "macos")]
fn read_selected_text_via_ax() -> Option<String> {
    use core_foundation::base::{CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};
    use std::ffi::c_void;

    // Raw bindings — the `accessibility-sys` crate has these but
    // pulling it in just for two symbols isn't worth the dependency.
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXUIElementCreateSystemWide() -> *mut c_void;
        fn AXUIElementCopyAttributeValue(
            element: *mut c_void,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> i32;
        fn CFRelease(cf: *mut c_void);
    }

    // Both strings are documented in <HIServices/AXAttributeConstants.h>
    const AX_FOCUSED_UI_ELEMENT: &str = "AXFocusedUIElement";
    const AX_SELECTED_TEXT: &str = "AXSelectedText";
    const AX_ERROR_SUCCESS: i32 = 0;

    unsafe {
        let systemwide = AXUIElementCreateSystemWide();
        if systemwide.is_null() {
            return None;
        }

        // Step 1: resolve the focused UI element
        let focused_attr = CFString::from_static_string(AX_FOCUSED_UI_ELEMENT);
        let mut focused_value: CFTypeRef = std::ptr::null();
        let status = AXUIElementCopyAttributeValue(
            systemwide,
            focused_attr.as_concrete_TypeRef(),
            &mut focused_value,
        );
        CFRelease(systemwide);
        if status != AX_ERROR_SUCCESS || focused_value.is_null() {
            return None;
        }

        // Step 2: ask the focused element for its selected text
        let selected_attr = CFString::from_static_string(AX_SELECTED_TEXT);
        let mut text_value: CFTypeRef = std::ptr::null();
        let status = AXUIElementCopyAttributeValue(
            focused_value as *mut c_void,
            selected_attr.as_concrete_TypeRef(),
            &mut text_value,
        );
        CFRelease(focused_value as *mut c_void);
        if status != AX_ERROR_SUCCESS || text_value.is_null() {
            return None;
        }

        // Step 3: convert the CFStringRef into a Rust String. Using
        // `wrap_under_create_rule` takes ownership of the +1 retain
        // that AXUIElementCopyAttributeValue's "Copy" semantics grants
        // us, so Rust will properly release it when the value drops.
        let cf_str = CFString::wrap_under_create_rule(text_value as CFStringRef);
        Some(cf_str.to_string())
    }
}

/// Opens System Settings → Privacy & Security → Accessibility directly,
/// so the user only has to click the Stik row toggle instead of hunting
/// through the Settings tree. The `x-apple.systempreferences:` URL
/// scheme is accepted on every modern macOS, and the anchor sends the
/// user straight to the Accessibility pane.
fn open_accessibility_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
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
                                "clip_capture" => {
                                    let app = app.clone();
                                    std::thread::Builder::new()
                                        .name("stik-clip-capture".to_string())
                                        .spawn(move || {
                                            clip_capture(&app);
                                        })
                                        .ok();
                                    return;
                                }
                                "voice_note" => {
                                    // Open a fresh postit for the default
                                    // folder, then tell the webview to
                                    // auto-toggle the mic as soon as it
                                    // sees the event. The postit window
                                    // is pre-created (just hidden) so the
                                    // listener is already mounted.
                                    let default_folder = settings::load_settings_from_file()
                                        .map(|s| s.default_folder)
                                        .unwrap_or_else(|_| "Inbox".to_string());
                                    show_postit_with_folder(app, &default_folder);
                                    if let Some(window) = app.get_webview_window("postit") {
                                        let _ = window.emit("start-dictation", ());
                                    }
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
            settings::import_font_file,
            settings::load_font_data,
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
            dictation::dictation_list_models,
            dictation::dictation_get_status,
            dictation::dictation_download_model,
            dictation::dictation_cancel_download,
            dictation::dictation_delete_model,
            dictation::dictation_set_active_model,
            dictation::dictation_start,
            dictation::dictation_stop,
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
                // Watch local notes directory for external changes
                file_watcher::start(app.handle().clone());
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

            // (DevTools auto-open removed. ⌘⌥I still opens them on
            //  demand from the global-shortcut handler at line 200-ish.)

            windows::restore_sticked_notes(app.handle());
            tray::setup_tray(app)?;

            // Apply tray icon visibility from settings
            if settings.hide_tray_icon {
                if let Some(tray) = app.tray_by_id("main-tray") {
                    let _ = tray.set_visible(false);
                }
            }
            git_share::start_background_worker(app.handle().clone());

            // Start DarwinKit sidecar bridge unconditionally — it now hosts
            // dictation (WhisperKit) which is needed regardless of the AI or
            // iCloud feature toggles. Cost is ~10 MB resident; benefit is a
            // single warm sidecar shared across all handlers.
            let icloud_enabled = settings.icloud.enabled;
            {
                darwinkit::start_bridge(app.handle().clone());

                // Store AppHandle for dictation event forwarding
                dictation::register_notifications(app.handle());

                // Register unified notification handler for all DarwinKit push events
                let handle = app.handle().clone();
                darwinkit::register_notification_handler(move |method, params| {
                    // Dictation notifications (dictation.partial, .final, .error,
                    // .download_progress, .download_complete, .model_loaded, ...)
                    if dictation::handle_notification(&method, &params) {
                        return;
                    }

                    // iCloud file change notifications
                    if method == "icloud.files_changed" {
                        if let Some(paths) = params.get("paths").and_then(|v| v.as_array()) {
                            let path_strings: Vec<String> = paths
                                .iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect();

                            if !path_strings.is_empty() {
                                file_watcher::handle_changes(&handle, &path_strings);
                                let _ = handle.emit("icloud-files-changed", &path_strings);
                            }
                        }
                    }
                });

                if icloud_enabled {
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

                let ai_enabled = settings::get_settings()
                    .map(|s| s.ai_features_enabled)
                    .unwrap_or(true);
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
