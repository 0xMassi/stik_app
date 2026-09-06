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
- `ce4530d`: changing Vim mode or text direction now preserves the current draft
  rather than remounting the editor with its original text. Viewing-window IDs
  now preserve distinct file paths, including spaces, periods, nested folders,
  Unicode, and URL delimiters, using the existing base64 dependency.
- `04f12eb`: the full editor refreshes folder/note navigation and active search
  on native focus and external-file/iCloud events, without replacing its live
  draft. Native QA had shown an old title after another window saved. The new
  title now appears on returning to the editor, without restarting.

The old editor-only coordinator's two tests were replaced by five coordinator
tests retaining authentication and failed-save retry coverage and adding
multi-window, generation, timeout, and readiness checks. Twenty-four
real-CodeMirror PostIt tests protect the consolidated save/close behavior; four
additional cases cover settings changes and subsequent saving in capture,
pinned, viewing, and deliberately cleared viewing notes.

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

### Verification after the additional fixes

`./scripts/verify.sh` passed on `ce4530d` content in 80 seconds: **230 frontend,
141 Rust, and 43 Swift tests**, plus the required build, platform, bundle,
formatting, and strict Clippy gates. The isolated worktree reused an idle Rust
cache; no other build ran against that cache concurrently. See
`.internal/beta090-final-verification.log`.

Regression sensitivity was observed, not inferred: all four new settings tests
failed before the fix (drafts became blank or reverted), then all 28 PostIt tests
passed. Both new identity tests failed before encoding (five distinct paths
collapsed into one ID; query delimiters remained unsafe), then passed. The
red/green logs are `.internal/beta090-settings-{red,green}.log` and
`.internal/beta090-window-ids-{red,green}.log`. No tests were removed or weakened.
An independent source review found no new startup/image or persisted-ID contract
regression in these two fixes. This is not native acceptance of the unexplained
first-open blank viewer.

### Cross-window refresh verification

The four navigation regression cases failed on `9687563`, then passed with the
fix: native focus, local-file events, iCloud events, and an active search. The
first three also retain and subsequently save a live CodeMirror draft. No test
was removed. An independent review identified an unnecessary overlapping Trash
refresh; that addition was omitted rather than expanding this fix. Navigation
refresh does not reload the active document or resolve concurrent edits to the
same file.

Full verification passed in 37 seconds: **234 frontend, 141 Rust, and 43 Swift
tests** (418 total), plus build/platform/bundle/format/strict-Clippy gates. After
omitting the unrelated Trash refresh, all 21 affected editor tests passed again.
The complete suite then passed again on exact `04f12eb` source in 31 seconds.
Logs: `.internal/beta090-refresh-{red,green,verification}.log` and
`.internal/beta090-04f12eb-verification.log`.

The actual `develop` worktree was fast-forwarded to `04f12eb`, built using
`STIK_DEV_ROOT=…/.internal/beta090-profile ./scripts/build-dev.sh qa`, and passed
`codesign --verify --deep --strict`. This is an ad-hoc-signed debug bundle, not a
notarized release. Build/startup evidence is in
`.internal/beta090-refresh-native.log`; startup reported 63 ms on this local Mac.

## Native acceptance on September 6

All data below is disposable and confined to `.internal/beta090-profile/`.

| Flow | Observed result |
| --- | --- |
| Full editor, edit then immediate native Cmd+Q | Final Markdown persisted; relaunch listed the correct title/body (`9687563`) |
| Viewing note, change Vim and text direction | Edited text survived both remounts, then Esc saved the correct Markdown (`9687563`) |
| Finder Open With, explicitly selected Dev bundle | Nonempty scratch Markdown opened with the correct content; file association was not changed (`9687563`) |
| Full editor list after viewing-window save | Old title reproduced on `9687563`; new title appeared without restarting on `04f12eb` |
| Trash and restore | Scratch note disappeared into recoverable Trash, restored, and reopened with the exact original body (`04f12eb`) |
| Pin, edit then immediate Cmd+Q with full editor open | Process exited successfully; pinned JSON and restored native window contained the final draft (`04f12eb`) |
| Unpin to capture | Text transferred intact; pinned record removed (`04f12eb`) |
| Capture, edit then immediate Cmd+Q with full editor open | Process exited successfully; a new Markdown file contained the final text and reopened in the full editor (`04f12eb`) |
| Failed-save Quit and retry | Scratch folder mode 555 caused Permission denied; Quit cancelled, draft remained editable, old file stayed intact. Restoring the original mode 755 and editing again saved the newer text on Quit (`04f12eb`) |

Additional logs: `.internal/beta090-refresh-relaunch.log` and
`.internal/beta090-final-qa.log`. Exact scratch content can be inspected in
`notes/Beta QA/` and `config/sticked_notes.json` under the profile. The pinned
store is empty after successful unpinning. Native checks exercised each window
type, but not every combination of simultaneous dirty windows or OS integration.

Automation occasionally returned stale accessibility indexes or left a native
menu open. Refreshing state, dismissing the menu through its accessibility
action, selecting the running bundle ID, and using keyboard menu navigation
allowed testing to continue. These errors do not establish another person was
interfering. One failed Finder menu action created a ZIP of the disposable
fixture; it remains in the ignored scratch directory, not the repository or
personal notes.

CI and the signed/notarized Apple Silicon beta build at `9687563` completed:
[develop CI](https://github.com/0xMassi/stik_app/actions/runs/34033567322),
[PR CI](https://github.com/0xMassi/stik_app/actions/runs/34033568992),
[beta build](https://github.com/0xMassi/stik_app/actions/runs/34033567522), and
[beta-44](https://github.com/0xMassi/stik_app/releases/tag/beta-44).
Beta-44 predates the navigation fix. CI/beta runs for `04f12eb` were still running
when this section was written; check the PR before treating them as passed.

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
- September 6 Finder/search/viewing and relaunch checks passed, but the old
  September 5 blank-view observation lacks diagnostic evidence and a confirmed
  explanation. Do not claim it fixed solely from non-reproduction.
- Record final-revision CI and beta artifact inspection. The native checks above
  are representative acceptance, not exhaustive coverage of all window states.
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
