use std::collections::HashSet;
use std::sync::{Mutex, MutexGuard, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Origin {
    Tauri,
    Native,
}

#[derive(Clone, Debug)]
struct Attempt {
    id: u64,
    origin: Origin,
    remaining: HashSet<String>,
}

#[derive(Default)]
struct QuitState {
    sequence: u64,
    registered: HashSet<String>,
    pending: Option<Attempt>,
    approved: bool,
}

enum Start {
    Allow,
    Waiting,
    Request(Attempt),
}

impl QuitState {
    fn begin(&mut self, origin: Origin, windows: HashSet<String>) -> Result<Start, String> {
        if self.approved {
            return Ok(Start::Allow);
        }
        if let Some(pending) = &mut self.pending {
            if origin == Origin::Native {
                pending.origin = Origin::Native;
            }
            return Ok(Start::Waiting);
        }
        self.registered.retain(|label| windows.contains(label));
        if !windows.is_subset(&self.registered) {
            return Err(
                "A note window is still loading; try quitting again when it is ready".into(),
            );
        }
        if windows.is_empty() {
            return Ok(Start::Allow);
        }
        self.sequence += 1;
        let attempt = Attempt {
            id: self.sequence,
            origin,
            remaining: windows,
        };
        self.pending = Some(attempt.clone());
        Ok(Start::Request(attempt))
    }
    fn complete(
        &mut self,
        label: &str,
        id: u64,
        saved: bool,
    ) -> Result<Option<(Attempt, bool)>, String> {
        let pending = self.pending.as_mut().ok_or("No quit request is pending")?;
        if pending.id != id || !pending.remaining.remove(label) {
            return Err("This window has no matching pending save request".into());
        }
        if !saved || pending.remaining.is_empty() {
            self.approved = saved;
            return Ok(self.pending.take().map(|attempt| (attempt, saved)));
        }
        Ok(None)
    }
    fn cancel(&mut self, id: u64) -> Option<Attempt> {
        if self
            .pending
            .as_ref()
            .is_some_and(|attempt| attempt.id == id)
        {
            self.pending.take()
        } else {
            None
        }
    }
}

fn state() -> MutexGuard<'static, QuitState> {
    static STATE: OnceLock<Mutex<QuitState>> = OnceLock::new();
    STATE
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

fn note_window(label: &str) -> bool {
    label == "editor" || label == "postit" || label.starts_with("sticked-")
}

#[derive(Clone, serde::Serialize)]
struct QuitEvent {
    id: u64,
}

fn finish(app: &AppHandle, attempt: Attempt, saved: bool) {
    if !saved {
        if let Err(error) = app.emit("app-quit-cancelled", QuitEvent { id: attempt.id }) {
            eprintln!("Cannot notify windows that quitting was cancelled: {error}");
        }
    }
    match attempt.origin {
        Origin::Tauri => {
            if saved {
                app.exit(0);
            }
        }
        Origin::Native => {
            #[cfg(target_os = "macos")]
            native::reply(app, saved);
        }
    }
}

#[tauri::command]
pub fn register_quit_participant(window: tauri::Window, app: AppHandle) -> Result<(), String> {
    if !note_window(window.label()) {
        return Err("Not a note window".into());
    }
    let cancelled = {
        let mut state = state();
        state.registered.insert(window.label().into());
        // Opening/reloading a note during shutdown invalidates the snapshot.
        state.pending.take()
    };
    if let Some(attempt) = cancelled {
        finish(&app, attempt, false);
    }
    Ok(())
}

#[tauri::command]
pub fn complete_app_quit(
    window: tauri::Window,
    app: AppHandle,
    id: u64,
    saved: bool,
) -> Result<(), String> {
    let completed = state().complete(window.label(), id, saved)?;
    if let Some((attempt, saved)) = completed {
        finish(&app, attempt, saved);
    }
    Ok(())
}

pub fn window_destroyed(app: &AppHandle, label: &str) {
    if !note_window(label) {
        return;
    }
    let cancelled = {
        let mut state = state();
        state.registered.remove(label);
        state.pending.take()
    };
    if let Some(attempt) = cancelled {
        finish(app, attempt, false);
    }
}

fn begin(app: &AppHandle, origin: Origin) -> Result<bool, String> {
    let windows = app
        .webview_windows()
        .into_keys()
        .filter(|label| note_window(label))
        .collect();
    let start = state().begin(origin, windows)?;
    match start {
        Start::Allow => Ok(false),
        Start::Waiting => Ok(true),
        Start::Request(attempt) => {
            for label in &attempt.remaining {
                if let Err(error) =
                    app.emit_to(label, "app-quit-requested", QuitEvent { id: attempt.id })
                {
                    let cancelled = state().cancel(attempt.id);
                    if cancelled.is_some() {
                        // Native callers return Cancel directly, before entering the modal wait.
                        let _ = app.emit("app-quit-cancelled", QuitEvent { id: attempt.id });
                    }
                    return Err(format!("Cannot ask {label} to save: {error}"));
                }
            }
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(30));
                let cancelled = state().cancel(attempt.id);
                if let Some(attempt) = cancelled {
                    eprintln!(
                        "Quit cancelled: a note window did not finish saving within 30 seconds"
                    );
                    finish(&app, attempt, false);
                }
            });
            Ok(true)
        }
    }
}

