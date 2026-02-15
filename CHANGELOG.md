# Changelog

All notable changes to Stik will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-02-14
Unified Command Palette, CodeMirror editor, interactive tables, and Apple Notes import

### Added
- **Unified Command Palette** — merged Search (`Cmd+Shift+P`) and Manager (`Cmd+Shift+M`) into a single two-pane window with folder sidebar + note list. Both shortcuts open the same palette
- **Sidebar position toggle** — switch Command Palette sidebar between left and right, persisted in settings
- **Inline note creation** — create notes directly from the Command Palette via the "New Note" footer button
- **CodeMirror 6 editor** — replaced Tiptap with CodeMirror for source-mode markdown editing with syntax highlighting, better performance, and extensibility
- **Interactive table widgets** — markdown tables render as editable rich widgets with Tab/Shift+Tab cell navigation, right-click context menu (insert/delete rows and columns), and keyboard exits (Escape, Enter from last row)
- **Horizontal rule widgets** — `---` renders as a styled divider line in the editor
- **Slash commands** — type `/` at line start for Notion/Raycast-style template insertion (headings, lists, code blocks, tables, templates)
- **Custom user templates** — define reusable slash command templates in Settings with `{{cursor}}`, `{{date}}`, `{{time}}`, `{{day}}` placeholders
- **Read-only Apple Notes import** — browse and import notes from Apple Notes via SQLite + protobuf parsing (#29)
- **Note template library** — built-in `/meeting`, `/standup`, `/journal`, `/brainstorm`, `/retro`, `/proscons`, `/weekly` templates with dynamic date insertion

### Changed
- **Editor engine** — migrated from Tiptap (ProseMirror) to CodeMirror 6 for native markdown source editing
- **Window consolidation** — `search` and `manager` windows replaced by single `command-palette` window
- **PostIt footer** — two separate search/manager buttons consolidated into single Command Palette button

### Fixed
- **Table cursor trap** — block-level table widgets at document end no longer trap the cursor; trailing newline auto-inserted
- **Tauri capability permissions** — `command-palette` window added to capability allow-list, fixing `event.emit` errors
- **Settings race condition** — centralized `saveAndEmitSettings` helper prevents concurrent settings mutations from overwriting each other

## [0.5.0] - 2026-02-11
Editor toolbar, font zoom, and quality-of-life fixes

### Added
- **Formatting toolbar** — bottom bar with quick-access buttons for heading (H1/H2/H3 dropdown), bold, italic, strikethrough, inline code, link, blockquote, bullet list, ordered list, task list, and highlight. Active state follows cursor position in real-time
- **Link button integration** — toolbar link button dispatches `Cmd+K` to open the existing LinkPopover editor, no separate prompt
- **Toolbar toggle** — show/hide formatting bar via footer button (T icon), persisted in localStorage. Auto-hidden in vim mode
- **Configurable font size** — `Cmd+`/`Cmd-` to zoom editor text (range 12-48px), `Cmd+0` to reset. Stepper in Settings > Editor. Headings and code scale proportionally
- **Root-level notes** — save notes directly to `~/Documents/Stik/` without requiring a folder. Shows "Stik" badge when no folder is set
- **Footer quick-access buttons** — search, manager, and settings buttons in the PostIt footer for all window types
- **Community standards** — added CONTRIBUTING.md, SECURITY.md, issue templates, and PR template

### Fixed
- **Image assets cleaned up on delete/move** — deleting a note removes its `.assets/` images; moving a note relocates them to the target folder
- **Editor content preserved on folder switch** — folder picker no longer clears typed content when switching folders
- **Stale index after folder delete** — NoteIndex and EmbeddingIndex entries are purged when a folder is deleted, preventing ghost notes in search
- **Highlight 1-char bug** — highlight button now requires a text selection (mark's `inclusive:false` caused stored marks to last only 1 character)
- **Image export hides chrome** — "Copy as image" now hides buttons, toolbar, and action bar, showing only the styled note content
- **Image export rounded corners** — screenshot clips to the PostIt's 14px border-radius instead of rectangular webview bounds
- **Toolbar horizontal scroll** — formatting bar scrolls horizontally on narrow windows with hidden scrollbar

### Changed
- **Settings-changed event on folder delete** — capture window re-resolves default folder after deletion

## [0.4.4] - 2026-02-10
Features, privacy, and search improvements

### Added
- **Hide dock icon** — tray-only mode via Settings > Editor
- **Folder colors** — assign colors to folders, reflected in search badges and folder picker
- **Customizable system shortcuts** — rebind Cmd+Shift+P/M/L/, in Settings > Shortcuts
- **Anonymous analytics** — privacy-respecting usage telemetry via PostHog (EU endpoint, opt-out in Settings > Privacy)
- **Analytics notice popup** — one-time "What's New" notice for existing users with opt-out path and community links
- **Privacy settings tab** — toggle analytics, view what's collected, copy anonymous device ID
- **Folder-scoped search** — filter search results by folder via popover in the search header (#23)

### Fixed
- **Viewing window left open after note deletion** — close viewing window when its note is deleted from another window (#19)
- **Disabled folder shortcuts persisting** — normalization now force-enables all visible shortcuts

## [0.4.3] - 2026-02-09
Stability fixes for link editing and settings

### Fixed
- **Escape behavior while editing links** — pressing `Esc` in the link edit popover now closes only the popover and returns focus to the note, without closing/saving the whole capture window
- **Settings side-effect folder recreation** — opening Settings no longer recreates deleted folders (including `Inbox`) during Git status checks

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
| 0.6.0 | 2026-02-14 | Unified Command Palette, CodeMirror 6 editor, interactive tables, slash commands, Apple Notes import |
| 0.5.0 | 2026-02-11 | Formatting toolbar, font zoom, root-level notes, image export cleanup, community standards |
| 0.4.4 | 2026-02-10 | Dock icon hiding, folder colors, custom shortcuts, anonymous analytics, folder-scoped search |
| 0.4.3 | 2026-02-09 | Escape handling in link popover fixed; opening Settings no longer recreates deleted folders |
| 0.4.2 | 2026-02-09 | Help/X/Discord links in settings footer, updated support/contact links |
| 0.4.1 | 2026-02-09 | Link shortcuts (`Cmd+K`/`Cmd+L`), stronger link navigation control, robust image drag/drop and reopen, last-note reopen fixes |
| 0.4.0 | 2026-02-08 | Vim mode, highlighting, collapsible headings, wiki-links, link popover, image handling, themes |
| 0.3.3 | 2026-02-07 | Built-in auto-updater, version display in settings |
| 0.3.2 | 2026-02-07 | Fix double tray icon, menu bar icon, Ctrl/Cmd shortcuts, clickable links |
| 0.3.0 | 2026-02-06 | On-device AI (semantic search, folder suggestions, embeddings), git sharing, settings redesign |
| 0.2.0 | 2026-02-06 | Security hardening, performance index, architecture refactor |
| 0.1.0 | 2026-02-05 | Initial release - core capture, search, manager |

[Unreleased]: https://github.com/0xMassi/stik_app/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/0xMassi/stik_app/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/0xMassi/stik_app/compare/v0.4.4...v0.5.0
[0.4.4]: https://github.com/0xMassi/stik_app/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/0xMassi/stik_app/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/0xMassi/stik_app/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/0xMassi/stik_app/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/0xMassi/stik_app/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/0xMassi/stik_app/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/0xMassi/stik_app/compare/v0.3.1...v0.3.2
[0.3.0]: https://github.com/0xMassi/stik_app/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/0xMassi/stik_app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/0xMassi/stik_app/releases/tag/v0.1.0
