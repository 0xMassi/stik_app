# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Stik?

Stik is a macOS menu bar app for instant thought capture. Global keyboard shortcuts summon a frameless post-it window, you type, close it, and notes are saved as markdown files in `~/Documents/Stik/`. Built with Tauri 2.0 (Rust backend + React frontend).

## Build & Development Commands

```bash
npm run tauri dev       # Full dev mode (Vite on :1420 + Tauri window, hot reload)
npm run tauri build     # Production build (.app bundle)
npm run build           # TypeScript check + Vite build (frontend only)
cd src-tauri && cargo check   # Check Rust code without building
cd src-tauri && cargo fmt     # Format Rust code
```

**Release process** (updates package.json, Cargo.toml, CHANGELOG.md, creates git tag):
```bash
npm run release:patch   # 0.1.0 -> 0.1.1
npm run release:minor   # 0.1.0 -> 0.2.0
npm run release:major   # 0.1.0 -> 1.0.0
```

No test framework is configured. No ESLint/Prettier config exists. TypeScript strict mode is enabled.

## Architecture

### Frontend → Backend Communication

React components call Rust via `invoke("command_name", { args })` from `@tauri-apps/api/core`. Rust emits events to React via `app.emit("event-name", payload)`, listened to with `listen("event-name", callback)` from `@tauri-apps/api/event`.

### Multi-Window System

The app uses a single `index.html` entry point with URL query parameters for routing. `App.tsx` reads `?window=<type>` and renders the appropriate component. Window types: `postit` (default/capture), `sticked`, `search`, `folder-selector`, `manager`, `settings`.

Singleton windows (search, manager, settings, folder-selector) are reused if already open. Sticked note windows are multi-instance, identified by UUID in the URL (`?window=sticked&id=<uuid>`).

### Rust Backend (`src-tauri/src/`)

- **`main.rs`** (~780 lines) — App setup, system tray, global shortcut registration, window creation/management. All window lifecycle logic lives here.
- **`commands/`** — Tauri IPC command handlers:
  - `notes.rs` — CRUD for markdown files (save, list, search, delete, move)
  - `folders.rs` — Folder management (list, create, delete, rename). "Inbox" folder is protected from deletion/rename.
  - `settings.rs` — Read/write settings from `~/.stik/settings.json`
  - `sticked_notes.rs` — Pinned notes persisted in `~/.stik/sticked_notes.json`

### React Frontend (`src/`)

- **`App.tsx`** — Window type router + IPC event listener hub
- **`PostIt.tsx`** — Main capture UI. Operates in three modes: capture (new note), sticked (pinned/editable), viewing (read-only). Has inline folder picker triggered by `/` key.
- **`SearchModal.tsx`** — Debounced search with keyboard navigation
- **`ManagerModal.tsx`** — Folder tree with note list, supports CRUD
- **`SettingsModal.tsx`** — Shortcut configuration with `ShortcutRecorder` component
- **`Editor.tsx`** — Tiptap rich text editor wrapper (markdown support via StarterKit)

### Data Storage

Notes: `~/Documents/Stik/<FolderName>/YYYYMMDD-HHMMSS-slug.md`
Settings: `~/.stik/settings.json` (shortcut mappings + default folder)
Pinned notes: `~/.stik/sticked_notes.json` (position, size, content, metadata)

### Styling

Tailwind CSS with a custom theme defined in `tailwind.config.ts`. Key design tokens:
- Brand color: `coral` (#E8705F)
- Background: `bg` (#FFFCF9)
- Text: `ink` (#1A1A1A), `stone` (#7A7A7A)
- Border radius default: 14px
- All windows are frameless and transparent (styled entirely by CSS)

Global styles and animations are in `src/styles/globals.css`.

## Key Patterns to Follow

- **No global state library** — Components use local `useState`. Persistent data lives in Rust and is fetched via `invoke()`. Inter-window communication uses Tauri events.
- **IPC commands return `Result<T, String>`** — All Rust commands use string errors. Frontend handles errors from `invoke()` catches.
- **Window auto-hide on blur** — Most windows listen for `WindowEvent::Focused(false)` in Rust to auto-hide when focus is lost.
- **Path alias** — `@/*` maps to `src/*` (configured in both tsconfig.json and vite.config.ts).
- **macOS-only** — The app uses `macos-private-api` Tauri feature and assumes macOS throughout (Accessibility permissions, system tray, etc.).

## Prerequisites

macOS, Xcode Command Line Tools, Rust 1.70+, Node.js 18+. First launch requires Accessibility permissions for global shortcuts.
