# Complexity audit and cleanup — 2026-09-05

Base: local `develop` at `e6f60f6`. Cleanup branch: `codex/slop-cleanup`.
Implementation commits: `0386a18` (frontend cleanup) and `30c59c5` (dependency removal).

## Scope and method

Inspected the frontend import graph starting at `src/main.tsx`, including literal dynamic imports; runtime package declarations; utility exports and their callers/tests; editor callback wiring; the Rust dependency graph, library exports and Tauri command registration; contribution instructions, build scripts, CI configuration, and current documentation. Read changed modules and relevant callers before editing. Searched source, configuration, and documentation for each deleted name. The frontend has no package exports or dynamic module discovery exposing the deleted helpers.

This is a focused complexity audit, not an exhaustive correctness or security review of every source line. Detailed behavioral review concentrated on the changed frontend paths. DarwinKit was checked at its pinned submodule revision and tested, but its internals were not audited. No native window/VoiceOver, iCloud, dictation, or release-packaging acceptance run was performed for this cleanup.

The primary `main` checkout contained existing uncommitted editor/folder work. Work took place in a separate worktree from the clean local `develop`. A fresh fetch found no new changes to the known secondary branches; the font fix and Dependabot parser update were already represented in the base. No remote writes were performed.

## Implemented findings

| Finding and evidence | Change and preserved behavior |
| --- | --- |
| **Unused Rust development dependency:** `cargo tree -i glib@0.21.5` showed only Stik's development edge, and no code imports it. The older `glib@0.18.5` remains a separate GTK/Tauri dependency; adding the newer dev dependency never replaced it. | Removed the direct dev dependency and its eight exclusive lockfile packages. No retained package versions changed. The advisory policy is unchanged. |
| **Inactive notification dependency:** Sonner was imported only to mount a `Toaster`; no caller invoked Sonner's notification API. Existing notifications use `ActionToast` and local toast components. | Removed Sonner and `GlobalOverlays`; the root lazy-loads `CommandMenu` directly inside the existing `Suspense` and theme boundary. Active notifications and their accessibility behavior are unchanged. |
| **Unused JavaScript shortcut plugin:** no frontend static/dynamic import, script, or configuration entry used `@tauri-apps/plugin-global-shortcut`. Global shortcuts are registered by Rust. | Removed the JavaScript package only. The Rust plugin, native command handlers, capabilities, and settings contracts remain. |
| **Redundant Vim callback adapter:** `createVimCommandCallbacks` wrapped already ref-backed callbacks; its `onCommandMode` result was never consumed by `registerVimCommands`. An adjacent normal-mode branch was empty. | Registered the two ref-backed callbacks directly, removed the unused callback and empty branch, and passed callbacks directly to `Vim.defineEx`. Save/close routing, current props after re-render, and mode notifications are exercised through the real editor. |
| **Disconnected legacy image conversion:** `normalizeImageLinksForMarkdown` was referenced only by its five tests. The active paste path calls `isImageUrl`; rendering uses CodeMirror block widgets. | Removed the unused converter and its tests. Kept URL/protocol validation, paste handling, remote-image privacy controls, image widgets, and their tests. |
| **Disconnected link shortcut helper:** only its own tests called `isLinkEditShortcut`. Its Cmd+L behavior is absent from the active editor, whose keymap binds `Mod-k`. | Removed the helper and its tests; added a mounted-editor test that turns a selected title into `[Stik](url)` through the actual keymap. |
| **Unused HTML escaping helper:** `escapeHtml` had no callers in the application graph or repository. | Removed only the unused export from `wikiLink.ts`; retained the active filename conversion and all rendering/URL validation code. |
| **Unconsumed error metadata:** every production caller used `errorMessage`; only a test consumed `normalizeAppError`'s code/detail/recoverable object. | Extract the displayed message directly from strings, JavaScript errors, or structured Tauri errors. Preserve trimming and fallback behavior. No backend error payload or recovery flow changed. |
| **Release-label wrapper chain:** the UI consumed only `channelLabel`; `channelFor` and `isPreRelease` supplied intermediate representations with duplicate tests. | Compute the label directly. Stable, beta/alpha/RC, build metadata, blank input, and empty prerelease identifiers retain their behavior. |
| **Redundant dynamic imports:** Vite reported that the window API was already statically bundled; App and settings handlers also dynamically imported APIs already available to them. | Use the loaded `getCurrentWindow` and `invoke` imports for closing windows and migration. Settings still flush pending saves before closing. Real window/component lazy boundaries remain. |

## Test removals and consolidation

