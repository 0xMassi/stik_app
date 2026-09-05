# Stik release checklist

CI is reused by both build workflows: a failed quality/security job blocks beta
publication and stable draft builds. Beta tags point to the exact tested SHA.
Stable tag pushes build a draft only; Homebrew and the landing page update on
the stable release's `published` event, after its assets are public. Publish
manually or with an authorized user token (events created by `GITHUB_TOKEN`
do not start another workflow).

Use this checklist for stable releases. Beta builds may skip the Homebrew and updater-feed steps, but they must pass the same code, privacy, storage, and accessibility gates.

## 1. Prepare the release

- [ ] Start from an up-to-date `main` with a clean working tree.
- [ ] Confirm every intended change has reached `main`; do not release directly from a feature branch.
- [ ] Confirm `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CHANGELOG.md`, and the tag use the same version.
- [ ] Review open release-blocking issues, security advisories, and dependency update pull requests.
- [ ] Confirm the release notes describe migrations, compatibility changes, and recovery steps.

## 2. Run automated gates

```bash
bun install --frozen-lockfile
bun audit --audit-level=high
bun run check:platform
bun run build
bun run check:bundle
bun run test

swift test --package-path src-tauri/darwinkit

cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
cargo audit --file src-tauri/Cargo.lock
cargo deny --manifest-path src-tauri/Cargo.toml check advisories
```

- [ ] All commands pass without ignored or advisory-only failures.
- [ ] The capture entry remains below the enforced bundle budget.
- [ ] The full-text search performance smoke test remains within its budget.

## 3. Exercise user data and recovery

Use a scratch notes directory. Stable and beta builds can share settings, so never point a test build at irreplaceable data.

- [ ] Create, edit, rename, move, and delete notes in local, nested, and custom folders.
- [ ] Type and immediately close the editor, use Cmd+Q/application-menu Quit, tray Quit, Dock Quit, and log out of a disposable macOS account. Confirm the final draft survives each supported orderly shutdown; a pending-save failure must keep the app open. Dock Quit/logout need separate verification because the current native runtime can bypass Tauri's `ExitRequested` event.
- [ ] Restore a note from Trash and confirm a name conflict never overwrites an existing note.
- [ ] Paste and move image assets; confirm crafted `../`, absolute, and symlinked paths cannot escape the configured vault.
- [ ] Edit a note from another app and confirm Stik refreshes without displaying a partial write.
- [ ] Enable iCloud, test offline/reconnect behavior, and verify coordinated reads and writes.
- [ ] Run Vault Health against healthy, unwritable, and deliberately out-of-sync scratch vaults; export diagnostics.
- [ ] Lock and unlock a note, relaunch, test idle/sleep relocking, and verify recovery-key export.
- [ ] Confirm legacy lock-key migration succeeds before the old file is removed.

## 4. Check privacy and accessibility

- [ ] On a fresh profile, decline analytics and confirm no analytics ID is created and no PostHog request is sent.
- [ ] Opt in, verify only documented metadata/events are sent, then opt out and confirm the identifier is deleted.
- [ ] Confirm remote Markdown images are blocked by default and require the explicit setting to load.
- [ ] Complete capture, search, move, delete/restore, settings, and lock/unlock using only the keyboard.
- [ ] Run the same primary workflows with VoiceOver, including dialog focus entry/return and live status announcements.
- [ ] Check light, dark, reduced-motion, English, and Simplified Chinese modes.

## 5. Build and inspect artifacts

- [ ] Build and launch a local app with `./scripts/build-dev.sh build` on the available architecture.
- [ ] Build Apple Silicon and Intel release artifacts in CI.
- [ ] Confirm each `.app` declares macOS 14, contains the matching DarwinKit sidecar, and launches on a clean macOS 14+ account.
- [ ] Verify global shortcuts, Accessibility permission flow, microphone permission, dictation, Finder “Open With,” tray behavior, and window restoration.
- [ ] Verify signatures with `codesign`, notarization with `spctl`, and both DMGs before publishing.
- [ ] Confirm updater archives and `latest.json` are signed with the updater key.

## 6. Publish and monitor

- [ ] Publish the GitHub draft only after both architectures and DMGs are present.
- [ ] Confirm the Homebrew cask uses `depends_on macos: :sonoma`, correct checksums, and both architecture URLs.
- [ ] Install once from the DMG, once through Homebrew, and upgrade from the previous stable release through the in-app updater.
- [ ] Confirm stable users cannot receive beta artifacts and beta builds cannot update the stable feed.
- [ ] Watch crash/support/security channels after release and keep the previous signed build available for rollback.
- [ ] Close only issues verified in the published build, then update the roadmap and release links.
