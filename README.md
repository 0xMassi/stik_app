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
| `Cmd+Shift+F` | Select folder, then capture |
| `Cmd+Shift+P` | Search all notes |
| `Cmd+Shift+M` | Manage notes & folders |
| `Cmd+Shift+,` | Open settings |

### In Search (`Cmd+Shift+P`)
| Shortcut | Action |
|----------|--------|
| `Backspace` | Delete selected note |
| `Cmd+M` | Move note to folder |

### In Folder Selector (`Cmd+Shift+F`)
| Shortcut | Action |
|----------|--------|
| `Backspace` | Delete selected folder |
| `Cmd+R` | Rename folder |

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
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── PostIt.tsx      # Main capture interface
│   │   ├── SearchModal.tsx # Search interface
│   │   ├── ManagerModal.tsx# File browser
│   │   └── ...
│   └── App.tsx             # App router
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # App entry, shortcuts, windows
│   │   └── commands/       # Tauri commands
│   │       ├── notes.rs    # Note CRUD operations
│   │       ├── folders.rs  # Folder management
│   │       └── ...
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

Settings are stored in the Tauri app data directory.

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

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Tiptap (editor)
- **Backend**: Rust, Tauri 2.0
- **Storage**: Local filesystem (markdown files)

## Known Issues

- First launch may require granting Accessibility permissions for global shortcuts
- Window may briefly flash on first shortcut press

## License

MIT

---

Made with minimal distractions in mind.
