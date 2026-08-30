# Stik full-application audit

**Audit date:** 2026-08-30  
**Repository:** [0xMassi/stik_app](https://github.com/0xMassi/stik_app)  
**Local snapshot:** `4c0f015` on `main`, one commit ahead and eight commits behind `origin/main`  
**Remote snapshots:** `origin/main` at `31a3d5c`; `origin/develop` at `b8086f2`

## Executive summary

Stik has a strong product core: instant capture, plain Markdown ownership, local-first storage, unusually broad native macOS integration, and a meaningful automated test base. The product is differentiated and the code shows care around editor behavior, poisoned mutex recovery, settings migrations, and on-device AI.

It is not ready for a new stable release without a hardening pass. The most urgent problem is a Markdown asset path-traversal flaw that can delete or move files outside Stik's `.assets` directories when a crafted or synced note is deleted or moved. There are also important trust problems: released builds enable analytics before consent while the README and security policy say there is no telemetry, and the app advertises macOS 10.15 support while the bundled Swift sidecar requires macOS 14.

Performance will degrade with vault size. Search can read every long note from disk for every debounced keystroke, the full note index is rebuilt synchronously during startup and periodically, and every Tauri window downloads/parses the same 1.27 MB JavaScript entry bundle. The resulting behavior is at odds with the product's promise of immediate capture.

The project is also carrying release/process debt. `develop` contains eight commits not yet on `main`, including atomic writes, CI, accessibility work, and fixes for six issues that remain open on GitHub. There are no open PRs, no required status checks on `main`, and `develop` is unprotected. Formatting and Clippy fail, Swift tests are absent from CI, and dependency audits found two Rust vulnerabilities plus one high-severity npm advisory.

### Recommended decision

Pause feature expansion for one hardening milestone. Fix the critical filesystem issue first, make analytics genuinely opt-in or correct the public promise, reconcile the minimum macOS version, promote the already-completed `develop` fixes, and make CI required. Then address search/startup performance and the accessibility baseline before adding larger features.

## Scope and method

This was a repository-grounded static and automated audit of the React/TypeScript frontend, Rust/Tauri backend, Swift DarwinKit sidecar, storage and sync paths, permissions/CSP, GitHub issues/PRs/releases/actions, dependencies, tests, and major UX flows.

The working tree already contained uncommitted nested-folder/editor work. It was preserved and reviewed as work in progress; no existing application code was changed. Findings are marked when they affect only the working tree, only `develop`, or the shipped/main code.

This audit did not include a signed-release installation matrix, a live VoiceOver session, a user study, adversarial fuzzing, or measured 1,000/10,000-note vault benchmarks. Those should be part of the hardening milestone.

## Priority overview

| Priority | Finding | Affected state | Recommended owner action |
|---|---|---|---|
| Critical | Crafted `.assets/` references can escape the asset folder and delete/move arbitrary user files | local, `main`, `develop`, stable | Patch immediately; add adversarial tests; consider a security advisory |
| P1 | Analytics is enabled before consent while public docs promise no telemetry | local, `main`, `develop`, stable | Default off; consent before ID/event creation; correct docs |
| P1 | macOS 10.15 is advertised but DarwinKit requires macOS 14 and starts unconditionally | local, `main`, `develop`, stable | Raise package/cask minimum to 14 or gate/split the sidecar |
| P1 | Stable/main note writes are non-atomic | stable and `main`; fixed on `develop` | Promote the `develop` implementation and test interruption recovery |
| P1 | Search performs O(vault size) disk reads per keystroke and permits stale-result races | all branches | Incremental/persistent index plus request-generation guard |
| P1 | Startup performs synchronous full-vault and system profiling work | all branches | Show/register capture first; defer noncritical work |
| P1 | All windows share a 1.27 MB entry bundle | all branches | Split entry points/lazy-load by window and feature |
| P1 | Remote Markdown images load automatically, leaking IP/network metadata | all branches | Block by default or require explicit per-note/domain consent |
| P1 | Note deletion has no trash/undo and asset ownership is unsafe | all branches | Add recoverable deletion and reference-safe asset handling |
| P1 | Current nested-folder work is internally inconsistent | working tree only | Resolve image, stats, embeddings, and opened-file path semantics before merge |
| P2 | Dialog, focus, live-region, target-size, and reduced-motion accessibility gaps | all branches | Establish and test a reusable accessible component layer |
| P2 | Main protection and CI do not enforce quality gates | GitHub | Require checks; protect `develop`; make lint blocking after cleanup |
| P2 | Rust and npm dependency advisories are unresolved | all branches | Upgrade and add recurring audits |
| P2 | Large components and duplicated Rust module wiring increase change risk | all branches | Split by bounded responsibility; centralize typed IPC |

## Critical and high-risk findings

### 1. Critical: Markdown asset path traversal can delete or move files outside Stik

`extract_asset_filenames` accepts everything after `.assets/` until punctuation or whitespace (`src-tauri/src/commands/notes.rs:476`). `move_note_assets` and `delete_note_assets` then join that value directly to the asset directory (`notes.rs:516-539`) without rejecting `..`, separators, absolute components, symlinks, or paths that canonicalize outside the directory.

A crafted or Git/iCloud-synced note can contain a reference such as:

```markdown
![](.assets/../../../../Desktop/important-file)
```

Deleting that note can delete the resolved file. Moving the note can copy it elsewhere and then delete the source. This requires the file to exist and the user to trigger a delete or move, but it crosses Stik's storage boundary and can cause arbitrary local data loss.

**Fix:** parse only a single generated asset filename, reject every non-normal path component and both slash styles, canonicalize parent and candidate, and verify containment before any read/copy/delete. Prefer asset IDs stored in structured metadata over scraping arbitrary Markdown. Add regression tests for `..`, encoded/Unicode separators, absolute paths, symlinks, duplicate references, and shared references. Review past releases and decide whether coordinated disclosure/security-advisory handling is appropriate.

### 2. P1: analytics behavior contradicts the privacy promise

The README says “no tracking, no telemetry” (`README.md:139`) and `SECURITY.md:63` repeats the claim. In code, `StikSettings::default()` sets `analytics_enabled: true` (`src-tauri/src/commands/settings.rs:231`). Startup creates or reads a persistent UUID at `~/.stik/analytics-id`, gathers OS version, architecture, screen resolution, app version, and locale, and sends `app_opened` to PostHog (`src-tauri/src/commands/analytics.rs:22-165`). Release builds inject the PostHog key (`.github/workflows/release.yml:98,123`).

The notice is shown only after settings load in the frontend (`src/App.tsx:341-363`), after `start_analytics` has already run during Tauri setup (`src-tauri/src/main.rs:543-557`). Its only primary action is “Got it”; it is a disclosure/opt-out flow, not consent.

**Fix:** default analytics off, do not create an identifier or emit any event until a clear opt-in, offer equally prominent Accept/No thanks actions, allow later deletion/reset of the identifier, document the exact event/property/retention set, and update README/SECURITY/Privacy text. If “no telemetry” is a core product promise, remove analytics entirely.

### 3. P1: the supported macOS version is internally impossible

The README, contributing guide, Tauri config, and generated Homebrew cask advertise macOS 10.15/Catalina (`README.md:69,147`, `CONTRIBUTING.md:17`, `src-tauri/tauri.conf.json:73`, `.github/workflows/release.yml:205`). DarwinKit declares macOS 14 because WhisperKit requires it (`src-tauri/darwinkit/Package.swift:6-10`). The app starts the DarwinKit sidecar unconditionally because dictation uses it (`src-tauri/src/main.rs:591-600`).

Users on macOS 10.15–13 can therefore be offered an install whose native feature sidecar cannot run. Issue [#99](https://github.com/0xMassi/stik_app/issues/99) also shows that the cask syntax itself now produces Homebrew warnings.

**Fix:** either set the app, README, release artifacts, and cask to macOS 14+, or split/gate the sidecar so a clearly documented reduced feature set works on older systems. Generate the Homebrew requirement from the same version source as Tauri/Swift so it cannot drift. Fix the cask generator rather than editing only the tap output.

### 4. P1: stable note writes can be truncated by interruption

`origin/main` and the current branch use `fs::write` directly for local text and image writes (`src-tauri/src/commands/storage.rs:132-159`). A crash, full disk, external reader, or interruption can expose a partial/truncated note. This is especially important because Stik advertises plain files that Finder, sync tools, Obsidian, and the file watcher may read concurrently.

`origin/develop` already adds temp-file-plus-rename atomic writes and self-write suppression. This is a good fix, but it has not reached `main` or stable. Documentation currently speaks as though atomic writes are already universal, which obscures the release gap.

**Fix:** promote the `develop` storage implementation, preserve permissions and durability expectations, use unique temp names to avoid cross-process collisions, clean orphaned temps on startup, and test simulated write/rename failures. Verify the equivalent DarwinKit iCloud write semantics separately.

### 5. P1: search scales as full-vault disk I/O and has stale-result races

`NoteIndex::search` loops over every indexed note. If a query misses the 150-character preview, it reads and lowercases the full note from disk (`src-tauri/src/commands/index.rs:151-185`). Command Palette launches text and semantic search after a 200 ms debounce for each query (`src/components/CommandPalette.tsx:192-234`). For a large vault this is O(number of notes + total content) work per keystroke.

Clearing the timeout does not cancel an already-running IPC call. There is no query generation/request ID before state updates, so an older slow search can overwrite results from a newer query.

**Fix:** keep normalized searchable content in a persistent/incremental full-text index (SQLite FTS5 is a strong fit), update it from the file watcher, cap/result-rank in the backend, and add a monotonically increasing request generation or cancellation mechanism. Benchmark p50/p95 first-result time, CPU, memory, and reads at 100, 1,000, and 10,000 notes. Define a budget such as under 100 ms p95 after debounce for 10,000 short notes.

### 6. P1: startup performs blocking work before the capture experience is ready

Tauri setup synchronously builds the full note index, registers shortcuts, initializes analytics, checks “On This Day,” restores windows, creates the tray, and starts background workers (`src-tauri/src/main.rs:543-600`). Index build recursively reads all notes. Analytics invokes `system_profiler SPDisplaysDataType -json` synchronously; it took about 0.21 seconds on the audit machine even with warm system state.

The most important product metric is shortcut-to-editable-caret latency, but there is no instrumentation or budget for it.

**Fix:** register shortcuts and make the minimal capture window usable first. Defer indexing, telemetry properties, notifications, updater work, Git sync, embeddings, and restored-note windows until after readiness. Cache stable system properties. Add performance marks from shortcut event through window visible, editor mounted, and first input accepted, and publish p50/p95 budgets.

### 7. P1: every window pays for the entire frontend bundle

The production build succeeds but emits a 1,266.74 kB minified / 399.20 kB gzip main JavaScript chunk and triggers Vite's 500 kB warning. `src/App.tsx:6-11` statically imports PostIt, Settings, Command Palette, Analytics Notice, Apple Notes Picker, and the new Editor Window. Each Tauri webview therefore parses code for unrelated windows. `@codemirror/language-data` also contributes many language chunks.

**Fix:** use per-window entry points or `React.lazy`/dynamic imports selected before rendering. Keep the capture entry minimal; conditionally load settings, Apple import, editor-only extensions, and syntax languages. Add a CI budget for initial capture JS and shortcut-to-caret time. Do not load the broad CodeMirror language catalog until a fenced language actually requests it.

### 8. P1: remote images undermine local-first privacy

The CSP permits `img-src ... https: http:` (`src-tauri/tauri.conf.json:35`), and Markdown image widgets can render external URLs. Opening a note can therefore contact a third party and reveal IP address, timing, and potentially a unique tracking URL without a user action. This is especially surprising in an app marketed as local-first and private.

**Fix:** block remote images by default, show a clear placeholder with domain and “Load once / always allow this domain,” strip credentials/fragments, and consider a privacy-preserving fetch/cache path. Test redirects, private-network targets, large responses, and tracking pixels.

### 9. P1: destructive actions are insufficiently recoverable

Deleting a note permanently removes the Markdown file and every scraped `.assets/` reference. Assets are folder-scoped, so two notes can refer to the same file; deleting either can break the other. Emptying a managed note also deletes it through the update path. There is no application trash/undo workflow.

**Fix:** move notes to a Stik trash with retention and restore, provide immediate Undo, and garbage-collect an asset only after proving no remaining note references it. Store asset ownership/reference metadata or use content-addressed assets. Include delete/move recovery in the end-to-end test matrix.

### 10. P1: nested-folder work is not coherent yet (working tree only)

The current uncommitted work introduces nested folders, but several consumers still assume one level:

- `save_note_image` and `save_note_image_from_path` still call single-component `validate_name`, so paste/drop image saves fail for folders like `Projects/Work` (`src-tauri/src/commands/notes.rs:553,590`).
- Folder stats enumerate only top-level folders and count only direct Markdown children (`src-tauri/src/commands/folders.rs:271-299`).
- Embedding centroids use only the parent directory's leaf name, so `Clients/A/Notes` and `Projects/A/Notes` collide (`src-tauri/src/commands/embeddings.rs:174-194`).
- Finder-opened notes return only the first directory component (`src-tauri/src/main.rs:23-30`).
- The new editor exposes hover-only row actions and several hard-coded labels, so it needs keyboard/a11y/i18n work before merge.

The working tree does improve `move_note` target validation with `validate_folder_path`; that protection is absent from both `origin/main` and `origin/develop`, where a direct IPC payload can use traversal components in `target_folder`.

**Fix:** define one canonical relative-folder type and use it across Rust commands, index entries, embeddings, settings, frontend state, image paths, stats, Git sharing, and opened-file routing. Add a table-driven nested-folder contract test suite before merging.

## Security and privacy review

### Filesystem and IPC trust boundaries

- Note-lock commands accept arbitrary path strings and do not canonicalize them into an allowed notes root (`src-tauri/src/commands/note_lock.rs:253-343`). A compromised webview can ask the backend to read, encrypt, decrypt, or overwrite same-user files. Validate extension, canonical containment, and whether an external file was explicitly opened by the user.
- `move_note` on remote branches joins an unvalidated `target_folder` to the vault root. The local WIP fix should be extracted and tested independently.
- Several containment checks use lexical `starts_with` rather than canonical paths. Symlinks can invalidate the intended boundary. Centralize path authorization after resolving/canonicalizing the closest existing parent.
- The asset protocol is scoped only to Documents/Stik and iCloud/Stik (`src-tauri/tauri.conf.json:36-43`) while settings support an arbitrary custom notes directory. Inline local images in a custom vault are therefore likely denied unless the path happens to fall under the static scopes. Use an explicitly authorized scoped protocol/backend rather than a global wildcard.

### Note locking threat model

AES-256-GCM is an appropriate content cipher, and the key file is created with owner-only permissions. However, the key is stored at `~/.stik/note-key`, not in Keychain/Secure Enclave (`src-tauri/src/commands/note_lock.rs:109-118`). Touch ID gates Stik's command path, but another process running as the same user can read the key file.

Either move the key into a Keychain item protected by appropriate access control or document that note lock protects files at rest from casual access/sync exposure, not from malware or another same-user process. Add corruption, recovery-key import, key-loss, backup/restore, and authentication-expiry tests before presenting it as a strong security boundary.

### Dependency audit

- `cargo audit` found `quick-xml 0.38.4` affected by RUSTSEC-2026-0194 and RUSTSEC-2026-0195 (quadratic/memory denial of service), pulled through `plist 1.8.0`. Patched versions start at `quick-xml 0.41.0`. Reachability appears limited because application code does not directly parse arbitrary XML, but the dependency should still be updated and verified.
- `npm audit` found one high-severity `nanoid 3.3.16` advisory via the PostCSS build toolchain. It is not a shipped runtime path in this application, but a fixed dependency graph is available.
- The Rust audit also reports informational unmaintained/unsound/yanked transitive packages. Triage each for reachability instead of suppressing the audit wholesale.

Add `cargo audit`/`cargo deny` and `npm audit --omit=dev` plus a separate full dependency audit to CI. Dependabot configuration already exists on `develop`; promote it.

## Performance review

| Area | Evidence | Likely user impact | Improvement |
|---|---|---|---|
| Capture startup | Synchronous index build and native subprocesses in Tauri setup | Shortcut feels inconsistent as vault grows | Minimal ready path, deferred background initialization, performance marks |
| Text search | Full-file reads for long notes on every query | Disk/CPU spikes, delayed results | Persistent incremental FTS index |
| Search concurrency | No cancellation/generation guard | Old query can replace new results | Request token and latest-only state commit |
| Frontend loading | 1.27 MB shared JS entry, all windows statically imported | Extra parse/memory cost in every webview | Per-window bundles and conditional imports |
| Index freshness | Full rebuild after freshness interval and several sync operations | Periodic stalls and repeated work | File-watcher deltas; targeted reconciliation |
| Embeddings | Rebuild/save patterns and linear scoring | Latency/memory growth with vault | Batch/background work, persisted metadata, ANN only when scale requires it |
| Window count | Multiple always-on-top webviews each load React/editor code | Memory pressure | Reuse windows, unload hidden heavy views, measure RSS by window type |
| Rendering | Long note/settings lists lack a demonstrated virtualization/content-visibility budget | Jank with large lists/settings | Profile first; virtualize note results and isolate expensive subtrees where needed |

Performance work should start with instrumentation, not only refactoring. Track cold launch, warm launch, shortcut-to-caret, save acknowledgement, search first-result, memory with 1/10/50 open windows, and indexing time at representative vault sizes.

## UX and accessibility review

### Dialog and focus behavior

`ConfirmDialog`, `LockPrompt`, `AnalyticsNotice`, and setup/settings overlays are visually modal but lack a consistent `role="dialog"`, `aria-modal`, accessible title/description linkage, focus trap, initial focus, inert background, and focus restoration. `ConfirmDialog` installs a global Enter handler, so Enter confirms regardless of which control has focus.

Build one dialog primitive that handles semantics, Escape, focus containment/restoration, destructive-button defaults, and scroll/background behavior. Default focus should normally be the safe action for destructive dialogs.

### Labels, status, keyboard, and targets

- Several icon-only controls rely on `title` rather than an accessible name; Link Popover action buttons are examples (`src/components/LinkPopover.tsx:311-358`).
- Link editing uses visual `<span>` labels rather than associated `<label>` elements (`LinkPopover.tsx:275-288`).
- Search/loading/toast feedback is not consistently exposed through `aria-live` or `role="status"`. The CodeMirror-specific announcement work is good, but it does not cover application feedback.
- Many controls remove the browser outline; some provide a replacement, many do not. Keyboard focus must always remain visible.
- Important editor row menus in the WIP editor are opacity-zero until pointer hover, excluding keyboard and touch/assistive interaction.
- Numerous controls are approximately 16–28 px and text is commonly 9–12 px. WCAG 2.2's minimum target-size criterion is 24×24 CSS px with limited exceptions; aim for larger primary controls.
- No `prefers-reduced-motion` behavior was found despite pulse/spinner/transition effects, and `transition-all` is used in multiple components. Add a global reduced-motion policy and transition only intentional properties.
- Custom editor table controls/context menus need proper menu semantics, focus movement, Escape behavior, arrow-key navigation, and non-context-menu alternatives.

### Product clarity

- Analytics needs a choice, not only “Got it.”
- Zen mode should always expose a discoverable escape/recovery route; the persistence and placeholder issues are fixed on `develop` but unreleased.
- Permanent deletion needs Undo/Trash and clearer consequences.
- Shortcut setup should explain macOS Accessibility permissions, detect conflicts, show the physical/logical key interpretation, and include a “test shortcut” action. The AZERTY fix on `develop` is valuable and should ship.
- Errors are often logged to `console.error` or swallowed. Every user-triggered failure should yield a concise, actionable message with retry/open-folder/help where relevant.

A live VoiceOver + keyboard-only audit remains required. Automated DOM/a11y tests should cover dialogs, Settings navigation, Command Palette, note locking, link editing, and table operations.

## Architecture and maintainability

The codebase is approximately 31,049 lines across the reviewed TypeScript/TSX/CSS, Rust, and Swift sources. Several files have become change-risk hotspots:

| File | Lines | Recommended boundary |
|---|---:|---|
| `src/components/SettingsContent.tsx` | 3,110 | One component/controller per settings section; shared form primitives |
| `src/components/PostIt.tsx` | 2,067 | Capture lifecycle, save pipeline, dictation, window chrome, editor integration |
| `src-tauri/src/commands/git_share.rs` | 1,002 | Process runner, repository config, sync state, conflict resolution |
| `src/components/CommandPalette.tsx` | 977 | Query controller, folder actions, selection model, view |
| `src/extensions/cm-block-widgets.ts` | 748 | Image, table, task, and block-specific extensions |
| `src-tauri/src/main.rs` | 737 | Thin app builder plus separate startup/orchestration services |
| `src-tauri/src/windows.rs` | 667 | Window specs, lifecycle/state restoration, individual window families |

Other maintainability findings:

- `App.tsx` is both a query-string router and a shared dependency root. Move routing before feature imports or use separate Vite entries.
- Rust commands are declared from both `lib.rs` and `main.rs`, so many unit tests execute twice (58 library tests and 64 binary tests in the audit run). Put the app builder/modules in the library and keep `main.rs` thin.
- Frontend/backend IPC uses 167 string-based `invoke` call sites/pattern matches without one generated type contract. Adopt `tauri-specta`/Specta or a central typed client and map backend errors into a stable error union.
- Error handling is inconsistent: there are many `console.error` paths and silent catches, which makes native failures disappear from the product experience.
- Both `bun.lock` and `package-lock.json` are tracked even though CI uses npm and explicitly uninstalls Bun to prevent Tauri Action misdetection. Pick and document one package manager.
- `CONTRIBUTING.md` refers to TipTap and stale source paths although the current editor is CodeMirror. README, SECURITY, ROADMAP, and contributing docs also disagree about telemetry, platform support, atomic writes, and delivery status.

Refactor by behavior and test seams rather than line count alone. First extract path authorization, storage transactions, typed IPC, search service, and accessible primitives; these reduce risk across many features.

## Test and quality findings

### Local verification results

| Check | Result | Notes |
|---|---|---|
| `npm test` | Pass | 27 files, 121 tests |
| `npm run build` | Pass with warning | Main JS 1,266.74 kB min / 399.20 kB gzip; Vite chunk warning |
| `cargo test` | Pass | 58 library + 64 binary executions; overlapping modules are compiled/tested twice |
| `swift test` | Pass | 43 tests across 3 suites |
| `cargo fmt -- --check` | Fail | Broad pre-existing formatting drift |
| `cargo clippy --all-targets --all-features -- -D warnings` | Fail | 12 errors/warnings elevated to errors |
| `npm audit` | Fail | 1 high advisory in build tooling (`nanoid`) |
| `cargo audit` | Fail | 2 `quick-xml` vulnerabilities plus informational advisories |

The frontend Vitest config includes only `src/**/*.test.ts` (`vite.config.ts:21-24`), excluding `.test.tsx`. Current tests are mostly pure utilities/editor extensions; the local branch has no component tests. `develop` corrects the include pattern and starts component coverage with Confirm Dialog and editor placeholder tests.

High-value missing tests:

1. Asset traversal and symlink containment for delete/move/image commands.
2. End-to-end note create, autosave, move, empty-note behavior, trash/restore, and crash/interruption recovery.
3. Custom directory and iCloud storage, offline/reconnect, external edits, and Git conflict behavior.
4. Search ordering under overlapping requests and performance at large vault sizes.
5. Locked-note key loss/recovery/corruption and path authorization.
6. Tauri window/shortcut smoke tests on supported macOS versions and keyboard layouts.
7. VoiceOver/keyboard dialog and command-palette component tests.
8. Swift tests in CI, including sidecar protocol compatibility with Rust callers.

## GitHub and delivery health

As of 2026-08-30, the public repository has 246 stars and 15 forks. There are **0 open PRs** and **7 open issues**. All seven issues are unassigned, unlabeled, and have no milestone/project association:

| Issue | Status from code review | Action |
|---|---|---|
| [#99 Homebrew warnings](https://github.com/0xMassi/stik_app/issues/99) | Still open in release generator | Fix syntax and actual minimum macOS in workflow |
| [#97 selected tab tint](https://github.com/0xMassi/stik_app/issues/97) | Fixed on `develop` by `b8086f2` | Verify, release, close |
| [#96 AZERTY layouts](https://github.com/0xMassi/stik_app/issues/96) | Fixed on `develop` by `b8086f2` | Verify across layouts, release, close |
| [#94 Zen placeholder](https://github.com/0xMassi/stik_app/issues/94) | Fixed on `develop` by `303d4c0` | Verify, release, close |
| [#93 persist Zen](https://github.com/0xMassi/stik_app/issues/93) | Fixed on `develop` by `303d4c0` | Verify escape path, release, close |
| [#92 clear system shortcuts](https://github.com/0xMassi/stik_app/issues/92) | Fixed on `develop` by `303d4c0` | Verify, release, close |
| [#90 filename bug](https://github.com/0xMassi/stik_app/issues/90) | Fixed on `develop` by `5b36aa5` | Verify/migrate, release, close |

This makes the tracker look stagnant even though work was completed. Close linked issues automatically after the relevant branch is released, or mark them `fixed-on-develop`/`needs-release` meanwhile. Add severity, area, status, and release-milestone labels.

`origin/develop` is eight commits ahead of `origin/main`, including atomic notes-tree safety, CI, Dependabot, accessibility work, font/CSP fixes, and the issue fixes above. The latest stable release is [v0.8.0 from 2026-04-13](https://github.com/0xMassi/stik_app/releases/tag/v0.8.0); the latest beta listed is beta.38 from 2026-08-02. Define an explicit promotion checklist and version strategy so stable, beta, source version, and documentation do not drift.

`main` requires one approving PR review and dismisses stale reviews, but has no required status checks, does not enforce admin rules, and does not require conversation resolution or signed commits. `develop` is unprotected and no repository rulesets exist. CI is present on `develop` and recent runs pass, but lint is advisory; Swift, security audits, bundle budgets, and end-to-end smoke tests are absent.

**Recommended branch policy:** protect both integration and release branches, require frontend build/test, Rust test, Swift test, formatting, Clippy, audit, and a small macOS smoke job; require resolved conversations; restrict direct pushes. If the two-branch model continues to cause unreleased drift, simplify toward a protected trunk plus prerelease tags/channels.

## Product opportunities

Reliability features should precede expansion. Ranked opportunities:

| Rank | Opportunity | Why it fits Stik | Effort |
|---:|---|---|---|
| 1 | Trash, undo, and version recovery | Converts local-first ownership into safety; reduces fear around instant capture | Medium |
| 2 | Vault Health screen | Shows index state, sync conflicts, backups, permissions, storage path, and repair actions | Medium |
| 3 | Conflict Center | Makes Git/iCloud/external-edit conflicts visible and recoverable instead of silent | High |
| 4 | Backlinks, tags, and saved searches | Builds on plain Markdown/wiki links without changing ownership | Medium–High |
| 5 | CLI + URL scheme + macOS Share action | Extends “capture from anywhere” into automation and other apps | Medium |
| 6 | Privacy Center | Analytics consent, remote-image policy, identifier reset, network activity explanation | Low–Medium |
| 7 | Shortcut/permission health check | Solves layout conflicts, Accessibility setup, and Zen escape discoverability | Low–Medium |
| 8 | Portable backup/export snapshot | One-click archive with notes, assets, settings manifest, and recovery verification | Medium |

Mobile/cloud expansion should wait until path semantics, conflict behavior, storage transactions, data migrations, and the sync contract are explicit and tested. Otherwise every current ambiguity becomes a distributed-data problem.

## Recommended action plan

### First 7 days: release blockers

1. Patch asset extraction/containment and add adversarial regression tests on every active branch/release line.
2. Disable analytics by default and align implementation, consent UI, README, SECURITY, and privacy documentation.
3. Reconcile macOS support and fix the Homebrew cask generator.
4. Rebase/promote `develop` carefully, preserving current WIP, and ship atomic writes plus already-completed issue fixes.
5. Upgrade vulnerable dependencies and run all three language test suites.
6. Close or correctly label the six fixed-but-unreleased GitHub issues.

### Weeks 2–4: hardening milestone

1. Make CI required and clean formatting/Clippy debt until lint is blocking.
2. Add trash/undo and reference-safe asset lifecycle.
3. Add path authorization helpers for every filesystem IPC command and test symlink/custom-root cases.
4. Split the frontend by window and defer startup work; add capture/search performance budgets.
5. Replace full-read search with an incremental index and guard against stale requests.
6. Establish accessible dialog, toast/status, icon-button, menu, and focus primitives.
7. Run manual VoiceOver, keyboard-only, custom-directory, iCloud, Intel/Apple Silicon, and macOS-version smoke passes.

### Months 2–3: sustainable product growth

1. Break up Settings, PostIt, Command Palette, Git sync, main startup, and window orchestration around tested service boundaries.
2. Introduce generated/central typed Tauri IPC and consistent user-visible error handling.
3. Ship Vault Health and Conflict Center, then backlinks/tags/saved search.
4. Add the CLI/URL/share capture surfaces after storage and conflict contracts are stable.
5. Publish a release checklist with performance, privacy, accessibility, security, migration, and recovery gates.

## Definition of a healthy next stable release

The next stable release should not ship until:

- the asset traversal is fixed and regression-tested;
- analytics behavior matches the public privacy promise;
- the installer refuses unsupported macOS versions or the sidecar is safely gated;
- local note writes are atomic and interruption-tested;
- all GitHub checks are required and green, including Swift, formatting, Clippy, and dependency audit;
- no stale search can replace a newer result, and representative large-vault budgets pass;
- the capture window uses a minimal entry bundle and shortcut-to-caret latency is measured;
- destructive deletion is recoverable;
- critical dialogs and primary workflows pass keyboard and live VoiceOver testing;
- the six completed GitHub issues are verified, released, and closed;
- README, SECURITY, CONTRIBUTING, ROADMAP, changelog, app version, cask, and release notes agree.

## Positive foundations to preserve

- Plain Markdown and local-first storage are a clear, valuable product stance.
- The capture interaction is focused and differentiated.
- Test suites currently pass across TypeScript, Rust, and Swift.
- Recent editor VoiceOver announcements are a good example of behavior-specific accessibility work.
- Atomic settings/index patterns, poisoned-mutex recovery, and file-watcher architecture show good defensive instincts.
- On-device native AI and dictation protect user content better than a cloud-first design.
- Stable/beta channel separation and automatic update infrastructure provide a useful delivery base once the branch/release policy is tightened.

The best overall improvement is to make Stik's operational behavior match its promise: instant, local, private, and safe. The product already has the right center of gravity; the next milestone should turn that promise into enforced invariants across storage, startup, privacy, accessibility, and release engineering.
