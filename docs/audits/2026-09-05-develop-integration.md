# Develop integration and release readiness — 2026-09-05

## Disposition

Completed work is integrated into `develop`, including the Bun 1.4.1 migration,
measured search improvement, cleanup, isolated agent workflow, application
hardening, and PR #100's dependency patch. Prepare a **draft** main PR, not a
stable release: native shutdown and OS-integration acceptance gates remain below.
The application version stays at 0.8.0 with changes under Unreleased.

The main checkout's pre-existing changes were preserved. They were previously
saved on `codex/wip-import` and ported through `b202886` / `014a442`; its old tree
was not merged over the newer implementation. The font and accessibility branch
work was already represented by `d44020d` and `138f57c`. No branch, worktree, or
user file was deleted. Integration worktrees are separate from the dirty main
checkout.

PR [#100](https://github.com/0xMassi/stik_app/pull/100) was merged into develop at
`709da7a`, retaining `postcss-selector-parser` 6.1.4 in `bun.lock` with matching
integrity. Its obsolete npm lockfile was not restored. It remains open against
main until that branch receives the change. Other unresolved backlog requirements
remain open; passing develop tests is not proof they are resolved on main.

## Problems found and fixed during integration

- Editor saves are serialized, failed/newer drafts remain pending, and switching,
  mutation, window close, and supported app quit wait for durable saves. Clearing
  an existing document no longer trashes it. Stale async reads cannot replace a
  newer selection.
- Native Cmd+Q originally called `NSApplication terminate:` directly, bypassing
  the Tauri exit guard. The application-menu Quit item now routes through the
  same `app.exit(0)` handshake as tray Quit, preserving other native menu items.
- Editing locked viewing notes preserves encrypted storage. Pinning a decrypted
  copy is refused until the user explicitly unlocks the note. The full editor
  refuses unsupported locked-note operations with an actionable message.
- Atomic writes use private, unique temporary files. Exclusive moves reject
  collisions before touching assets. Folder rename updates descendant settings,
  search entries, and embedding paths synchronously. Watchers exclude Trash and
  hidden paths. Real filesystem regression tests cover these contracts.
- Trash's main pane no longer says empty when recoverable entries exist.
- Native QA opens an addressable full editor in an isolated profile. `Stik Dev`
  fails closed without `STIK_DEV_ROOT` before loading settings.
- CI is reused as a dependency of beta and stable draft builds. Beta tags name
  the exact tested SHA. Homebrew/landing publication waits for a published stable
  release; both architecture assets and valid hashes are mandatory.
- CI's default Xcode 15.4 failed current Swift dependencies. Swift/build jobs now
  pin Xcode 26.3 on macOS 15; the Rust macOS 14 gate and runtime minimum remain.
  The doctor command rejects Swift older than 6.2 before installation.

Ponytail full mode guided small changes using existing queues, native menu APIs,
filesystem primitives, and workflow jobs. No test runner or app runtime migration,
new persistence framework, native delegate override, or release-gate bypass was
introduced.

## Verification evidence

Application changes through `2b2deaf` passed `./scripts/verify.sh` in 39 seconds
on an Apple M4 Max / macOS 27, Bun 1.4.1, Node 25.8.0, Rust 1.98.0, Xcode 26.6:

| Gate | Result |
| --- | --- |
| TypeScript/Vite and platform/bundle checks | Passed; capture entry 287,842 bytes, below 750,000 |
| Vitest | 201 tests across 44 files passed |
| Rust format and strict Clippy | Passed |
| Rust tests | 128 unit + 1 note workflow + 7 storage integration passed |
| Swift tests | 43 passed |
| Workflow Actionlint 1.7.7 | Passed after publication fix |
| Bun high-severity audit | No vulnerabilities in 356 packages at integration audit |
| Cargo audit / deny advisories | Exit 0; audit retains 20 upstream warnings, not a clean warning-free bill |

One Rust performance benchmark is intentionally opt-in/ignored. Existing Vite
large lazy-chunk and local Node localStorage warnings remain. The earlier required
checks also passed on the exact develop revisions `709da7a` and `cff1835`.

[CI at 97e1fe8](https://github.com/0xMassi/stik_app/actions/runs/33976341671)
passed all four jobs. The corresponding
[beta run](https://github.com/0xMassi/stik_app/actions/runs/33976341756) then built,
signed, notarized and published [beta-40](https://github.com/0xMassi/stik_app/releases/tag/beta-40)
at that exact SHA. This is an intermediate beta, preceding the final Cmd+Q fix;
use the newer develop build and require its own green checks before promotion.

Publication fault injection ran the actual workflow shell block with disposable
DMGs, real SHA-256 calculations, mocked GitHub writes, and a loopback HTTP server:
missing Intel asset, invalid hash, hash-command failure, and webhook HTTP 500 all
failed as intended after the patch; the first three never reached the tap write.
Both valid assets generated independently checked cask hashes. Those four failure
cases incorrectly returned success before the patch. Removing beta's `needs:
checks` in a disposable fixture also failed the platform gate; restoration passed.

Native QA used only `/private/tmp/stik-develop-qa.gIG61L`, not personal notes:

- Created a folder and notes; typed then immediately closed the editor; reopened
  the same build/profile and verified file content.
- Cleared a note through autosave (file retained at zero bytes), typed replacement,
  created another note, and switched notes while preserving both drafts.
- Deleted a nonempty note, listed it in Trash, restored it, and found its body via
  full-text search. Final empty-state rendering also has a regression test.
- On rebuilt develop `2b2deaf`, entered a visible marker, used Cmd+Q, observed
  process exit, read the saved marker, and saw it again after relaunch. This native
  check establishes menu routing and persistence, not a measured sub-600ms timing
  guarantee; delayed/pending-save behavior is independently covered by unit tests.
- Opened Settings / Vault Health: healthy, writable scratch vault, 3 disk / 3
  indexed notes. Rebuild index succeeded.
- Built from the **develop worktree**, not the implementation branch. Deep strict
  signature verification passed for the ad-hoc-signed arm64 Stik Dev bundle and
  its sidecar; bundle declares minimum macOS 14. Local build is not notarized.

Native coverage is representative, not exhaustive. The existing personal-data
Stik process was left running; only disposable Stik Dev sessions were closed.

## Remaining release gates

1. **Pending drafts on Dock Quit/logout:** installed tao 0.35.3 handles
   `applicationWillTerminate` without `applicationShouldTerminate`; runtime-wry
   2.11.4 turns destruction into `Exit`, not `ExitRequested`. The custom Cmd+Q menu
   does not intercept Dock/logout termination. Source inspection therefore shows
   a remaining loss risk during the 600ms debounce or an in-flight/failed save.
   Do not call shutdown safety complete. Resolve with supported lifecycle handling
   and verify in a disposable macOS session before stable promotion. No unsafe
   Objective-C delegate replacement was added.
2. Keychain migration/biometric authentication, iCloud offline/reconnect, Apple
   Notes, dictation and microphone/Accessibility permissions need explicitly
   authorized OS/account testing. Automated contract tests are not substitutes.
3. Full VoiceOver and keyboard-only flows, light/dark/language/reduced-motion
   combinations, Finder Open With, capture/pinned-window lifecycle, and failure
   UX on a genuinely unwritable vault are not all manually covered.
4. Intel release build/runtime, clean macOS 14 launch, DMG/Homebrew installation,
   updater upgrade from the previous stable version, and both release signatures
   still need the release checklist. Arm64 beta success does not establish these.
5. Main requires an approving review. Do not bypass it. Version alignment, main
   merge, stable tag, draft-asset inspection and stable publication remain undone.

## Reproduction and handoff

From a clean checkout of develop on a compatible Mac:

```bash
./scripts/build-dev.sh doctor
./scripts/build-dev.sh setup
./scripts/verify.sh
./scripts/build-dev.sh qa
```

`qa` prints its disposable profile/log path and retains it. Reuse that path with
`STIK_DEV_ROOT=/absolute/scratch/path ./scripts/build-dev.sh qa`. Do not launch the
ordinary beta or stable bundle against personal notes for unattended testing.

Local develop bundle:
`/Users/massimianiv/.config/superpowers/worktrees/stik_app/full-hardening/src-tauri/target/aarch64-apple-darwin/debug/bundle/macos/Stik Dev.app`.
Evidence logs: `/private/tmp/stik-final-native-fixes-verification.log`,
`/private/tmp/stik-develop-native-final-build.log`, and
`/private/tmp/stik-publish-regression.0qyNst/results.json`. These local logs/fixtures
are ephemeral; the repository tests, workflow, and this report are durable.

Earlier scoped reports retain the [benchmark measurements](2026-09-05-search-performance.md),
[cleanup evidence](2026-09-05-slop-cleanup.md),
[Bun migration](2026-09-05-bun-migration.md), and
[clean-worktree setup validation](2026-09-05-agent-workflow.md).
