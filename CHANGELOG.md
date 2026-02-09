# Changelog

All notable changes to Stik will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.2] - 2026-02-09
Community and support links

### Added
- **Settings footer social links** — new Help/X/Discord quick actions next to the app version in both settings surfaces (modal and standalone settings window)
- **Help action in app settings** — one-click support contact via `mailto:help@stik.ink`

### Changed
- **Support channels updated** — README now points to `help@stik.ink` plus official X and Discord community links

## [0.4.1] - 2026-02-09
Editing and reliability polish

### Added
- **Link shortcuts for selected text** — press `Cmd+K` or `Cmd+L` to open link editing for the current selection
- **Cleaner note previews** — search/manager now derive readable titles/snippets from markdown content
- **Desktop image drop support** — drag images from Finder/Desktop into notes with local-path import into `.assets/`

### Fixed
- **Link navigation control** — plain click no longer navigates externally; use `Cmd+Click` or popover Open action
- **Reopen last note (`Cmd+Shift+L`)** — now tracks notes opened from Search and Manager, not only newly saved notes
- **Image reopen rendering** — dropped/pasted images persist with normalized paths and render correctly after reopening notes
- **Folder edge-case behavior** — capture/save flow now works when default/requested folders are missing or folder sets are empty

### Changed
- **Folder selection logic** centralized via shared fallback resolution for capture and save operations
- **Image path normalization** now supports `asset://localhost`, `asset.localhost`, and `file://` forms
- **Link interaction model** aligns editor behavior with popover controls and explicit shortcut-based navigation

## [0.4.0] - 2026-02-08
Editor power-ups & quality of life

### Added
- **Vim mode** — full modal editing with Normal, Insert, Visual, and Command modes. Toggle in Settings > Editor. Includes status bar indicator, text objects (`ciw`, `ci"`, `di(`), and `:wq`/`:q!` commands
- **Highlighting** (`==text==`) — wrap text in `==` for visual emphasis. Renders with coral background, roundtrips to markdown, adapts to light/dark theme
- **Collapsible headings** — hover any heading to reveal a fold chevron. Click to collapse/expand content beneath. Purely visual, no markdown markers
- **Wiki-links** (`[[slug]]`) — type `[[` to autocomplete and link to other notes. Renders as styled inline element, click to open the referenced note. Stored as literal `[[slug]]` in markdown
- **Link popover** — place cursor inside any link to see a floating toolbar with Open, Copy, Edit, and Unlink actions
- **Markdown link input rule** — type `[text](url)` to instantly create a clickable link with URL normalization and protocol safety
- **Image paste & drop** — paste or drag images into the editor. Saved to `.assets/` alongside the note, referenced as standard markdown images
- **Task list input fix** — typing `- [ ] ` now correctly creates a checkbox (fixes BulletList/TaskItem conflict)
- **Custom notes directory** — choose any folder as your notes root via Settings > Folders
- **Reopen last note** (`Cmd+Shift+L`) — instantly reopen the most recently saved note
- **Theme customization** — System, Light, and Dark modes with live switching
- **Automated test suite** — 38 unit tests covering URL normalization, XSS escaping, slug generation, and markdown roundtrips

### Fixed
- **Link click behavior** — Cmd+Click opens external links, regular click positions cursor (no accidental navigation)
- **Dangerous URL protocols** — `javascript:`, `data:`, and `file:` URLs are rejected and sanitized
- **XSS in wiki-link slugs** — HTML entities escaped in rendered wiki-link nodes
- **Sticky highlight formatting** — `inclusive: false` prevents highlight from bleeding into adjacent text

### Changed
- **Editor extensions** refactored into individual files under `src/extensions/`
- **CI/CD pipeline** — secrets scoped to specific workflow steps, Vercel deploy hook secured

## [0.3.3] - 2026-02-07
Silent auto-updates

### Added
- **Auto-updater** — silently downloads updates in the background, applies on next app restart
- **Version display** — app version shown in the settings footer

