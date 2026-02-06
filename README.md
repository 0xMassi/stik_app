# Stik

**Instant thought capture for macOS.** One shortcut, post-it appears, type, gone.

Stik lives in your menu bar, always ready. Hit a shortcut, capture your thought, and get back to what you were doing. Notes are saved as markdown files in `~/Documents/Stik/`.

## Features

- **Instant Capture** - Global shortcuts to summon a post-it from anywhere
- **Folder Organization** - Organize notes into folders (Inbox, Work, Ideas, etc.)
- **Quick Search** - Find any note instantly with `Cmd+Shift+P`
- **Pin Notes** - Keep important notes floating on your desktop
- **File Manager** - Browse and manage all notes with `Cmd+Shift+M`
- **Markdown Files** - Your notes are plain `.md` files, no lock-in

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+S` | New note (default folder) |
| `Cmd+Shift+P` | Search all notes |
| `Cmd+Shift+M` | Manage notes & folders |
| `Cmd+Shift+,` | Open settings |

### In Search (`Cmd+Shift+P`)
| Shortcut | Action |
|----------|--------|
| `Backspace` | Delete selected note |
| `Cmd+M` | Move note to folder |

### In Manager (`Cmd+Shift+M`)
| Shortcut | Action |
|----------|--------|
| `Backspace` | Delete selected note/folder |
| `Cmd+R` | Rename folder |
| `Cmd+N` | Create new folder |

## Installation

### Quick Start (Recommended)

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/stik.git
cd stik

# Run the setup script
./setup.sh
```

The setup script will:
1. Check/install Xcode Command Line Tools
2. Check/install Rust
3. Install Node.js dependencies
4. Start the app in development mode

### Manual Installation

#### Prerequisites

- **macOS** (tested on macOS 13+)
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```
- **Rust** (1.70+)
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source ~/.cargo/env
  ```
- **Node.js** (18+)
  ```bash
  # Using Homebrew
  brew install node
  ```

#### Build & Run

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
stik/
├── src/                        # React frontend
│   ├── types/index.ts          # Shared TypeScript types
│   ├── components/
│   │   ├── PostIt.tsx           # Main capture interface
│   │   ├── Editor.tsx           # Tiptap rich text editor
│   │   ├── SearchModal.tsx      # Search interface
│   │   ├── ManagerModal.tsx     # File browser
│   │   ├── SettingsModal.tsx    # Settings window/dialog
│   │   └── SettingsContent.tsx  # Shared settings UI
│   └── App.tsx                  # Window type router
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── main.rs              # App orchestrator (~120 lines)
│   │   ├── state.rs             # AppState, ViewingNoteContent
│   │   ├── shortcuts.rs         # Global shortcut management
│   │   ├── windows.rs           # Window lifecycle
│   │   ├── tray.rs              # System tray setup
│   │   └── commands/
│   │       ├── notes.rs         # Note CRUD + on-demand content
│   │       ├── folders.rs       # Folder management + validation
│   │       ├── settings.rs      # Settings read/write
│   │       ├── sticked_notes.rs # Pinned note persistence
│   │       ├── index.rs         # In-memory note index
│   │       └── versioning.rs    # JSON versioning utilities
│   └── Cargo.toml
└── package.json
```

## Data Storage

Notes are stored as markdown files in:
```
~/Documents/Stik/
├── Inbox/
│   └── 20260205-143022-my-note-title.md
├── Work/
├── Ideas/
├── Personal/
└── Projects/
```

Settings and pinned notes are stored in `~/.stik/` as versioned JSON files.

## Sync Across Macs (No Account Needed)

Stik is local-first. Notes are plain markdown files in `~/Documents/Stik/`.
If your `Documents` folder is already synced, Stik syncs automatically with zero extra setup.

Supported sync setups:
- **iCloud Drive** (recommended)
- **Dropbox**
- **Syncthing**
- **Any service that syncs `~/Documents`**

For iCloud Drive, enable:
1. `System Settings > Apple ID > iCloud > iCloud Drive`
2. `Desktop & Documents Folders` on each Mac

No Stik account is required for sync.

## Development

```bash
# Start dev server with hot reload
npm run tauri dev

# Type check
npm run build

# Format Rust code
cd src-tauri && cargo fmt

# Check Rust code
cd src-tauri && cargo check
```

## Testing Capture Streak

Generate fixture notes for consecutive days:

```bash
./scripts/seed-streak-fixture.sh 5 Inbox
```

Then verify in either place:
- Stik menu bar tray menu: look for `Streak: N days`
- Stik Settings: open `Cmd+Shift+,` and check the `Capture Streak` section (use `Refresh`)

## Testing On This Day

Generate fixture notes on today's month/day for previous years:

```bash
./scripts/seed-on-this-day-fixture.sh 3 Inbox
```

Then open `Cmd+Shift+,` and use `On This Day -> Check now`.
You should get a result with date/folder/preview and a macOS notification.

## Testing Share as Clipboard

1. Open any note (capture or viewing window) with content.
2. Click the `Copy` button in the note header.
3. Paste into:
   - Notes/TextEdit to verify plain markdown text
   - Mail/Slack/editor with rich text to verify formatted output

## Releasing

We use [Semantic Versioning](https://semver.org/). To create a new release:

```bash
# Patch release (bug fixes): 0.1.0 -> 0.1.1
npm run release:patch

# Minor release (new features): 0.1.0 -> 0.2.0
npm run release:minor

# Major release (breaking changes): 0.1.0 -> 1.0.0
npm run release:major

# Or explicit version
npm run release 1.2.3
```

This will:
1. Update version in `package.json` and `Cargo.toml`
2. Update `CHANGELOG.md` with release date
3. Create a git commit and tag
4. Show next steps for pushing and building

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Tiptap (editor)
- **Backend**: Rust, Tauri 2.0
- **Storage**: Local filesystem (markdown files)

## Security

- Restrictive Content Security Policy (CSP) on the webview
- Filesystem access scoped to `~/Documents/Stik/` and `~/.stik/` only
- Path traversal validation on all folder/note names
- Inbox folder protected from deletion and rename

## Known Issues

- First launch requires granting Accessibility permissions for global shortcuts
- Window may briefly flash on first shortcut press

## License

MIT

---

Made with minimal distractions in mind.