pub fn defer_exit(app: &AppHandle) -> bool {
    begin(app, Origin::Tauri).unwrap_or_else(|error| {
        eprintln!("Quit cancelled: {error}");
        true
    })
}

#[cfg(target_os = "macos")]
pub use native::install;

#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use objc2::{
        runtime::{AnyObject, Imp, Sel},
        sel, MainThreadMarker,
    };
    use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};

    static APP: OnceLock<AppHandle> = OnceLock::new();

    extern "C" fn should_terminate(
        _: &AnyObject,
        _: Sel,
        _: &NSApplication,
    ) -> NSApplicationTerminateReply {
        // Never unwind through AppKit, including in debug builds.
        std::panic::catch_unwind(|| {
            let Some(app) = APP.get() else {
                return NSApplicationTerminateReply::TerminateCancel;
            };
            match begin(app, Origin::Native) {
                Ok(false) => NSApplicationTerminateReply::TerminateNow,
                Ok(true) => NSApplicationTerminateReply::TerminateLater,
                Err(error) => {
                    eprintln!("Native quit cancelled: {error}");
                    NSApplicationTerminateReply::TerminateCancel
                }
            }
        })
        .unwrap_or(NSApplicationTerminateReply::TerminateCancel)
    }

    pub fn install(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let mtm =
            MainThreadMarker::new().ok_or("Quit handler must be installed on the main thread")?;
        let application = NSApplication::sharedApplication(mtm);
        let delegate = application
            .delegate()
            .ok_or("Application delegate is unavailable")?;
        let object: &AnyObject = (*delegate).as_ref();
        let class = object.class();
        let selector = sel!(applicationShouldTerminate:);
        if class.instance_method(selector).is_some() {
            return Err(
                "Upstream now handles applicationShouldTerminate:; review Stik's quit integration"
                    .into(),
            );
        }
        APP.set(app.clone())
            .map_err(|_| "Quit handler was already installed")?;
        // Tao has no termination veto hook. Add only the missing delegate method;
        // replacing the delegate would break Tao's private auxState ivar access.
        // SAFETY: macOS targets here are 64-bit. NSApplicationTerminateReply is
        // NSUInteger (Q), followed by self (@), selector (:), and NSApplication (@).
        // The existing class/instance layout and every existing method stay intact.
        let added = unsafe {
            let implementation: Imp = std::mem::transmute(
                should_terminate
                    as extern "C" fn(
                        &AnyObject,
                        Sel,
                        &NSApplication,
                    ) -> NSApplicationTerminateReply,
            );
            objc2::ffi::class_addMethod(
                (class as *const objc2::runtime::AnyClass).cast_mut(),
                selector,
                implementation,
                c"Q@:@".as_ptr(),
            )
            .as_bool()
        };
        if !added {
            return Err("Cannot install native safe-quit handler".into());
        }
        Ok(())
    }

    pub(super) fn reply(app: &AppHandle, saved: bool) {
        if let Err(error) = app.run_on_main_thread(move || {
            if let Some(mtm) = MainThreadMarker::new() {
                NSApplication::sharedApplication(mtm).replyToApplicationShouldTerminate(saved);
            }
        }) {
            eprintln!("Cannot answer the native quit request: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> QuitState {
        QuitState {
            registered: ["editor", "postit", "sticked-1"].map(String::from).into(),
            ..Default::default()
        }
    }
    fn request(state: &mut QuitState, origin: Origin) -> u64 {
        match state.begin(origin, state.registered.clone()).unwrap() {
            Start::Request(attempt) => attempt.id,
            _ => panic!("Expected a save request"),
        }
    }

    #[test]
    fn every_note_window_must_save_before_exit() {
        let mut state = state();
        let id = request(&mut state, Origin::Tauri);
        assert!(state.complete("editor", id, true).unwrap().is_none());
        assert!(state.complete("postit", id, true).unwrap().is_none());
        assert!(!state.approved);
        let (attempt, saved) = state.complete("sticked-1", id, true).unwrap().unwrap();
        assert!(saved && state.approved);
        assert_eq!(attempt.origin, Origin::Tauri);
    }

    #[test]
    fn unknown_duplicate_and_stale_acknowledgements_cannot_approve_quit() {
        let mut state = state();
        let id = request(&mut state, Origin::Tauri);
        assert!(state.complete("settings", id, true).is_err());
        assert!(state.complete("editor", id + 1, true).is_err());
        assert!(state.complete("editor", id, true).unwrap().is_none());
        assert!(state.complete("editor", id, true).is_err());
        assert!(!state.approved);
    }

    #[test]
    fn failed_save_cancels_every_window_and_retry_has_a_new_generation() {
        let mut state = state();
        let id = request(&mut state, Origin::Native);
        state.complete("editor", id, true).unwrap();
        let (attempt, saved) = state.complete("postit", id, false).unwrap().unwrap();
        assert!(!saved && !state.approved);
        assert_eq!(attempt.origin, Origin::Native);
        let next = request(&mut state, Origin::Tauri);
        assert!(next > id);
        assert!(state.complete("sticked-1", id, true).is_err());
        assert!(state.cancel(id).is_none());
        assert_eq!(state.pending.as_ref().unwrap().id, next);
    }

    #[test]
    fn native_termination_joins_a_pending_tray_quit_without_duplicate_saves() {
        let mut state = state();
        let id = request(&mut state, Origin::Tauri);
        assert!(matches!(
            state
                .begin(Origin::Native, state.registered.clone())
                .unwrap(),
            Start::Waiting
        ));
        assert_eq!(state.pending.as_ref().unwrap().id, id);
        assert_eq!(state.pending.as_ref().unwrap().origin, Origin::Native);
    }

    #[test]
    fn an_unready_note_window_blocks_quit_and_closed_windows_are_pruned() {
        let mut state = state();
        let mut windows = state.registered.clone();
        windows.insert("sticked-new".into());
        assert!(state.begin(Origin::Tauri, windows).is_err());
        assert!(state.pending.is_none());
        let Start::Request(attempt) = state
            .begin(Origin::Tauri, ["postit".into()].into())
            .unwrap()
        else {
            panic!("Expected save");
        };
        assert_eq!(attempt.remaining, ["postit".into()].into());
        assert_eq!(state.registered, attempt.remaining);
    }
}
