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

- [ ] iOS companion app (capture + read, via iCloud initially) — in progress
- [ ] E2E encrypted cloud sync (optional, paid)
- [ ] Cross-device conflict resolution
- [ ] Zero-knowledge architecture
- [ ] Android companion — see [Discussion #68](https://github.com/0xMassi/stik_app/discussions/68)

---

## v0.9 — Hardening

Stik is at the point where feature velocity is outrunning its safety net. This
phase is deliberately unglamorous: it exists so 1.0 can be trusted.

### Blocking for 0.9

- [ ] **CI on pull requests.** `release.yml` only fires on `v*` tags, so nothing
      runs `cargo test` / `npm test` on a PR or on a push to `main`. Every
      Dependabot PR merges with "no checks reported" and regressions are only
      caught by hand. This is the single highest-value fix in the repo.
- [ ] **`.github/dependabot.yml`.** Only *security* updates arrive today
      (GitHub's default). Routine version updates are never proposed, so the
      dependency tree drifts until an advisory forces a jump.
- [ ] **Finish the i18n migration.** ~190 strings are still hardcoded English,
      ~133 of them in `SettingsContent.tsx`. The foundation shipped; the
      settings surface — the part a non-English speaker most needs — has not.
- [ ] **Translate backend-generated strings.** Capture-streak labels and
      "On This Day" messages are formatted in `stats.rs` / `on_this_day.rs` and
      reach the UI pre-rendered in English. They need to return structured data
      (counts, dates) and let the frontend format.

### Test coverage

Current: 100 frontend tests, 62 Rust tests — but concentrated in pure helpers.

- [ ] **No component tests exist.** All 24 frontend test files cover
      `utils/` and `extensions/`. `PostIt`, `CommandPalette` and `SettingsContent`
      — where the real behaviour lives — have none.
- [ ] **13 of 23 Rust command modules have no tests**, including
      `storage.rs` and `versioning.rs` (data integrity), `icloud.rs` (sync
      correctness) and `embeddings.rs`. A migration bug here silently corrupts
      user notes.
- [ ] **No window-behaviour smoke test.** The v0.9 tauri bump moved
      wry / tao / tray-icon a full minor each; `cargo test` proved nothing about
      window creation, vibrancy, or the tray. A scripted launch-and-assert would
      have.

### Security & privacy

- [ ] **Tighten CSP `img-src`.** It currently allows `https:` and `http:`
      wholesale, so a remote image URL pasted into a note silently fetches on
      render — leaking the reader's IP and enabling tracking pixels. For a
      privacy-first, local-first app this is the sharpest inconsistency in the
      codebase. Consider proxying remote images through the backend, or
      requiring explicit per-note opt-in.
- [ ] **Audit panic surface.** 15 `unwrap()` and 18 `expect()` outside tests.
      In a Tauri command a panic takes down the webview, not just the call.
- [ ] **Review 9 `unsafe` blocks** (objc2 / AppKit interop) and document the
      invariant each one relies on.
- [ ] Accepted, not actionable: `rand 0.7.3` (RUSTSEC low) arrives via
      `phf_generator`, build-time only, and the advisory requires a custom
      runtime logger.

### Architecture

- [ ] **`SettingsContent.tsx` is 3,069 lines** and `PostIt.tsx` is 2,065.
      Both are past the point of comfortable review; splitting settings into
      per-tab modules would also make the i18n migration tractable.
- [ ] **`main.rs` has grown to 737 lines**, having been refactored down to a
      thin orchestrator in Phase 2. The command registry and setup hook are the
      bulk — worth re-splitting before it accretes further.
- [ ] **Frontend ships a 1.19 MB chunk** (378 kB gzipped) with no code
      splitting. Each of the five window types loads the whole bundle,
      including CodeMirror language modes it will never use — directly at odds
      with the sub-second-capture promise.

### Repo hygiene

- [ ] Delete merged branches — 7 stale refs on `origin`.
- [ ] `feature/apple-notes-import` exists **only locally** with 2 unpushed
      commits (direct Apple Notes SQLite read/write). It is one disk failure
      from being lost — push it or fold it in.

---

## Guiding Principles

- **Local-first** — Your notes are markdown files on your machine. No cloud required.
- **Privacy by design** — All AI features run on-device via Apple frameworks. Nothing leaves your Mac.
- **Open source** — Every line of code is auditable. MIT licensed.
- **Free forever** — The full app is free and open source. Optional paid sync for those who want it. No lock-in, ever.
- **Fast and simple** — Sub-second capture. Keyboard-driven. Stay out of the way.

---

*Last updated: July 29, 2026*