## [0.3.2] - 2026-02-07
Polish & bug fixes

### Fixed
- **Double tray icon** — removed duplicate tray icon created by both config and code (#2)
- **Menu bar icon appearance** — use a proper macOS template icon that adapts to light/dark mode (#3)
- **Ctrl registered as Cmd in shortcuts** — Ctrl (⌃) and Cmd (⌘) are now correctly distinguished when recording and registering shortcuts (#4)
- **Links not clickable** — Cmd+Click on links in the editor now opens them in the default browser; cursor changes to pointer when Cmd is held over a link (#5)

### Changed
- Homebrew install instructions updated to use `0xMassi/stik` tap

## [0.3.1] - 2026-02-06

## [0.3.0] - 2026-02-06
On-device AI & git sharing

### Added
- **On-device AI features** powered by DarwinKit sidecar (Apple NaturalLanguage framework, zero cloud dependency)
  - **Semantic search** — hybrid text + semantic results in search modal with similarity badges
  - **Folder suggestions** — real-time AI-powered folder pill while capturing notes, based on folder centroids
  - **Note embeddings** — background embedding build on launch, persisted to `~/.stik/embeddings.json`
- **Git sharing** — sync folders via git with configurable repository layout (monorepo or per-folder), background auto-sync worker
- **Capture streak** — consecutive-day counter shown in tray menu and settings
- **On This Day** — daily notification resurfacing notes from the same date in prior years
- **Share as clipboard** — copy notes as rich text, plain markdown, or image snapshot to clipboard
- **AI settings tab** — dedicated settings section to enable/disable AI features with privacy documentation
- **Raycast-style settings redesign** — horizontal tab bar with SVG icons, scrollable content, resizable window (620x700)

### Fixed
- **Language-aware embeddings** — Apple NLEmbedding uses different vector dimensions per language (e.g. English=512, Italian=640); similarity and centroid calculations now filter by matching language
- **Folder suggestion threshold** — lowered from 0.5 to 0.35 for better suggestions with small note collections
- **Settings overflow** — content was clipped by `overflow: hidden` on root elements; now properly scrollable

### Changed
- **Settings window** enlarged from 500x600 to 620x700, now resizable with min size 520x500
- **Tab state** moved from `SettingsContent` to `SettingsModal` — content component is now a pure renderer
- **Insights layout** changed from 2-column grid to vertical stack for better scrolling

## [0.2.0] - 2026-02-06
Security hardening & architecture refactor

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
First release

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
| 0.4.2 | 2026-02-09 | Help/X/Discord links in settings footer, updated support/contact links |
| 0.4.1 | 2026-02-09 | Link shortcuts (`Cmd+K`/`Cmd+L`), stronger link navigation control, robust image drag/drop and reopen, last-note reopen fixes |
| 0.4.0 | 2026-02-08 | Vim mode, highlighting, collapsible headings, wiki-links, link popover, image handling, themes |
| 0.3.3 | 2026-02-07 | Built-in auto-updater, version display in settings |
| 0.3.2 | 2026-02-07 | Fix double tray icon, menu bar icon, Ctrl/Cmd shortcuts, clickable links |
| 0.3.0 | 2026-02-06 | On-device AI (semantic search, folder suggestions, embeddings), git sharing, settings redesign |
| 0.2.0 | 2026-02-06 | Security hardening, performance index, architecture refactor |
| 0.1.0 | 2026-02-05 | Initial release - core capture, search, manager |

[Unreleased]: https://github.com/0xMassi/stik_app/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/0xMassi/stik_app/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/0xMassi/stik_app/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/0xMassi/stik_app/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/0xMassi/stik_app/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/0xMassi/stik_app/compare/v0.3.1...v0.3.2
[0.3.0]: https://github.com/0xMassi/stik_app/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/0xMassi/stik_app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/0xMassi/stik_app/releases/tag/v0.1.0
