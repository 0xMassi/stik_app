# Beta acceptance before 0.9.0

Status: **hold stable publication**. Source version remains 0.8.0. This report
does not claim exhaustive OS, account integration, architecture, or UX coverage.

## Changes prepared for develop

- `d52aa01`: native Intel CI verifies the real Swift sidecar, builds an Intel
  release app, checks architecture/minimum OS/signature/sidecar execution, and
  uploads a non-release artifact. The release helper exposes Cargo failures and
  stops before Git mutations.
- `e72f17a`: capture, viewing, pinned, and full-editor windows participate in
  shutdown. AppKit termination and Tauri exit requests wait for all note windows
  to save. Failed saves, changed participants, and a 30-second timeout cancel
  the attempt; stale or duplicate acknowledgements cannot approve another one.
- Pinned Save and Close persists the live draft first. Empty viewing notes remain
  valid files. Failed saves keep the mounted editor and undo history. Capture
  retries reuse their first saved file; failed pinned-window closes do not lose
  subsequent edits. Active dictation vetoes Quit.

The old editor-only coordinator's two tests were replaced by five coordinator
tests retaining authentication and failed-save retry coverage and adding
multi-window, generation, timeout, and readiness checks. Twenty-four
real-CodeMirror PostIt tests protect the consolidated save/close behavior.

## Fresh verification on September 6

Environment: local Apple Silicon Mac, Bun 1.4.1, existing Node/Vitest runtime,
clean develop worktree at `e72f17a`. No personal notes were used.

| Check | Result |
| --- | --- |
| `./scripts/verify.sh` | Pass, 39 seconds |
| Frontend | 226 tests in 46 files; TypeScript/build/platform/bundle gates pass |
| Rust | 131 unit + 8 integration tests pass; formatting and strict Clippy pass |
| Swift | 43 tests pass |
| Local native bundle | Develop `e72f17a` builds and launches using the isolated QA profile |
| Intel CI at `d52aa01` | Real sidecar verification and release-app inspection pass |
| Beta at `d52aa01` | Signed/notarized Apple Silicon beta-42 build succeeds |

One opt-in Rust performance benchmark remains intentionally ignored; the normal
search smoke test passes. No gate was disabled. The first September 6 verification
attempt overlapped a native build in the same worktree: the build replaced `dist`
assets while Rust doctests were reading them. The complete serial rerun above
passed. Do not run those builds concurrently in one worktree.

Durable remote evidence:
[develop CI](https://github.com/0xMassi/stik_app/actions/runs/33983636421),
[PR CI](https://github.com/0xMassi/stik_app/actions/runs/33983638232),
[beta build](https://github.com/0xMassi/stik_app/actions/runs/33983636769), and
[beta-42](https://github.com/0xMassi/stik_app/releases/tag/beta-42).
Those runs predate the `e72f17a` shutdown fix and are not its verification.

Local logs are under the original checkout's ignored `.internal/` directory:
`beta090-verification.log`, `beta090-baseline.log`, `beta090-native.log`, and
`beta090-setup.log`. Disposable native data is in `.internal/beta090-profile/`.

## Prior native checks and unresolved observation

The September 5 session observed these checks on isolated data:

- An immediate edit followed by native Cmd+Q saved the final draft; relaunch
  displayed the persisted content.
- Making only the scratch note folder unwritable cancelled Quit, retained the
  live draft, and left the prior file unchanged. Restoring permissions allowed
  editing and a successful Quit retry.
- A disposable diagnostic bundle withheld generation 1 save acknowledgements.
  After 30 seconds, Quit cancelled and editing resumed; generation 2 saved and
  exited. The deliberate fault was removed and never committed.
- The clean `e72f17a` develop bundle saved a pinned draft when Cmd+Q arrived
  before the autosave debounce elapsed.
- **Unresolved:** Finder Open With showed an empty viewing editor for a nonempty
  scratch Markdown file. The file remained intact. Backend payload/DOM state
  were not captured at the moment of failure, so its cause is not established.
  Passing unit tests do not resolve this native observation.

The old temporary QA directory and logs disappeared before the resumed session.
These are prior-session observations, not currently inspectable artifacts. The
committed implementation survived; uncommitted characterization tests and draft
documentation did not. September 6 tests use a new persistent scratch profile.

## Remaining release gates

- Reproduce and explain or fix the empty Finder-view observation; verify file
  content before and after opening, editing, saving, and relaunching.
- Complete native multi-window shutdown checks and record final-revision CI.
- Obtain an approving maintainer review for
  [PR #101](https://github.com/0xMassi/stik_app/pull/101); required review is not
  bypassed by local ownership or an agent's review.
- Use a disposable OS account/test Mac for iCloud offline/reconnect, Keychain/
  biometrics, logout, permissions, and microphone behavior. The Dev profile
  intentionally disables these integrations and cannot establish their safety.
- Native macOS 14/Intel UI acceptance, both signed/notarized release DMGs, and
  previous-stable updater/Homebrew checks remain outstanding. Intel CI is not
  a notarized release or a replacement for UI acceptance.
- VoiceOver and the full locale/theme/reduced-motion matrix remain unverified.

Only after release gates are satisfied: synchronize version files and changelog
to 0.9.0, merge the approved PR to main, build a stable draft from its tag, inspect
both architectures and updater assets, then publish. No stable tag, main merge,
or 0.9.0 publication has been performed.
