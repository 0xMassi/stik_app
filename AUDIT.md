# Stik Codebase Audit

**Summary**
This is a focused audit of the current Stik codebase (React + Tauri). The app is small and cohesive, but there are several correctness risks (notably pinned-note persistence and concurrent write safety), a few security gaps around CSP and Mutex handling, and some maintainability issues (god files and duplicated UI). The backend logic works, but lacks scalability optimizations for larger note sets.

**Scope**
Files reviewed include `src/**/*.tsx`, `src/styles/globals.css`, `src-tauri/src/**/*.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, and build scripts.

**High Severity Findings**
1. **Pinned note edits are lost if the user quits without moving or resizing the window.**
The sticked-note store is only written when the window emits a `mouseup` event (via the position/size save effect in `PostIt.tsx`). That effect does include the current `content` state, so moving or resizing the window will persist edits. However, if a user edits a pinned note and then quits the app (or the app crashes) without triggering `mouseup`, all content changes since the last drag/resize are silently lost. Evidence in `src/components/PostIt.tsx` (position save effect) and `src-tauri/src/commands/sticked_notes.rs` (store contents used on restore).
Recommended fix: Debounce and call `update_sticked_note` on content change for pinned notes, or autosave on blur/interval.

2. **Note filename collisions can overwrite data.**
`save_note` uses a timestamp to the second plus a slug derived from the first five words. Creating two notes within the same second with the same starting words (or non-Latin content that collapses to "note") can generate identical filenames and silently overwrite. Evidence in `src-tauri/src/commands/notes.rs` (`generate_filename` and `save_note`).
Recommended fix: Include sub-second precision or append a short random suffix/UUID.

**Medium Severity Findings**
1. **Pinned-note position may reset after restart.**
When pinning from capture mode, the note is stored without a position and the window is centered, but the stored note never receives that initial position unless the user moves it. On restart, pinned notes default to `(100,100)`. Evidence in `src-tauri/src/main.rs` (`pin_capture_note` and `create_sticked_window_centered`) and `src-tauri/src/commands/sticked_notes.rs`.
Recommended fix: Store the actual window position at creation time.

2. **Viewing-note cache grows without cleanup.**
`open_note_for_viewing` inserts note content into `viewing_notes` but no code removes it when the window closes. Over time, this can accumulate stale entries and cause a memory leak. Evidence in `src-tauri/src/main.rs` (`viewing_notes` usage).
Recommended fix: Remove the entry on `close_sticked_window` or window-destroy events.

3. **CSP is disabled and filesystem permissions are broad.**
`tauri.conf.json` sets `csp: null`, and capabilities allow `fs:default`. This increases risk if a webview is ever compromised. Evidence in `src-tauri/tauri.conf.json` and `src-tauri/capabilities/default.json`.
Recommended fix: Restore a strict CSP and limit filesystem permissions to the Stik directory if possible.

4. **Mutex `.unwrap()` calls can crash the entire app.**
`main.rs` uses `state.shortcut_to_folder.lock().unwrap()` and `state.viewing_notes.lock().unwrap()`. If a panic ever poisons the Mutex, these `.unwrap()` calls will propagate the panic and crash the application. Evidence in `src-tauri/src/main.rs` (shortcut handler and `open_note_for_viewing`).
Recommended fix: Use `.lock().map_err(|e| e.to_string())?` to convert poisoned Mutex errors into recoverable Results instead of panicking.

5. **Sticked notes JSON file has no atomic write protection.**
`save_sticked_notes` in `sticked_notes.rs` calls `fs::write(&path, content)` directly. If two pinned note windows are being dragged or resized simultaneously, both trigger concurrent `save_sticked_notes` calls that can interleave writes and corrupt the JSON file. Evidence in `src-tauri/src/commands/sticked_notes.rs` (`save_sticked_notes`).
Recommended fix: Write to a temporary file and atomically rename it, or serialize all store writes through a Mutex-guarded channel.

**Low Severity / Code Smells**
1. **Search highlight bug due to global regex state.**
`highlightSnippet` uses a global regex with `.test`, which is stateful and can skip matches intermittently. Evidence in `src/components/SearchModal.tsx`.
Recommended fix: Use a non-global regex (`i` only) or determine highlight based on split index parity.

2. **Selection can point to deleted folders in Manager.**
After deleting a folder, `selectedItem` isn't guaranteed to be updated because `loadFolderStats` only sets a default when there is no selection. Evidence in `src/components/ManagerModal.tsx`.
Recommended fix: Reset selection to a valid folder if the current one no longer exists.

3. **Mismatch between README and settings location.**
README says settings are stored in the Tauri app data directory, but the code writes to `~/.stik`. Evidence in `README.md` and `src-tauri/src/commands/settings.rs`.
Recommended fix: Either update README or migrate to OS-appropriate app data paths.

4. **Viewing window shows "Loading..." forever on error.**
In `App.tsx`, if `get_viewing_note_content` fails (e.g. the viewing-notes cache entry is missing due to the leak bug above), the error is silently swallowed and the user sees a permanent "Loading..." state with no way to recover or close gracefully. Evidence in `src/App.tsx` (viewing window branch).
Recommended fix: Show an error state with a close button, or fall back to closing the window.

5. **Folder and note names are not explicitly validated for path separators.**
Folder and note APIs accept user-provided strings and rely on Rust's `PathBuf::join()` for safety. While `PathBuf::join` is not vulnerable to traditional `..` traversal in the way string concatenation would be, there is no explicit rejection of names containing `..` or path separators. Adding validation would be a defense-in-depth measure. Evidence in `src-tauri/src/commands/folders.rs` and `src-tauri/src/commands/notes.rs`.
Recommended fix: Reject folder and note names containing `..`, `/`, or `\` as a defense-in-depth measure.

**Redundant or Unused Code**
1. **Unused Tauri store plugin and permission.**
`tauri-plugin-store` is enabled but not used in frontend or backend logic. Evidence in `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, and dependencies.
Recommended fix: Remove the plugin and permission, or start using it for settings/sticked notes.

