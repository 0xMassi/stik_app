use std::collections::HashMap;
use std::sync::Mutex;

pub struct ViewingNoteContent {
    pub id: String,
    pub content: String,
    pub folder: String,
    pub path: String,
}

pub struct AppState {
    pub shortcut_to_folder: Mutex<HashMap<String, String>>,
    pub viewing_notes: Mutex<HashMap<String, ViewingNoteContent>>,
    pub previous_focused_window: Mutex<Option<String>>,
    pub postit_was_visible: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            shortcut_to_folder: Mutex::new(HashMap::new()),
            viewing_notes: Mutex::new(HashMap::new()),
            previous_focused_window: Mutex::new(None),
            postit_was_visible: Mutex::new(false),
        }
    }
}
