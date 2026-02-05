# Changelog

All notable changes to Stik will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
| 0.1.0 | 2026-02-05 | Initial release - core capture, search, manager |

[Unreleased]: https://github.com/YOUR_USERNAME/stik/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR_USERNAME/stik/releases/tag/v0.1.0
