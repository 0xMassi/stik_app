# Roadmap

> Current version: 0.3.0

---

## Phase 1 -- Core Capture (v0.1.0)

- [x] Global shortcut to summon floating post-it window
- [x] Type, close, note saved as markdown in `~/Documents/Stik/`
- [x] Folder organization (Inbox, Work, Ideas, Personal, Projects)
- [x] Search modal with highlighted matches
- [x] Manager modal (browse, delete, rename, move notes)
- [x] Pin notes as floating sticky notes on desktop
- [x] Configurable shortcuts for every action
- [x] Rich text editing with markdown support (Tiptap)
- [x] System tray with quick actions

## Phase 2 -- Stability & Security (v0.2.0)

- [x] In-memory note index for fast search
- [x] On-demand content loading (lightweight IPC)
- [x] Versioned JSON storage with auto-migration
- [x] Path traversal validation
- [x] Content Security Policy for webview
- [x] Scoped filesystem permissions
- [x] Atomic file writes (prevent data corruption)
- [x] Mutex recovery (prevent crashes)
- [x] Architecture refactor (split main.rs into focused modules)

## Phase 3 -- On-Device AI & Sharing (v0.3.0)

- [x] DarwinKit sidecar -- Swift CLI exposing Apple NaturalLanguage framework
- [x] Semantic search (hybrid text + vector similarity with badges)
- [x] AI folder suggestions based on note content
- [x] Language-aware embeddings (per-language vector spaces)
- [x] Git-based folder sharing (background auto-sync)
- [x] Capture streak (consecutive-day counter)
- [x] "On This Day" resurfacing (daily notification from past years)
- [x] Share as clipboard (rich text, markdown, or image)
- [x] Settings redesign (Raycast-style tab layout)

## Phase 4 -- Voice & Vision

- [ ] Voice capture via global shortcut (push-to-talk, on-device transcription)
- [ ] Screenshot OCR capture (select region, extract text, save as note)
- [ ] Daily digest notification (summary of captured thoughts)
- [ ] Raycast extension (capture to Stik from Raycast)

## Phase 5 -- Ecosystem

- [ ] PKM integration (folder aliasing to Obsidian vaults, Logseq, etc.)
- [ ] Apple Foundation Models integration (on-device LLM for summarization, auto-tagging, note cleanup)
- [ ] Export rules (trigger-based actions on note save)
- [ ] iOS companion app (read-only, via iCloud)

---

## Guiding Principles

- **Local-first** -- Your notes are markdown files on your machine. No cloud required.
- **Privacy by design** -- All AI features run on-device via Apple frameworks. Nothing leaves your Mac.
- **Open source** -- Every line of code is auditable. MIT licensed.
- **No subscription** -- Free, forever. No accounts, no tracking, no lock-in.
- **Fast and simple** -- Sub-second capture. Keyboard-driven. Stay out of the way.