| Previous tests | Behavior protected and remaining coverage |
| --- | --- |
| `vimCommandBridge.test.ts`, 3 tests | Two checked callback forwarding; one checked an unused command-mode callback. Replaced with four mounted-editor Ex-command cases (`wq`, `x`, `q`, `q!`) that verify current callbacks after re-render, plus a real Vim mode transition. Existing visual-arrow tests and command-bar key tests remain. |
| `linkShortcut.test.ts`, 4 tests | Checked Cmd/Ctrl+K, Cmd+L, and rejected combinations on a function the app never calls. The active `Mod-k` path is now exercised through CodeMirror with a selected document range. Existing formatting and shortcut-matching tests remain; the unused Cmd+L behavior was not added to the product. |
| `isImageUrl.test.ts`, 5 converter tests removed | Checked conversion of bare, signed/query-format, autolink, and Markdown image links, plus non-image preservation. That converter was not in any runtime path. All five active URL classifier tests remain, as do block-widget/privacy and image-path tests. |
| `appChannel.test.ts`, 8 tests consolidated into 5 | Kept all prior version cases at the UI-facing `channelLabel` boundary. Removed the intermediate-wrapper mirror test and redundant stable/beta label cases. Added a build-metadata case containing a dash. |
| `appError.test.ts`, structured-error assertion revised | Still verifies the visible message from structured Tauri errors. Removed assertions on metadata no runtime caller observes. Kept string/Error/unknown fallback checks and added blank, whitespace, and non-string message cases. |
| `Editor.placeholder.test.tsx` renamed to `Editor.test.tsx` | Both placeholder regression tests remain intact alongside the new editor integration cases. Removed the unused `screen` import and artificial `void screen` reference. |

No security, validation, data-recovery, accessibility, or concurrency regression suite was removed.

## Verification and measured effect

The initial frontend baseline passed **44 files / 189 tests**, and the Rust baseline passed **119 tests**. The new editor cases passed against the pre-refactor implementation and again after cleanup. A TypeScript error in the new test's Vim-state narrowing was found by the build and corrected before the final gate.

| Final check | Result |
| --- | --- |
| Clean install with npm 10.9.9 and `package-lock.json` | Pass; two removed packages, no added packages or retained-version changes |
| `bun run check:platform` | Pass; macOS 14 declarations consistent |
| `bun run build` | Pass; TypeScript and production Vite build |
| `bun run check:bundle` | Pass; entry **287,378 bytes**, budget 750,000 |
| `bun run test` | **42 files / 181 tests passed** |
| `swift test --package-path src-tauri/darwinkit` with the existing Swift scratch cache | **43 tests passed**, pinned revision `83ef481f2cbe2b69da4582aeb5d17ce852ec66c4` |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Pass |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --target aarch64-apple-darwin --locked --offline -- -D warnings` | Pass |
| `cargo test --manifest-path src-tauri/Cargo.toml --all-features --target aarch64-apple-darwin --locked --offline` | **119 tests passed** |
| Live `npm audit --audit-level=high` using npm 10.9.9 | **0 vulnerabilities** |
| `cargo audit --file src-tauri/Cargo.lock` | **0 vulnerability entries**; 18 unmaintained and 2 unsound warnings remain |
| `cargo deny --manifest-path src-tauri/Cargo.toml check advisories` | Pass under the unchanged policy |
| `git diff --check` | Pass |

Dependency operations used the repository's pinned npm 10.9.9. Existing scripts were invoked with `bun run`, as requested; the installed Bun was 1.4.0. Scripts retained their Node/Vitest runtime. This was not a package-manager migration, and no Bun lockfile or Bun test runner was introduced.

The deferred overlay module changed from **87,273 to 53,176 bytes** (gzip **27,357 to 18,208**). Total emitted JavaScript fell from **2,423,143 to 2,387,060 bytes**. These are build-artifact measurements, not a measured startup-latency claim. The base artifact filenames matched the clean baseline build. Removing the redundant dynamic imports also eliminated that Vite warning.

## Retained and uncertain findings

- **`codemirror` umbrella dependency:** no direct import, but it currently supplies explicitly imported CodeMirror packages transitively. Removing it safely needs a separate dependency-declaration correction; it is not an isolated unused-package deletion.
- **Rust clipboard helpers/IPC:** `read_clipboard_text` is marked as future use and has no internal caller, but `lib.rs` re-exports the command modules. `build_clipboard_payload` is also a registered Tauri command despite no current frontend call. Retained both because local reference counts do not settle those exported contracts.
- **Shortcut reservation helper:** `getSystemShortcutValues` has only test callers while settings computes values inline. Connecting or removing it requires reviewing the reservation behavior across both recorders; its cleared-shortcut regression tests remain.
- **Small boundaries:** retained `Dialog`, `LiveRegion`, `ActionToast`, `latestRequest`, and the coalesced save runner. They protect focus/accessibility, async ordering, or persistence rather than merely forwarding calls.
- **Parallel toast implementations:** have different durations, placement, severity styling, and actions. Consolidating them would change UX or require more configuration, so this pass leaves them intact.
- **Large settings/editor components and image-language chunk:** size alone is not evidence of unnecessary behavior. The existing roughly 794 KB lazy editor chunk still triggers Vite's size warning. A larger redesign or profiling exercise is outside this cleanup.
- **CI follow-up:** `.github/workflows/ci.yml` checks out the Swift job without requesting submodules, but DarwinKit is a gitlink. The local run explicitly initialized it. This is a pre-existing clean-runner concern; no remote CI run was triggered or claimed as passing here.
- **Historical documents:** old audit plans/changelog entries remain historical records. In particular, the old claim that a newer direct `glib` dev dependency fixed the separate GTK graph is contradicted by the current dependency tree, as recorded above.

The primary checkout's existing work and the clean `develop` branch are preserved. The cleanup is committed separately for review and integration.
