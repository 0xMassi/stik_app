# Roadmap

> Current version: **0.8.0**

Stik ships when a phase is useful, not when it is complete. Items are moved to
✅ only when they are on `main` and released — not when a branch exists.

---

## Shipped

### Phase 1 — Core Capture (v0.1.0) ✅

- [x] Global shortcut to summon floating post-it window
- [x] Type, close, note saved as markdown in `~/Documents/Stik/`
- [x] Folder organization (Inbox, Work, Ideas, Personal, Projects)
- [x] Search modal with highlighted matches
- [x] Manager modal (browse, delete, rename, move notes)
- [x] Pin notes as floating sticky notes on desktop
- [x] Configurable shortcuts for every action
- [x] Rich text editing with markdown support
- [x] System tray with quick actions

### Phase 2 — Stability & Security (v0.2.0) ✅

- [x] In-memory note index for fast search
- [x] On-demand content loading (lightweight IPC)
- [x] Versioned JSON storage with auto-migration
- [x] Path traversal validation
- [x] Content Security Policy for webview
- [x] Scoped filesystem permissions
- [x] Atomic file writes (prevent data corruption)
- [x] Mutex recovery (prevent crashes)
- [x] Architecture refactor (split `main.rs` into focused modules)

### Phase 3 — On-Device AI & Sharing (v0.3.0) ✅

- [x] DarwinKit sidecar — Swift CLI exposing Apple NaturalLanguage framework
- [x] Semantic search (hybrid text + vector similarity with badges)
- [x] AI folder suggestions based on note content
- [x] Language-aware embeddings (per-language vector spaces)
- [x] Git-based folder sharing (background auto-sync)
- [x] Capture streak (consecutive-day counter)
- [x] "On This Day" resurfacing
- [x] Share as clipboard (rich text, markdown, or image)
- [x] Settings redesign (Raycast-style tab layout)

### Phase 4 — Polish & Power Features (v0.4.x) ✅

- [x] Vim mode
- [x] Wiki-links between notes
- [x] Folder colors
- [x] Custom keyboard shortcuts
- [x] Folder-scoped search

### Phase 5 — Power Capture (v0.5.0 – v0.8.0) — partially shipped

- [x] Note templates (daily note, meeting, idea, custom)
- [x] Inline slash commands (`/date`, `/todo`, `/tag`, `/divider`)
- [x] Voice capture via global shortcut (`⌘⇧D`, on-device WhisperKit) — v0.8.0
- [x] Capture from any app — clip capture `⌘⇧C` via Accessibility API — v0.8.0
- [x] Note locking (AES-256-GCM + Touch ID) — v0.7.6
- [x] iCloud Drive sync — v0.7.6
- [x] Local file watching / external change detection — v0.7.9
- [ ] **Screenshot OCR capture** (select region → extract text → note) — not started
- [ ] **Inline tags** (`#tag`) with tag-based filtering and search — not started
- [ ] **Shelf mode** (temporary notes that auto-archive after X days) — not started

### Phase 6 — Knowledge Graph — started early

- [x] Apple Foundation Models integration (on-device LLM: rephrase, summarize, organize)
- [ ] Backlinks panel ("notes linking to this note")
- [ ] Graph view of note connections (wiki-links visualization)
- [ ] Daily digest notification (AI summary of captured thoughts)
- [ ] Smart resurfacing (context-aware, not just "On This Day")

### Phase 7 — Ecosystem

- [x] Raycast extension (`0xMassi/stik-raycast`)
- [x] Internationalization foundation + Simplified Chinese (v0.9.0-dev)
- [ ] CLI/API for scripting (`stik capture "text"`)
- [ ] PKM integration (folder aliasing to Obsidian vaults, Logseq)
- [ ] Export rules (trigger-based actions on note save)
- [ ] Alfred extension

### Phase 8 — Mobile & Sync (v1.0)

Planned in detail in [MOBILE_PLAN.md](MOBILE_PLAN.md). Desktop, iOS, Android
and cloud sync ship together as 1.0.

**One React Native app for both platforms**
- [ ] `@stik/tokens` — design tokens extracted from `src/themes`, consumed by
      desktop, the editor bundle, and NativeWind
- [ ] Expo bare project with NativeWind + react-native-reusables (the
      shadcn/ui port for React Native)
- [ ] Filename contract ported to TypeScript, tested for parity with `notes.rs`
- [ ] Capture screen, note list, folder navigation
- [ ] Existing CodeMirror `WebEditor` bundle hosted in a WebView

**Platform surfaces**
- [ ] iPhone Action button — Swift native module reusing the scaffold's
      `QuickCaptureIntent`; App Intents are Swift on any stack
- [ ] iOS iCloud Drive module; Android Storage Access Framework module
- [ ] Android share target and quick-settings tile

**Stik Cloud — the critical path, roughly 3x the app work**
- [ ] Auth and account
- [ ] E2E envelope: Argon2id, per-note keys, recovery key. Zero-knowledge, so
      no password reset exists by design
- [ ] Sync engine with version vectors and conflict copies
- [ ] €4.99/mo — Apple takes 15% under the Small Business Program
- [ ] IAP on both stores, Stripe on desktop
- [ ] Behind a feature flag from day one, so an unfinished backend never
      blocks shipping app binaries

---

## Guiding Principles

- **Local-first** — Your notes are markdown files on your machine. No cloud required.
- **Privacy by design** — All AI features run on-device via Apple frameworks. Nothing leaves your Mac.
- **Open source** — Every line of code is auditable. MIT licensed.
- **Free forever** — The full app is free and open source. Optional paid sync for those who want it. No lock-in, ever.
- **Fast and simple** — Sub-second capture. Keyboard-driven. Stay out of the way.

---

*Last updated: July 29, 2026*
