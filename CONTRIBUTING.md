# Contributing to Stik

Thanks for your interest in contributing to Stik! This guide covers everything you need to get started.

## Before You Start

**Open an issue first.** Whether it's a bug fix, new feature, or refactor -- please [open an issue](https://github.com/0xMassi/stik_app/issues) before writing code. This lets us discuss the approach and avoid duplicate work. Small typo fixes or doc improvements can go straight to a PR.

Check the [Ideas Board](https://www.stik.ink/ideas) to see what the community is asking for and the [Roadmap](ROADMAP.md) for planned work.

## Prerequisites

Stik is a **macOS-only** app. You need a Mac to develop and test.

| Tool | Version | Install |
|------|---------|---------|
| macOS | 14+ | -- |
| Xcode CLT | Latest | `xcode-select --install` |
| Rust | Stable | [rustup.rs](https://rustup.rs/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Tauri CLI | 2.x | Installed via `npm install` |

## Getting Started

```bash
# Clone with submodules (DarwinKit sidecar)
git clone --recurse-submodules https://github.com/0xMassi/stik_app.git
cd stik_app

# Install frontend dependencies
npm ci

# Run in development mode (hot reload)
./scripts/build-dev.sh dev

# Local app bundle for testing
./scripts/build-dev.sh build
```

> **Note:** The DarwinKit sidecar (Swift NLP) lives at `src-tauri/darwinkit/` as a git submodule. If you cloned without `--recurse-submodules`, run `git submodule update --init`.

npm and `package-lock.json` are the canonical JavaScript dependency source. Do not commit Bun, Yarn, or pnpm lockfiles.

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

### Frontend changes

```bash
# Type check
npx tsc --noEmit

# Run tests
npm test

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

- Run `npx tsc --noEmit` before committing -- zero errors required
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
   - `npm run build`, `npm test`, `npm run check:bundle`, and `npm run check:platform` pass
   - `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` passes
   - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passes
   - `cargo test --manifest-path src-tauri/Cargo.toml --all-features` passes
   - `swift test --package-path src-tauri/darwinkit` passes
   - Manually test your changes in the capture window, sticked notes, and viewing mode
4. **Write a clear description.** Explain what changed, why, and how to test it.

## Testing

- **Frontend**: `npm test` runs Vitest. Add tests for utility functions and non-trivial logic.
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