2. **Unused settings commands.**
`get_shortcut_mappings`, `save_shortcut_mapping`, and `set_setting` are registered but not used by the frontend. Evidence in `src-tauri/src/commands/settings.rs` and `src-tauri/src/main.rs`.
Recommended fix: Remove or wire them into UI workflows.

3. **Duplicated UI structures.**
`SettingsModal` has two largely identical render branches (modal vs window). `ShortcutMapping` and `StikSettings` interfaces are redefined in multiple components. Evidence in `src/components/SettingsModal.tsx` and `src/components/FolderSelectorModal.tsx`.
Recommended fix: Factor shared UI into subcomponents and move shared types to a common module.

**God Files / Single-Responsibility Violations**
1. **`src-tauri/src/main.rs` is a god file.**
It handles window creation, shortcut parsing, global state, app setup, tray menu logic, and viewing cache. This makes it hard to test and reason about. Recommended split: `shortcuts.rs`, `windows.rs`, `state.rs`, and `tray.rs`.

2. **`src/components/PostIt.tsx` mixes UI, state, persistence, and window behavior.**
It handles capture flows, sticked behavior, saving, pinning, drag persistence, and UI composition in one file. Recommended split into hooks (`usePinnedNote`, `useFolderPicker`), and smaller UI components (header/footer).

**Scalability Concerns**
1. **Search is O(N * content length) and re-reads every file on each query.**
`search_notes` reads all note contents on each query and lowercases each string. This will be slow for large note sets. Evidence in `src-tauri/src/commands/notes.rs`.
Recommended fix: Build an index (in-memory or on-disk), cache file contents/metadata, or use a fast search tool and incremental filtering.

2. **Manager loads all note contents.**
`list_notes` reads full content for all notes to build previews, which doesn't scale. Evidence in `src-tauri/src/commands/notes.rs` and `src/components/ManagerModal.tsx`.
Recommended fix: Provide a "summary" API that only returns metadata and a snippet.

3. **No data versioning or migration for settings/sticked notes.**
JSON stores in `~/.stik` have no schema/versioning, which will make future changes harder to migrate safely.

**Recommendations (Prioritized)**
1. Fix pinned-note persistence (autosave on content change) and filename collision risks.
2. Add atomic writes for sticked notes JSON and replace Mutex `.unwrap()` with proper error handling.
3. Restore a restrictive CSP and limit filesystem permissions.
4. Refactor `main.rs` and `PostIt.tsx` into smaller modules.
5. Introduce a scalable search/index path for large note sets.
6. Remove unused plugins/commands and consolidate duplicate UI/types.
