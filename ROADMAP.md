# Roadmap

> Current version: 0.5.0

---

## Phase 1 — Core Capture (v0.1.0) ✅

- [x] Global shortcut to summon floating post-it window
- [x] Type, close, note saved as markdown in `~/Documents/Stik/`
- [x] Folder organization (Inbox, Work, Ideas, Personal, Projects)
- [x] Search modal with highlighted matches
- [x] Manager modal (browse, delete, rename, move notes)
- [x] Pin notes as floating sticky notes on desktop
- [x] Configurable shortcuts for every action
- [x] Rich text editing with markdown support (Tiptap)
- [x] System tray with quick actions

## Phase 2 — Stability & Security (v0.2.0) ✅

- [x] In-memory note index for fast search
- [x] On-demand content loading (lightweight IPC)
- [x] Versioned JSON storage with auto-migration
- [x] Path traversal validation
- [x] Content Security Policy for webview
- [x] Scoped filesystem permissions
- [x] Atomic file writes (prevent data corruption)
- [x] Mutex recovery (prevent crashes)
- [x] Architecture refactor (split main.rs into focused modules)

## Phase 3 — On-Device AI & Sharing (v0.3.0) ✅

- [x] DarwinKit sidecar — Swift CLI exposing Apple NaturalLanguage framework
- [x] Semantic search (hybrid text + vector similarity with badges)
- [x] AI folder suggestions based on note content
- [x] Language-aware embeddings (per-language vector spaces)
- [x] Git-based folder sharing (background auto-sync)
- [x] Capture streak (consecutive-day counter)
- [x] "On This Day" resurfacing (daily notification from past years)
- [x] Share as clipboard (rich text, markdown, or image)
- [x] Settings redesign (Raycast-style tab layout)

## Phase 4 — Polish & Power Features (v0.4.x) ✅

- [x] Vim mode
- [x] Wiki-links between notes
- [x] Folder colors
- [x] Custom keyboard shortcuts
- [x] Folder-scoped search

## Phase 5 — Power Capture (v0.5.0)

- [ ] Voice capture via global shortcut (push-to-talk, on-device transcription via Apple Speech)
- [ ] Screenshot OCR capture (select screen region → extract text → save as note)
- [ ] Capture from any app (highlight text anywhere → shortcut → note with source URL)
- [ ] Inline slash commands (`/date`, `/todo`, `/tag`, `/divider`)
- [ ] Note templates (daily note, meeting, idea, custom)
- [ ] Inline tags (`#tag`) with tag-based filtering and search
- [ ] Shelf mode (temporary notes that auto-archive after X days if not saved)

## Phase 6 — Knowledge Graph (v0.6.0)

- [ ] Backlinks panel ("notes linking to this note")
- [ ] Graph view of note connections (wiki-links visualization)
- [ ] Daily digest notification (AI summary of captured thoughts)
- [ ] Smart resurfacing (context-aware suggestions, not just "On This Day")
- [ ] Apple Foundation Models integration (on-device LLM for summarization, auto-tagging, note cleanup)

## Phase 7 — Ecosystem (v0.7.0)

- [ ] Raycast extension (capture to Stik from Raycast)
- [ ] CLI/API for scripting (`stik capture "text"` from terminal)
- [ ] PKM integration (folder aliasing to Obsidian vaults, Logseq, etc.)
- [ ] Export rules (trigger-based actions on note save)
- [ ] Alfred extension

## Phase 8 — Mobile & Sync (v1.0)

- [ ] iOS companion app (capture + read, via iCloud initially)
- [ ] E2E encrypted cloud sync (optional, paid — S3 + Cognito + KMS)
- [ ] Cross-device conflict resolution
- [ ] Zero-knowledge architecture (AWS as encrypted storage, keys never leave device)

---

## Guiding Principles

- **Local-first** — Your notes are markdown files on your machine. No cloud required.
- **Privacy by design** — All AI features run on-device via Apple frameworks. Nothing leaves your Mac.
- **Open source** — Every line of code is auditable. MIT licensed.
- **Free forever** — The full app is free and open source. Optional paid sync for those who want it. No lock-in, ever.
- **Fast and simple** — Sub-second capture. Keyboard-driven. Stay out of the way.

---

*Last updated: February 12, 2026*
