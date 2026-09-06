# Contributing to Stik

Thanks for your interest in contributing to Stik! This guide covers everything you need to get started.

## Before You Start

For unsolicited contributions, please [open an issue](https://github.com/0xMassi/stik_app/issues) first to discuss the approach and avoid duplicate work. Small typo fixes and directly assigned local work do not require a new issue. Agents must not post remotely without authorization.

Check the [Ideas Board](https://www.stik.ink/ideas) to see what the community is asking for and the [Roadmap](ROADMAP.md) for planned work.

## Prerequisites

Stik is a **macOS-only** app. You need a Mac to develop and test.

| Tool | Version | Install |
|------|---------|---------|
| macOS | 14+ | -- |
| Xcode | 26+ (Swift 6.2+) | Select a compatible Xcode with `xcode-select` or `DEVELOPER_DIR`; the build host must support that Xcode. |
| Rust | Stable | [rustup.rs](https://rustup.rs/) |
| Protobuf compiler | `protoc` on PATH | `brew install protobuf` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Bun | 1.4.1 | [bun.com/docs/installation](https://bun.com/docs/installation) |
| Tauri CLI | 2.x | Installed via `bun install` |

## Getting Started

```bash
# Clone with submodules (DarwinKit sidecar)
git clone --recurse-submodules https://github.com/0xMassi/stik_app.git
cd stik_app

# Initialize submodules, install locked dependencies, build DarwinKit + frontend
./scripts/build-dev.sh setup

# Run with temporary data and hot reload
./scripts/build-dev.sh dev

# Native app bundle with temporary data (also usable by UI automation)
./scripts/build-dev.sh qa
```

> **Note:** The DarwinKit sidecar (Swift NLP) lives at `src-tauri/darwinkit/` as a git submodule. If you cloned without `--recurse-submodules`, run `git submodule update --init`.

`setup` initializes that submodule automatically. `doctor` checks prerequisites without installing anything. Install Rust's checks with `rustup component add clippy rustfmt` if needed. Xcode must provide Swift 6.2+ and a working macOS SDK; no signing certificate, runtime login, or API key is needed for local QA. Swift CI/build jobs pin Xcode 26.3 on macOS 15; Rust CI still runs on the app's macOS 14 minimum.

Bun 1.4.1 and `bun.lock` are the canonical JavaScript dependency source. The version is pinned in `.bun-version` and `package.json`; CI reads `.bun-version`. Do not commit npm, Yarn, pnpm, or legacy `bun.lockb` lockfiles.

Use `bun add` and `bun remove` for dependency changes, and commit the resulting `package.json` and `bun.lock` together. Use `bun run <script>` for package scripts and `bunx` for package executables. Keep Node installed: Vite, TypeScript, and Vitest retain their Node runtime. Do not use `bun test` or `bun run --bun`; this migration changes the package manager, not the test runner or application runtime.

## Project Structure

```
stik_app/
  src/                        # Frontend (React + TypeScript)
    components/               # UI components (PostIt, Editor, etc.)
    extensions/               # CodeMirror editor extensions
    styles/globals.css        # All custom CSS (theme tokens, editor styles)
    utils/                    # Utility functions
    types/                    # Shared TypeScript types
  src-tauri/                  # Backend (Rust + Tauri 2.0)
    src/
      app.rs                  # App orchestrator, commands, plugin setup
      main.rs                 # Thin executable entry point
      state.rs                # AppState, shared state types
      commands/               # Tauri command handlers
    darwinkit/                # Git submodule -- Swift NLP sidecar
    binaries/                 # Built sidecar binaries (gitignored)
    Entitlements.plist        # macOS entitlements for notarization
    tauri.conf.json           # Tauri window and app configuration
```

## Architecture Overview

Stik is a **Tauri 2.0** app with three layers:

- **Frontend**: React 19 + TypeScript + Tailwind CSS + CodeMirror 6. `App.tsx` routes each Tauri window from its `?window=<type>` URL and lazy-loads window-specific surfaces. Tauri commands and events provide IPC.
- **Backend**: Rust. Notes stored as `.md` files in `~/Documents/Stik/<Folder>/`, settings in `~/.stik/`. Core logic extracted into `_inner` functions for cross-module calls without Tauri State.
- **DarwinKit**: Swift CLI sidecar for on-device NLP (embeddings, language detection, sentiment) via JSON-RPC over stdio. Communicates with the Rust backend as a managed child process.

## Development Workflow

### Repeatable agent verification

```bash
./scripts/verify.sh
```

This runs setup, the frontend build/tests/platform/bundle gates, Rust formatting/strict Clippy/all-feature tests, and Swift tests. Native tests use a fresh `STIK_DEV_ROOT` instead of personal settings. CI also runs network-dependent dependency audits; do not treat local verification as a substitute for those. Keep the usual gates intact.

Run verification and native builds serially within one worktree: both replace
`dist/`, which Rust embeds while compiling and running doctests. Use separate
worktrees for concurrent builds. For QA across restarts, use a persistent,
ignored scratch directory with `STIK_DEV_ROOT`; OS temporary directories may
disappear between sessions.

After setup, use targeted checks while iterating:

| Change | Command |
| --- | --- |
| Editor component | `bun run test src/components/Editor.test.tsx` |
| Rust index | `cargo test --manifest-path src-tauri/Cargo.toml commands::index::tests --locked` |
| Real save/read/search/update/trash workflow | `cargo test --manifest-path src-tauri/Cargo.toml --test note_workflow --all-features --locked -- --nocapture` |
| Swift NLP handler | `swift test --package-path src-tauri/darwinkit --filter NLPHandlerTests` |

The storage integration test creates its own process-local data, checks real files and returned results, and deletes only its generated data on success. Failures retain the printed directory. It is backend integration coverage, not a replacement for UI QA.

### Isolated development and UI QA

`dev` and `qa` create a new temporary profile and print its location. To resume a session, pass an existing absolute directory: `STIK_DEV_ROOT=/absolute/session ./scripts/build-dev.sh qa`. Notes live under `notes/`, application settings/caches under `config/`, and native/Vite output under `logs/dev.log`. Stop with **Ctrl-C**; data remains for inspection. These modes use `com.stik.dev`/`Stik Dev`, separate from the regular app. `qa` needs no HTTP server; `dev` binds only to `127.0.0.1`, default port 1420. If occupied, use `STIK_DEV_PORT=1422 ./scripts/build-dev.sh dev`; never terminate an unrelated listener.

The debug-only profile pins the notes root and disables normal global shortcuts, analytics, updates, AI, dictation, iCloud/Git workers, Apple Notes import, and production Keychain access. Do not copy personal data or credentials into it. This is **not a security sandbox**: explicit file pickers, external-file editing, and shell/OS actions still require care. Test real OS/account integrations separately with explicit authorization and development data. Release builds reject `STIK_DEV_ROOT` rather than silently using personal state.

For native automation, select the running `src-tauri/target/<host-triple>/debug/bundle/macos/Stik Dev.app` by its full path. A bare hot-reload executable may not be discoverable by native automation. Do not double-click that bundle later without the launcher: the launcher supplies the isolated profile. The existing `build` mode remains the ordinary unsigned local build and does not launch it.

If native automation cannot read the app or times out, report UI QA as unverified and perform the flow manually; a successful build, startup log, or backend test does not establish UI correctness.

Representative manual flow: type a distinctive note in capture, save/close, find it through Browse Notes, open and edit it, reopen to confirm persistence, then trash/restore the disposable note. Check capture, sticked, and viewing windows when shared editor behavior changes. Verify the Markdown file under the printed profile and inspect logs; a rendered window alone is not acceptance.

### Debugging and common failures

- Missing `Package.swift`: use `setup`, not copied build artifacts. CI checks out submodules in every job that reads DarwinKit.
- Wrong Bun/Node/protoc or missing Rust components: run `doctor`; fix the named prerequisite, not the lockfile. Node 20 matches CI; newer supported Node versions can emit extra warnings.
- Missing sidecar or `dist` in a direct Cargo check: run `setup` first. A stub is suitable only for CI compilation, not runtime/sidecar QA.
- Vite in a normal browser cannot exercise Tauri IPC. Use the actual native app; unit-test bridge mocks are not end-to-end proof.
- Tauri ignores DarwinKit's generated `.build/` directory through `.taurignore`, so Swift tests do not continuously restart the app. Re-run `dev` after changing/rebuilding Swift source.
- Rust panic: rerun the failing command with `RUST_BACKTRACE=1`. Native logs include startup timing; frontend errors are in the window's Web Inspector (right-click → Inspect Element in debug builds).
- Unreadable/malformed isolated settings fail startup instead of falling back to normal app settings. Start a new temporary session to compare; preserve the failed one for diagnosis.
- No account permissions are requested by automated QA. Full Disk Access, microphone/Accessibility permission, biometric auth, signing/notarization, and remote Git access are manual/authorized integration steps, not setup prerequisites.

### Frontend changes

```bash
# Type check
bunx tsc --noEmit

# Run tests
bun run test

# Dev server with hot reload and the correct DarwinKit sidecar
./scripts/build-dev.sh dev
```

### Backend changes

```bash
cd src-tauri

# Check compilation
cargo check

# Format code
cargo fmt

# Run tests
cargo test
```

### Key patterns to follow

- **Tauri commands**: Put new commands in the appropriate file under `src-tauri/src/commands/`. Register them in `src-tauri/src/app.rs`.
- **State access**: Use the `_inner` pattern -- extract core logic into a plain function, wrap it in a `#[tauri::command]` that passes State.
- **Mutex usage**: Always use `.lock().unwrap_or_else(|e| e.into_inner())` to recover from poisoned mutexes.
- **File writes**: Route note and asset writes through `commands::storage`. Local/custom storage uses temp-file-plus-rename; iCloud uses the coordinated DarwinKit API. Direct `fs::write` bypasses those guarantees.
- **Editor extensions**: Place CodeMirror extensions in `src/extensions/` and add focused tests beside them.
- **CSS**: All custom styles go in `src/styles/globals.css`. Use the theme token CSS variables (`--color-bg`, `--color-coral`, etc.) -- don't hardcode colors.
- **Focus preservation**: UI elements near the editor must use `onMouseDown` + `e.preventDefault()` to avoid stealing editor focus.

## Code Style

### Rust

- Run `cargo fmt` before committing
- Run `cargo clippy` and address warnings
- Follow standard Rust conventions (snake_case, no unused imports)

### TypeScript / React

- Run `bunx tsc --noEmit` before committing -- zero errors required
- Use functional components with hooks
- Keep components focused -- one file, one responsibility
- Prefer `useCallback` and `useRef` for stable references passed to the editor
- No unnecessary `any` types

### CSS

- Use the existing theme tokens in globals.css
- Support both light and dark themes (`[data-theme="dark"]` overrides)
- Keep editor styles scoped under `.stik-editor`

### General

- No over-engineering. Solve the current problem, not hypothetical future ones
- Self-documenting code over comments. Add comments only for the *why*, not the *what*
- Don't add dependencies without discussion. Open an issue first if a new package is needed

## Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add formatting toolbar with heading dropdown
fix: prevent highlight mark from persisting without selection
refactor: extract image copy logic into shared utility
docs: update contributing guide with architecture overview
```

Keep the subject line under 72 characters. Use the body for details when needed.

## Pull Requests

1. **Branch from `main`**. Use a descriptive branch name (`feat/formatting-toolbar`, `fix/highlight-persistence`).
2. **Keep PRs focused.** One feature or fix per PR. If you find unrelated issues while working, open separate issues for them.
3. **Verify before submitting:**
   - `bun install --frozen-lockfile`, `bun run build`, `bun run test`, `bun run check:bundle`, and `bun run check:platform` pass
   - `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` passes
   - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passes
   - `cargo test --manifest-path src-tauri/Cargo.toml --all-features` passes
   - `swift test --package-path src-tauri/darwinkit` passes
   - Manually test your changes in the capture window, sticked notes, and viewing mode
4. **Write a clear description.** Explain what changed, why, and how to test it.

## Testing

- **Frontend**: `bun run test` runs Vitest on Node. Add tests for utility functions and non-trivial logic.
- **Backend**: `cargo test` in `src-tauri/`. Add tests for new command logic, especially parsing and file operations.
- **Manual**: Always test across all window types (capture, sticked, viewing) since they share components but have different behaviors.

## Reporting Bugs

When filing a bug, include:

- macOS version
- Stik version (Settings or `brew info stik`)
- Steps to reproduce
- Expected vs actual behavior
- Console logs if relevant (`Console.app` > filter by "Stik")

## Feature Requests

Use the [Ideas Board](https://www.stik.ink/ideas) to submit and vote on feature ideas. For implementation proposals, open a GitHub issue with your proposed approach.

## Community

- [Discord](https://discord.gg/gG8vdCCRzW) -- Chat with other contributors
- [X / Twitter](https://x.com/stik_app) -- Updates and announcements
- [Ideas Board](https://www.stik.ink/ideas) -- Feature voting

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
