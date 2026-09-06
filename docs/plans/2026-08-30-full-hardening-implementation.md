# Stik Full Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the actionable security, privacy, data-integrity, performance, accessibility, maintainability, and delivery findings in the 2026-08-30 full-application audit and produce a locally runnable macOS build.

**Architecture:** Centralize filesystem authorization and recoverable storage behavior in Rust; make privacy state explicit and safe by default; keep capture eager while loading other windows and background services lazily; use reusable accessible UI primitives; enforce the resulting invariants in tests and CI.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/Testing Library, Tauri 2, Rust, Swift/DarwinKit, macOS Security framework, GitHub Actions.

---

## Execution rules

- Work only in `/Users/massimianiv/.config/superpowers/worktrees/stik_app/full-hardening` on `codex/full-hardening`.
- Preserve the original checkout and its uncommitted files.
- For every production behavior, write one focused failing test and observe the expected failure before implementation.
- Commit after each task with only that task's files.
- Run targeted tests during red-green cycles and the full relevant suite before each commit.
- Do not change GitHub branch protection, close issues, publish releases, or push without explicit authorization after local verification.

### Task 1: Finish WIP integration and establish a green baseline

**Files:**
- Modify: `src/components/EditorWindow.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: every locale under `src/i18n/locales/*.ts`
- Test: `src/i18n/noUntranslatedText.test.ts`

**Steps:**
1. Use the already-failing untranslated-text test as RED and record its six EditorWindow labels.
2. Add typed translation keys and replace the literals with `t()` calls.
3. Run `npm test -- src/i18n/noUntranslatedText.test.ts` and confirm GREEN.
4. Run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
5. Commit `fix(editor): integrate nested editor on develop`.

### Task 2: Eliminate asset and folder path traversal

**Files:**
- Create: `src-tauri/src/commands/path_security.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/notes.rs`
- Modify: `src-tauri/src/commands/folders.rs`
- Test: inline Rust tests in `path_security.rs` and `notes.rs`

**Steps:**
1. Write failing tests rejecting `.assets/../../outside`, separators, absolute paths, dot components, non-generated extensions, and symlink escapes while accepting generated UUID image filenames.
2. Run the targeted Rust tests and confirm failures expose current permissive behavior.
3. Implement `validate_asset_filename`, `canonical_path_within`, `authorize_existing_managed_note`, and `authorize_target_within`.
4. Route asset move/delete and remote-branch `move_note` target resolution through the helpers.
5. Keep asset parsing conservative: invalid references are ignored, never resolved.
6. Run targeted tests, then full Cargo tests and Clippy for touched targets.
7. Commit `fix(security): contain note and asset filesystem paths`.

### Task 3: Make deletion recoverable and asset ownership safe

**Files:**
- Create: `src-tauri/src/commands/trash.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/notes.rs`
- Modify: `src-tauri/src/main.rs` or library app builder command registration
- Modify: `src/types/index.ts`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/components/EditorWindow.tsx`
- Test: Rust trash tests and React undo/status tests

**Steps:**
1. Write failing Rust tests for trash metadata, collision-safe moves, restore to original nested path, and restore conflict without overwrite.
2. Implement `.trash` note entries and commands `trash_note`, `list_trashed_notes`, `restore_trashed_note`, and `purge_trashed_note`.
3. Change user-facing delete flows to trash notes; do not delete referenced assets during trash.
4. Write a failing frontend test for an Undo action/status after deletion.
5. Implement accessible Undo and a Trash view in the full editor with restore/permanent-delete confirmation.
6. Run targeted and full frontend/Rust tests.
7. Commit `feat(storage): add recoverable note trash and restore`.

### Task 4: Complete nested-folder semantics

**Files:**
- Modify: `src-tauri/src/commands/notes.rs`
- Modify: `src-tauri/src/commands/folders.rs`
- Modify: `src-tauri/src/commands/embeddings.rs`
- Modify: `src-tauri/src/main.rs` or app library
- Modify: relevant frontend folder utilities/components
- Test: Rust nested-folder table tests and frontend folder tests

**Steps:**
1. Write failing tests for nested image save validation, recursive stats, distinct centroid identities, and full relative folder paths for Finder-opened notes.
2. Replace remaining single-name validation with canonical relative-folder validation.
3. Make stats recursive and define whether parent counts include descendants; expose both direct and total counts if UI needs both.
4. Compute embedding folder identity relative to the configured notes root.
5. Return the complete relative parent path for opened notes.
6. Run all targeted/full tests and commit `fix(folders): make nested paths consistent end to end`.

### Task 5: Make analytics genuinely opt-in

**Files:**
- Modify: `src-tauri/src/commands/analytics.rs`
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src/components/AnalyticsNotice.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/SettingsContent.tsx`
- Modify: `src/types/index.ts`
- Modify: locale catalogs
- Test: Rust analytics-state/settings tests and `AnalyticsNotice.test.tsx`

**Steps:**
1. Write failing tests proving defaults are disabled, no ID is created while disabled, enable is runtime-effective, and disable removes the ID.
2. Replace immutable startup-only enable state with an atomic/runtime configuration API.
3. Create the ID lazily only when an opted-in event is sent.
4. Add explicit Enable and No thanks actions to the first-run dialog and save consent before enabling.
5. Make the Settings privacy toggle update runtime state and provide Reset analytics identifier.
6. Run tests and commit `fix(privacy): require analytics opt in before tracking`.

### Task 6: Move note keys to Keychain and authorize lock paths

**Files:**
- Modify: `src-tauri/src/commands/note_lock.rs`
- Reuse: `src-tauri/src/commands/path_security.rs`
- Test: note-lock key-store and path-authorization tests

**Steps:**
1. Extract a key-store interface and write failing tests using an in-memory implementation for create/read/migrate/failure behavior.
2. Implement the production store with `security-framework` generic passwords and a stable service/account name.
3. Migrate `~/.stik/note-key` only after Keychain read-back matches; then remove the legacy file.
4. Require managed-note authorization for lock, unlock, read, save, and status commands.
5. Run Cargo tests and commit `fix(security): protect locked-note keys with Keychain`.

### Task 7: Block unsolicited network images and support custom vault assets

**Files:**
- Modify: `src/extensions/cm-block-widgets.ts`
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src/types/index.ts`
- Modify: `src/components/SettingsContent.tsx`
- Modify: `src-tauri/src/main.rs` or app library
- Modify: locale catalogs
- Test: image widget/settings tests and Rust scope helper tests

**Steps:**
1. Write failing tests proving HTTP(S) images render a blocked placeholder by default and local/data images still render.
2. Add `load_remote_images` with a safe false default and an accessible privacy toggle.
3. Implement “Load once” per blocked image without persisting consent.
4. Add the selected custom notes directory recursively to `asset_protocol_scope` at startup and when settings change.
5. Run frontend/Rust tests and commit `fix(privacy): block remote note images by default`.

### Task 8: Remove search disk scans and stale-result races

**Files:**
- Modify: `src-tauri/src/commands/index.rs`
- Modify: `src/components/CommandPalette.tsx`
- Create: `src/utils/latestRequest.ts`
- Test: Rust index tests and `src/utils/latestRequest.test.ts`

**Steps:**
1. Write failing Rust tests showing a full-content match remains searchable after the indexed source file is unavailable and updates replace cached text.
2. Store normalized searchable text beside private index state, not in serialized `NoteEntry` responses.
3. Search only in-memory data; keep locked content absent.
4. Write a failing TypeScript test where request 1 resolves after request 2 and is rejected as stale.
5. Gate Command Palette state commits with the latest request generation and clear searching state only for the latest request.
6. Add a deterministic large-corpus benchmark/smoke budget.
7. Run tests and commit `perf(search): index full text and discard stale results`.

### Task 9: Make capture startup and bundles minimal

**Files:**
- Modify: `src/App.tsx`
- Modify: `src-tauri/src/main.rs` and/or `src-tauri/src/lib.rs`
- Modify: `vite.config.ts`
- Create: bundle-budget script/test under `scripts/` or `src/utils/`
- Test: window routing/lazy-load tests and startup unit tests where feasible

**Steps:**
1. Write a failing bundle-budget check against the current 1.36 MB entry chunk.
2. Lazy-load Settings, Command Palette, Apple picker, analytics consent, and full editor after determining window type; keep PostIt eager.
3. Load broad CodeMirror language data only when requested by a fenced language.
4. Move full index build, analytics system-property collection, notifications, restored windows, updater, and sync initialization off the capture-ready path.
5. Add timing marks/events for shortcut received, window visible, editor ready, and first input.
6. Run build, record before/after chunk sizes, test dev startup, and commit `perf(startup): prioritize capture readiness and split windows`.

### Task 10: Establish accessible primitives and repair primary flows

**Files:**
- Create: `src/components/ui/Dialog.tsx`
- Create: `src/components/ui/LiveRegion.tsx`
- Modify: `ConfirmDialog.tsx`, `LockPrompt.tsx`, `AnalyticsNotice.tsx`, `DictationSetupModal.tsx`, `SettingsModal.tsx`
- Modify: `LinkPopover.tsx`, `EditorWindow.tsx`, `CommandPalette.tsx`, relevant icon buttons
- Modify: `src/styles/globals.css`
- Test: component tests for focus, dialog semantics, accessible names, live announcements, and keyboard behavior

**Steps:**
1. Write failing component tests for dialog role/name, initial safe focus, Tab containment, Escape, focus restoration, and no global Enter-to-confirm.
2. Implement the shared dialog primitive and migrate overlays.
3. Write failing tests for Link Popover labels/icon names, search status announcements, and keyboard-visible editor row actions.
4. Implement associated labels, `aria-label`, `role=status`, focus-visible styles, and at least 24×24 targets.
5. Add `prefers-reduced-motion` CSS and remove `transition-all` from touched components.
6. Run all frontend tests and commit `fix(a11y): make primary workflows keyboard and VoiceOver accessible`.

### Task 11: Add Vault Health and consistent user-visible errors

**Files:**
- Create: `src-tauri/src/commands/health.rs`
- Create: `src/components/VaultHealth.tsx`
- Create: `src/utils/appError.ts`
- Modify: Settings navigation/content and command registration
- Test: Rust health tests and React error/health component tests

**Steps:**
1. Write failing tests for health status of path access, index freshness, trash count, sync state, sidecar status, analytics mode, and pending recovery artifacts.
2. Implement a read-only health command with no destructive “auto-fix.”
3. Add a Settings health section with actionable retry/open-folder/export diagnostics actions.
4. Centralize frontend IPC error normalization and replace silent catches in primary user actions with accessible errors.
5. Run tests and commit `feat(diagnostics): add vault health and actionable errors`.

### Task 12: Remove duplicated Rust wiring and clean quality debt

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: Rust files reported by Clippy/format
- Test: full Rust suite

**Steps:**
1. Move the app builder/run orchestration into the library and reduce `main.rs` to a thin call.
2. Confirm command modules compile/test once rather than as parallel library/binary copies.
3. Run `cargo fmt --manifest-path src-tauri/Cargo.toml --all`.
4. Run Clippy with `-D warnings`, fix each finding without blanket allows, and rerun tests.
5. Commit `refactor(tauri): centralize app wiring and enforce lint`.

### Task 13: Upgrade dependencies and make CI enforce all stacks

**Files:**
- Modify: `package-lock.json`, `package.json` if required
- Modify: `src-tauri/Cargo.lock`, `src-tauri/Cargo.toml` if required
- Delete: `bun.lock`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/dependabot.yml`

**Steps:**
1. Record current `npm audit --json` and `cargo audit --json` failures.
2. Upgrade the smallest dependency sets that remove `nanoid` and vulnerable `quick-xml`; run full tests after each ecosystem update.
3. Remove the tracked Bun lockfile and Bun-uninstall workarounds; document npm as canonical.
4. Add Swift tests, formatting, Clippy, npm audit, Cargo audit/deny, and bundle budget to CI; remove advisory lint mode.
5. Run workflow-equivalent commands locally and commit `chore(ci): enforce full-stack quality and dependency safety`.

### Task 14: Align platform, documentation, and release automation

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `.github/workflows/release.yml`, `.github/workflows/beta.yml`
- Modify: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `CHANGELOG.md`
- Create: `scripts/build-dev.sh`
- Create: `docs/release-checklist.md`
- Test: shell syntax/static config tests where practical

**Steps:**
1. Write a config consistency test/script that fails while Tauri/Swift/Homebrew/docs disagree on macOS minimum.
2. Set macOS 14 consistently and update Homebrew syntax.
3. Correct telemetry, editor architecture, atomic-write, and current-delivery documentation.
4. Add a defensive dev script that builds the correct-arch DarwinKit sidecar, installs it under the target-triple name, and runs/builds Tauri.
5. Add the release checklist from the design.
6. Run config tests and `bash -n scripts/build-dev.sh`; commit `docs(release): align platform privacy and build instructions`.

### Task 15: Full verification and runnable application handoff

**Files:**
- Update: audit report with resolution status and any measured results

**Steps:**
1. Run `npm test` and `npm run build`.
2. Run `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`, strict Clippy, and Cargo tests.
3. Run `swift test`.
4. Run npm and Cargo audits and the bundle budget.
5. Run the dev build script to produce a debug/release `.app` as appropriate.
6. Launch the built app, verify the process/sidecar start, and capture logs without modifying real notes; use an isolated temporary notes directory if supported.
7. Inspect `git diff --check`, status, changed-file scope, and compare every audit action item against implementation evidence.
8. Update the report resolution matrix and commit `docs(audit): record hardening verification`.
9. Use the finishing-development-branch skill to present merge/push/PR options; do not publish without user choice.
