# Changelog

All notable changes to Stik will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-02-06

### Added
- **In-memory note index** for fast search and listing (two-tier: preview match then full-file fallback)
- **On-demand content loading** — search/list results no longer carry full file content over IPC
- **Versioned JSON storage** — settings and sticked notes use `{ version, data }` envelope with auto-migration
- **Path traversal validation** on folder/note names
- **Content Security Policy** — restrictive CSP for the webview
- **Scoped filesystem permissions** — limited to `~/Documents/Stik/` and `~/.stik/`
- **Toast notification** when attempting to delete the protected Inbox folder
- **Shared TypeScript types** (`src/types/index.ts`) used across all components
- **Extracted `SettingsContent` component** — shared settings UI for both window and dialog modes

### Fixed
- **Capture window no longer hides on blur when content is present** — only auto-hides when editor is empty
- **Pinned note content loss on quit** — debounced content autosave for sticked notes
- **Filename collisions** — UUID suffix prevents same-second overwrites
- **Pinned note position reset** — window position persisted after centering
- **Viewing note cache leak** — entries cleaned up on window close
- **Mutex crashes** — all `.lock().unwrap()` replaced with poisoned-mutex recovery
- **Sticked notes JSON corruption** — atomic writes via temp file + rename
- **Search highlight bug** — fixed stateful global regex with index parity
- **Stale folder selection** — selection resets after folder deletion in manager
- **Viewing window stuck on "Loading..."** — error state with close button

### Changed
- **Split `main.rs`** from 991 lines into 5 focused modules: `state.rs`, `shortcuts.rs`, `windows.rs`, `tray.rs`, and slim orchestrator `main.rs` (~120 lines)
- **`SettingsModal`** reduced from ~465 to ~135 lines via shared `SettingsContent`

### Removed
- `tauri-plugin-store` dependency (unused)
- Unused settings commands (`get_shortcut_mappings`, `save_shortcut_mapping`, `set_setting`)

## [0.1.0] - 2026-02-05

### Added
- **Core capture flow**: Global shortcut summons post-it, type, close to save
- **Folder organization**: Inbox, Work, Ideas, Personal, Projects (customizable)
- **Global shortcuts**:
  - `Cmd+Shift+S` - New note in default folder
  - `Cmd+Shift+F` - Select folder then capture
  - `Cmd+Shift+P` - Search all notes
  - `Cmd+Shift+M` - Manage notes & folders
  - `Cmd+Shift+,` - Open settings
- **Search modal**: Find notes instantly with highlighted matches
- **Manager modal**: Browse folders, expand to see notes, delete/rename
- **Folder selector**: Quick folder switching with create-on-the-fly
- **Pin notes**: Keep important notes floating on desktop
- **Settings**: Configure shortcuts, default folder, folder-specific hotkeys
- **File management**:
  - Delete notes (`Backspace` in search/manager)
  - Move notes between folders (`Cmd+M` in search)
  - Delete folders (`Backspace` in folder selector)
  - Rename folders (`Cmd+R` in folder selector)
- **Safety**: Inbox folder protected from deletion/rename
- **Rich text editor**: Markdown support via Tiptap
- **Local storage**: Notes saved as `.md` files in `~/Documents/Stik/`

### Technical
- Built with Tauri 2.0 (Rust backend, React frontend)
- React 19 with TypeScript
- Tailwind CSS for styling
- Tiptap for rich text editing

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 0.2.0 | 2026-02-06 | Security hardening, performance index, architecture refactor |
| 0.1.0 | 2026-02-05 | Initial release - core capture, search, manager |

[Unreleased]: https://github.com/YOUR_USERNAME/stik/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/YOUR_USERNAME/stik/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/YOUR_USERNAME/stik/releases/tag/v0.1.0
