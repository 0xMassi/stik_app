# Stik Mobile & Sync — plan

> Status: revised twice — once by hand, once by a six-lens audit of the
> codebase that produced 30 verified gaps. Nothing built yet.
> Several claims in the first draft were wrong; those sections say so inline.
> **Phase 0 is new and it gates everything.**
> Last updated: July 30, 2026

**Target:** one React Native app for iOS and Android, visually aligned with
desktop, quick capture as the core loop, iPhone Action button support, and an
end-to-end encrypted sync sold at €4.99. Desktop, both mobile platforms, and
cloud ship together as **1.0**.

---

## Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Expo (bare workflow) | Needs custom native modules for App Intents and SAF, so bare rather than managed |
| Components | [react-native-reusables](https://github.com/founded-labs/react-native-reusables) | The shadcn/ui port for RN — same component names, same copy-paste model |
| Styling | [NativeWind](https://www.nativewind.dev) | Tailwind for RN, so desktop class names carry across |
| Editor | a new `@stik/editor` package in a WebView | The `WebEditor/` fork is stale and its host bridge is WKWebView-only — see Phase 0 |
| Crypto | libsodium via `react-native-libsodium` | Audited primitives; do not hand-roll. Desktop has no matching half yet — `Cargo.toml` carries `aes-gcm` only |
| Builds | EAS | Signed iOS/Android builds without local Xcode/Gradle babysitting |

**shadcn/ui itself does not run in React Native** — it is React DOM plus Radix.
`react-native-reusables` is the faithful equivalent and is what "using shadcn
for components" means on this platform.

**shadscan covers the WebView editor, not the RN tree.** It ships web adapters
and reads DOM output, so it stays pointed at `WebEditor/` (which is real DOM and
benefits from it). The RN surface gets `eslint-plugin-react-native-a11y` plus
Maestro flows — the same intent, different instrument.

## Design alignment

Desktop themes live in `src/themes/index.ts` as space-separated RGB triples
(`bg: "255 252 249"`) consumed through CSS variables. Nine built-in themes.

Extract them once into a shared `@stik/tokens` package emitting both:
- CSS variables for desktop and the WebView editor
- a NativeWind theme object for the RN app

One source, so a palette change reaches all three surfaces. The `WebEditor`
bundle consumes the CSS-variable form already, so tokens are the one part of it
that does carry over untouched.

## Reusing the existing scaffold

`~/Developer/stik` is not wasted on the React Native path:

- **`Intents/QuickCaptureIntent.swift` is the declaration half of the Action
  button**, and App Intents must be Swift on any stack, so it survives. It does
  not move "unchanged": the intent only sets a UserDefaults flag
  (`QuickCaptureIntent.swift:10`) and both its consumers live in the SwiftUI
  layer being discarded (`StikApp.swift:12-25`, `AppViewModel.swift:95-98`). The
  RN app has to re-implement the consumer — a native module that reads and clears
  the flag on `AppState` active and routes to capture. Nothing can write a note
  while the JS bundle is unloaded, so a true background capture needs the write
  in Swift.
- **`Models/NoteFilename.swift` is a consumer to fix, not the reference.** It
  disagrees with `notes.rs:45-69` on 3 of 4 test inputs: newlines
  (`CharacterSet.whitespaces` excludes U+000A), combining marks
  (`alphanumerics` includes them, `is_alphanumeric` does not), and truncation
  (40 graphemes vs Rust's 40 **bytes**). `notes.rs:72` is the sole authority for
  the `YYYYMMDD-HHMMSS-<slug>-<4char-uuid>.md` contract; port the TypeScript
  from it and fix the Swift.
- **`Services/CloudContainer.swift` is the storage answer** — though not the
  entitlements sitting next to it. Its `setCustomLocation` takes a user-picked
  folder and holds a security-scoped bookmark. See "Storage" below for why that
  matters more than the ubiquity container does.
- **`Design/StikColors.swift`** confirms the token values already ported once.

**`WebEditor/` cannot be lifted wholesale — it is already a stale fork.** It
carries 9 CodeMirror modules. Desktop `src/extensions/` has those same 9 plus
`cm-a11y.ts`, `cm-bidi.ts`, `cm-vim.ts` and `cm-block-widgets.ts`, and it keeps
gaining more. Copying the directory again only resets the drift clock. Give it
the same treatment as the tokens: one `@stik/editor` package that desktop and
the WebView both build from.

What is discarded: the SwiftUI views and view models. Roughly 20 of 28 files.

## Platform integration

**iPhone Action button** — a Swift native module exposing `QuickCaptureIntent`
and `StikShortcuts`, bridged to RN so `perform()` deep-links into the capture
screen. Requires iPhone 15 Pro or newer; the intent is still declared on all
devices and reachable from Spotlight, Shortcuts, and the Lock Screen.

**Android** — a share-target intent (`ACTION_SEND` for text) plus a
quick-settings tile, both Kotlin, both thin.

**Storage** — local-first, same filename contract as desktop. The iCloud route
in the first draft was wrong, and the correction is worth spelling out because
it changes the iOS work.

Desktop does **not** use a ubiquity container. `storage.rs` resolves iCloud to
the generic iCloud Drive folder,
`~/Library/Mobile Documents/com~apple~CloudDocs/Stik`, and the comment there
explains the choice: a dedicated container needs
`com.apple.developer.icloud-container-identifiers` and a provisioning profile,
which stopped ad-hoc signed builds from launching in v0.7.7.

The iOS scaffold's entitlements do the opposite. They declare
`iCloud.com.0xmassi.stik` as a ubiquity container with
`NSUbiquitousContainerName = Stik`. That is a separate backing store, so notes
written by desktop never appear in it — and since the container publishes its
document scope, it surfaces in iCloud Drive under the same display name desktop
already creates. Two folders called "Stik", one of them permanently empty.

iOS also has no API for arbitrary `com~apple~CloudDocs` paths. The only
supported way into desktop's folder is `UIDocumentPickerViewController` plus a
security-scoped bookmark, which `CloudContainer.setCustomLocation` already
implements.

So: **drop the iCloud entitlements and make user-picked-folder-plus-bookmark the
primary path on iOS.** Android's Storage Access Framework has the same shape, so
both platforms end up sharing one mental model and one onboarding screen, and
neither depends on a provisioning profile.

## Stik Cloud

Client-side encryption; the server stores ciphertext and never holds a key.

**Keys.** The first draft said "passphrase → Argon2id → master key", and that
shape cannot support its own feature list: if the master key *is* the Argon2id
output, enrolling a second device, changing the passphrase, and having a
recovery key at all are each impossible without re-wrapping every note.

The envelope has to be: a **random** master key, wrapped independently by a
passphrase-derived KEK and by a recovery-key-derived KEK. Both wrapped copies
live server-side; changing the passphrase rewraps one 32-byte blob and touches
no notes. Per-note keys are wrapped by the master key. Still to specify: where
the per-account salt and the Argon2id `(t, m, p)` parameters live, and how a
fresh device fetches them before it can authenticate.

Argon2id also has no desktop half today. `Cargo.toml` carries `aes-gcm` and
nothing else; `note_lock.rs:57-62` uses AES-256-GCM with a 12-byte nonce and a
random, underived key, while the storage model above already assumes
libsodium's 24-byte nonce and 16-byte MAC. Pick the parameters against the
weakest phone that must survive them, then implement the same envelope twice.

Zero-knowledge means **no password reset is possible**. A recovery key is
generated at signup and the copy around it has to be blunt: lose both and the
notes are gone. Note the term is already taken: Settings ships an "Export
recovery key" button for the *local* note lock
(`SettingsContent.tsx:400-405`) that has no import counterpart anywhere, so
"I have my recovery key" is already an ambiguous support ticket. Rename one of
them.

**Names leak, and the plan encrypted only contents.** `generate_slug`
(`notes.rs:45-69`) puts the note body's first five words into the filename, and
folder paths are user-authored taxonomy. Key objects by their relative
`<Folder>/<filename>.md` path and the server holds a per-note content summary,
a local-time creation stamp, and the user's whole folder tree in cleartext —
before a single byte of ciphertext is written. Local filenames must stay
human-readable for Finder and Obsidian, so the fix is indirection: opaque
object IDs, with the name ciphertext carried inside the encrypted payload.
Cheap to decide during the Phase 4 envelope step; a client-driven re-upload
afterwards.

**Conflicts.** Two devices editing offline is the normal case, not the edge
case. Last-write-wins silently destroys work, and per-note CRDTs are heavy for
markdown. Plan: per-note version vectors, and on divergence write a conflict
copy beside the original — the same thing Obsidian does, and users understand
it.

**Deletions.** There is no trash and no note history anywhere in
`src-tauri/src/commands/` — deleting a note unlinks the file, and
`versioning.rs` is JSON schema migration for settings, not note history. Absent
tombstones, "deleted on the phone" and "not yet downloaded to the phone" look
identical from the server, which is precisely how sync engines end up deleting
everything. Tombstones with a retention window are required. A desktop trash
should land **before** sync rather than after: this plan names a note-losing
sync bug as the top risk, then proposes nothing that makes such a bug
survivable.

**Locked notes cannot sync today, and can already be lost.** `note_lock.rs`
encrypts with a random 32-byte key at `~/.stik/note-key`; Touch ID is only the
access gate, and the key is not derived from anything. It is device-local, and
`~/.stik` sits outside the notes folder, so it never travels. A locked note is
undecryptable on any other machine right now, and losing the Mac loses it
permanently — a live desktop risk, not a mobile one. Pick one before Phase 4:
derive the lock key from the passphrase-derived master key, move to a per-note
passphrase, or exclude locked notes from sync and say so plainly in the UI.

**Attachments.** `notes.rs` writes images to `<Folder>/.assets/<uuid>.<ext>`,
so sync carries binaries and not only markdown. This moves the cost model more
than anything else in this document — see the note under the storage table.

**Billing.** €4.99/month. Apple takes 15% under the
[Small Business Program](https://developer.apple.com/app-store/small-business-program/)
(under $1M proceeds, 10% in the EU after year one), so roughly €4.24 net.
Google is comparable. Desktop can bill directly through Stripe. Ship
per-platform IAP first — external-link entitlements are jurisdiction-dependent
and not worth blocking 1.0 on.

See the unit economics below — storage is not the constraint.

## Unit economics on Hetzner

Prices as of July 2026, ex-VAT.
[Object Storage](https://www.hetzner.com/storage/object-storage/) is €4.99/mo
including 1 TB of storage and 1 TB of egress (additional storage €5.99/TB);
[cloud servers](https://www.hetzner.com/pressroom/new-cx-plans/) were CX22
€4.49 and CPX11 €5.49 with 20 TB traffic included.

**Caveat: Hetzner raised prices twice in 2026** — roughly 20–30% in April, then
[up to 3.1× on cloud servers in June](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/).
Everything below is also computed at that worst case. Re-verify at order time.

### Storage per user

Markdown at ~2 KB per note, ×1.05 for AEAD overhead (24-byte nonce, 16-byte
MAC, wrapped per-note key), ×3 for retained versions and conflict copies. The
×3 assumes the version history proposed above, since none exists today:

| user | notes | stored |
|---|---|---|
| light | 200 | 1.2 MB |
| median | 1,000 | 6.2 MB |
| heavy | 10,000 | 61.5 MB |
| extreme | 50,000 | 307.6 MB |

At a generous 10 MB average, the €4.99 base tier holds **~105,000 users**. At
100 MB average it still holds ~10,500.

**Attachments break every number above, and they are the only thing that can.**
One phone photo at 2–5 MB outweighs a thousand notes. Someone who pastes 200
screenshots stores an order of magnitude more than the "extreme" row, and
end-to-end encryption leaves the server unable to tell a note from a 100 MB
video. Text is free. Binaries are the whole cost model. Two things are needed
before anyone is billed: a per-account quota enforced server-side against
ciphertext size, and a decision on whether attachments sync at all below the
paid tier.

### Egress

A sync pulls changed notes. Fifty changed notes a day is ~2.9 MB/user/month, so
the included 1 TB covers **~350,000 users**. Full-restore events are rare and
tens of MB.

**Neither storage nor bandwidth is a cost driver at any plausible scale.**

### Infrastructure floor

| item | €/mo | worst case |
|---|---|---|
| Object Storage (1 TB + 1 TB egress) | 4.99 | 4.99 |
| app server (CPX11) | 5.49 | 17.02 |
| db server (CX22) | 4.49 | 13.92 |
| snapshots + backup bucket | 2.00 | 2.00 |
| **total** | **16.97** | **37.93** |

### Net per subscriber

| plan | gross | Apple/Google 15% | Stripe (1.5% + €0.25) |
|---|---|---|---|
| monthly | €4.99 | €4.24 | €4.67 |
| yearly | €49.99 | €42.49 (€3.54/mo) | €48.99 (€4.08/mo) |

Yearly options, against €59.88 at monthly rates:

| price | discount | effective/mo | net/mo after Apple |
|---|---|---|---|
| €49.99 | 17% | €4.17 | €3.54 |
| €47.99 | 20% | €4.00 | €3.40 |
| €44.99 | 25% | €3.75 | €3.19 |

**€49.99/yr is the recommendation** — it reads as "two months free", and it is
the same shape as Obsidian Sync ($4/mo vs $40/yr), which is the comparison
people will make.

### Break-even and margin

Even at worst-case Hetzner pricing: **9 monthly subscribers, or 11 yearly.**

| subscribers | stored | revenue/mo | infra/mo | margin |
|---|---|---|---|---|
| 100 | 1.0 GB | €354 | ~€39 | 89% |
| 1,000 | 9.8 GB | €3,541 | ~€44 | 99% |
| 10,000 | 97.7 GB | €35,410 | ~€98 | 99.7% |

### What actually costs money

Infrastructure is rounding error. The real costs, in order:

1. **Store commission.** 15% is €0.75/subscriber/month — at 1,000 users that is
   ~17× the entire infra bill. This is the largest line item by far, which is
   why web signup via Stripe is worth revisiting once 1.0 has shipped.
2. **Support, concentrated on lost recovery keys.** Zero-knowledge means an
   unrecoverable loss is a permanent, unfixable, angry ticket. Backups do not
   help — we cannot decrypt them either. This needs deliberate onboarding
   friction, not a dismissible dialog.
3. **Compliance.** GDPR, a DPA, and EU data residency. Hetzner being EU-based
   helps here rather than hurting.
4. **Your time** — the only genuinely scarce input.

The pricing is not the risk. A sync bug that loses notes is.

## Phase 0 — the desktop work sync depends on

A six-lens audit of the codebase against this plan produced 30 gaps that
survived adversarial verification. Most of them collapse into one sentence:
**desktop has no stable note identity and no metadata authority, so there is
nothing for a sync protocol to attach to.** These are desktop changes. They are
cheap now and a protocol migration later.

### Blocking

**A note has no identity.** The path *is* the key — `NoteIndex`
(`index.rs:27-30`) and `EmbeddingIndex` (`embeddings.rs:24-27`) are both keyed
by absolute path, cursor positions too (`cursor_positions.rs:43-46`), and
nothing inside the `.md` identifies it. The filename's 4-char uuid slice
(`notes.rs:76`) is 65,536 values with no existence check, so it is not an ID.

Consequently `move_note` (`notes.rs:386-420`) and `rename_folder`
(`folders.rs:239-269`) present to any path-keyed sync engine as bulk-delete plus
bulk-create. Rename a 5,000-note folder and whichever peer applies the
tombstones first deletes 5,000 live notes — exactly the failure this document
calls its top risk. `rename_folder` is also the present-day anchor: unlike
`delete_folder` (`folders.rs:206-210`) it repairs neither index, so `list_notes`
returns dead paths for up to 60s (`index.rs:56-68`) and the embedding map is
never repaired at all.

Fix: a stable per-note ID that survives moves, plus an explicit rename operation
in the protocol. Everything else in Phase 4 — per-note keys, version vectors,
tombstones — binds to it.

### High

| gap | anchor | why it has to be now |
|---|---|---|
| `created` is filesystem mtime and the list sort key | `index.rs:258-261`, sort at `:147`/`:187` | Any pull, restore, or iCloud download rewrites mtime, so every synced note reads "just now" and the list orders by download order. `move_note:443` and the iOS scaffold (`NoteStore.swift:42`) already use the filename prefix instead — two clients, two answers. Also no timezone (`index.rs:275-278`). Pick one authority. |
| Writes are non-atomic | `storage.rs:142` bare `fs::write` | A sync agent can read a half-written `.md` and upload it as the newest revision. The repo already does tmp+rename for its JSON stores (`cursor_positions.rs:30-33`), and iCloud mode is coordinated — only the default path is not. |
| The watcher has no self-write suppression | `file_watcher.rs:49-55`, `102-118` | Every write the sync agent makes is re-read and re-broadcast as a user edit. Agent and app echo each other over the same files. |
| Bulk writes are a processing storm | `file_watcher.rs:102-118` → `embeddings.rs:223-246` | Each landed note costs two serialized DarwinKit RPCs through one bridge thread, plus a full rewrite of the ~4KB/note `embeddings.json` per debounce batch. Ungated by `ai_features_enabled`, sidecar started unconditionally (`main.rs:591-597`). The Phase 4 restore drill stalls on the client, not the network. Needs a bulk-import mode. |
| The synced set is undefined | `index.rs:200-219` | The only exclusion rule skips all dot-directories — which excludes the `.assets/` this plan requires syncing. Include dot-dirs and `.git` comes too, and under the `stik_root` git layout (`git_share.rs:402`) that `.git` is at the Stik root and `git add -A` stages it (`:504`). |
| `git_share` is a second sync engine on the same tree | `notes.rs:142`, `git_share.rs:16`, `:535`, `:629-633` | It pushes **plaintext** notes to a third-party remote on a 30s debounce fired from every save, and resolves conflicts with `git pull` plus `git checkout --theirs`. The plan never mentions it. Decide what happens when both are on. |
| The WebEditor host bridge is WKWebView-only | `WebEditor/src/index.ts:65-70` | `window.webkit.messageHandlers` with optional chaining — a silent no-op off WKWebView. Under `react-native-webview` the editor mounts, accepts typing, and never persists a keystroke. Needs a host-agnostic bridge; nothing currently calls the synchronous `getContent`, so it is a shim, not a rewrite. |
| Neither mobile platform has change detection | `CloudContainer.swift:126,176-194` | The plan makes picked-folder/SAF the primary path and designs version vectors on top, but never says how a client notices a file changed. The scaffold's watcher is a single **non-recursive** DispatchSource on `Stik/`, blind to `Stik/<Folder>/*.md` — the only place notes go. Android SAF exposes no mtime or size on a `content://` tree. |

### Medium — worth a line each

- **Locking leaves a plaintext shadow.** `lock_note` (`note_lock.rs:253-274`)
  never purges the note's embedding, unlike `delete_note` and `move_note`. A
  locked note's content-derived vector sits in cleartext in
  `~/.stik/embeddings.json` indefinitely. `build_embeddings` deliberately skips
  locked notes, which confirms this is an oversight rather than a policy.
- **"Empty content" is the delete command** (`notes.rs:291-302`), and the two
  definitions of empty disagree: Rust treats a `<br>`-only buffer as empty and
  deletes; TypeScript (`normalizeMarkdownForCopy.ts:9-11`) treats it as content
  and saves. Any conflict-copy writer that PUTs empty content deletes the note.
- **Folder names have no case or normalisation policy** (`folders.rs:134-154`),
  while folder identity is an exact-case string used for filtering
  (`index.rs:143`) and as the settings key for colours and icons. APFS is
  case-insensitive; Android and object stores are byte-exact.
- **Every `~/.stik` store is keyed by absolute path** with no remap when the
  root changes — `icloud_migrate_notes` (`icloud.rs:126-164`) rebuilds
  `NoteIndex` only, orphaning embeddings and cursor positions on every iCloud
  toggle today.
- **Pinned stickies hold unsaved capture text in JSON**
  (`sticked_notes.rs:7-15`), becoming `.md` only on close. Decide whether a
  pinned sticky is a synced note or a device-local scratchpad.
- **Mobile has no search or index story.** Desktop re-reads every `.md` under
  the root when its index is >60s stale (`index.rs:200-223`). Phase 2 says only
  "wired to local storage" — the phone needs a real local database.

## Release engineering

Three platforms do not fit the pipeline that exists.

**The updater feed and the tag namespace collide.** `tauri.conf.json:82` points
the desktop updater at GitHub's `releases/latest`, and `release.yml:3-6` fires
the whole macOS notarize → Homebrew → Vercel pipeline on any `v*` tag. So in a
monorepo: the first non-prerelease mobile release becomes `releases/latest`, its
asset set has no `latest.json`, and every desktop install's update check 404s —
silently, because `App.tsx:333-335` only `console.error`s — until the next
desktop release restores the feed. And a mobile-only `v1.0.1` still matches
`v*`, so it re-notarizes macOS, rewrites the Homebrew cask sha256
(`release.yml:174`) and redeploys the landing page (`:231`), shipping a
no-change desktop update. Decide the tag namespace and the feed URL before any
mobile tag exists.

**No CI runs tests.** `.github/workflows/` is `release.yml` and `beta.yml`, and
neither runs `npm test` or `cargo test` — `release.yml` goes from `npm ci`
straight to notarization. This plan makes TS↔Rust filename parity a Phase 1
deliverable, the one contract keeping phone and Mac round-tripping, and never
schedules the CI that would run it. `ROADMAP.md:103` already calls PR CI the
highest-value fix in the repo and blocking for 0.9.

**The release gate is stale.** `RELEASE_CHECKLIST.md` is pinned to v0.4.0
against 0.8.0, claims 38 automated tests where `ROADMAP.md:120` counts 162, and
has 189 of 190 boxes pre-ticked — a record, not a template. Its 21 sections
cover nothing from 0.5–0.8: no AI menu, dictation, clip capture, note locking,
file watching, or i18n. It cannot be the gate for a three-platform 1.0.

Sync also needs a test harness, and one is cheaper than it looks:
`save_note_inner` (`notes.rs:95`) is `pub` and callable from `cargo test`, and
the Raycast extension already drives desktop note writes at the filesystem
level.

## Store and legal requirements

None of this is hard. All of it blocks submission, and none of it appeared in
the first draft.

| requirement | why | where |
|---|---|---|
| In-app account deletion | App Store 5.1.1(v), mandatory once accounts exist | both apps |
| `ITSAppUsesNonExemptEncryption`, French encryption declaration, US BIS self-classification | the app ships crypto | iOS submission |
| `PrivacyInfo.xcprivacy` and a privacy policy URL | required for the app and every third-party SDK | iOS — the repo has neither today |
| Play data safety form, Play Console account (US$25 once), release keystore | Android parity | Android |
| Server-side receipt validation, StoreKit 2 and Play Billing | the entitlement has to be checked somewhere trustworthy | Track C |
| Store price tiers for €4.99 and €49.99 in every currency sold | Apple picks the tiers, you do not | Track C |

The subscription check needs an account identity tied to the purchase while the
content stays unreadable. That combination is fine — entitlement and encryption
are separate concerns — but it wants designing rather than discovering.

Track C also cannot start without two decisions the draft never made: what the
app server runs, and whether auth is hand-rolled or hosted.

## Getting all of it into one 1.0

Three tracks run in parallel; only one is on the critical path.

| Track | Rough size | Depends on |
|---|---|---|
| A — RN app shell, capture, list, editor host, local storage | ~3 weeks | tokens package |
| B — native modules: App Intents, SAF, share target, tile | ~2 weeks | Track A shell |
| C — **Stik Cloud: auth, storage, E2E, billing, conflicts** | **~6–8 weeks** | nothing |
| D — desktop feature work | continuous | nothing |

**Track C is the critical path and it is roughly triple the others.** For a
single 1.0 the plan has to be built around that, not around the app:

1. Start C first and in parallel with A — it gates the date.
2. Land the tokens package early; A and D both consume it.
3. Put cloud sync behind a feature flag from day one, so an unfinished
   backend does not block shipping the app binaries.
4. Define one cut line: **if C is not in beta by the time A and B are done,
   1.0 ships with local + iCloud/SAF sync and cloud follows as 1.0.1.** That
   keeps a single 1.0 without the release sliding indefinitely behind the
   backend.

**The cut line is asymmetric, and the first draft hid that.** SAF is a
folder-permission grant plus local file I/O; it carries nothing off the device.
Under the fallback, iOS still reaches desktop notes through the picked-folder
bookmark aimed at iCloud Drive — Android reaches nothing. A cut-line 1.0 ships
an Android app with no path to the desktop's notes at all. Either accept that
explicitly, or give Android a Google Drive / Dropbox folder target as its
fallback.

Add Track 0 ahead of all of them: the desktop foundations above. A and C both
assume a note has an identity, and today it does not.

The honest risk in shipping everything together is that the encrypted sync is
the part that must not be rushed — it is the one component where a bug loses
user data permanently and unrecoverably. The flag plus the cut line is how the
single-release goal survives contact with that.

## Repo state today

Housekeeping that Phase 0 inherits, as of July 30, 2026:

- Local `main` sits 4 commits behind `origin/main` and holds one unpushed
  commit — `4c0f015`, the cm-a11y VoiceOver work, 3 files. Rebase and push it
  first, or it collides with the i18n fixes that landed as #81–#84.
- Four branches unmerged: `develop`, `fix/shadscan`,
  `fix/placeholder-locale`, and this one.
- Uncommitted work in the tree: `src/components/EditorWindow.tsx` untracked,
  plus 9 modified files across `src-tauri/` and `src/`.
- Version is still 0.8.0. The v0.9 hardening set never landed.
- **The Apple Developer Program agreement is expired.** It blocks notarization,
  which blocks the v1.0 tag, TestFlight, and every EAS iOS build. Only the
  Account Holder can clear it at developer.apple.com → Membership →
  Agreements, and it is the single item here that depends on someone outside
  the repo.

Zero open PRs and zero open issues, so nothing is queued behind review.

## Sequenced work

**Phase 0 — desktop foundations** *(gates everything; see the section above)*
- PR CI running `npm test` and `cargo test`, before anything else
- Stable per-note ID surviving moves and folder renames; `rename_folder` repairs
  both indices
- One authority for `created`, with a timezone
- Atomic note writes (tmp+rename) and self-write suppression in the watcher
- Bulk-import mode: watcher suppressed, embedding deferred and gated
- Decide the synced set, and what happens when `git_share` is also enabled
- Trash and note history, so a sync bug is survivable

**Phase 1 — foundations (parallel with Phase 4)**
- `@stik/tokens` extracted from `src/themes/index.ts`
- `@stik/editor` extracted from `src/extensions/` — 13 modules, ~2,970 lines,
  13 imports in `Editor.tsx` and 2 in `PostIt.tsx`, 27 test files to keep green.
  A desktop refactor, not a copy, and it was unestimated in the first draft
- Host-agnostic WebView bridge for the editor
- Expo bare project, NativeWind, react-native-reusables
- TypeScript port of the filename contract from `notes.rs:72`, with tests
  asserting parity against Rust fixtures — and the Swift port fixed to match

**Phase 2 — capture loop**
- Capture screen, note list, folder navigation
- `WebEditor` bundle in a WebView, wired to local storage
- iOS iCloud module; Android SAF module

**Phase 3 — platform surfaces**
- App Intents module reusing `QuickCaptureIntent.swift`; Action button assignment
- Android share target and quick-settings tile
- Maestro flows for capture from cold start on both platforms

**Phase 4 — Stik Cloud** *(starts at day one, not after Phase 3)*
- Auth and account
- E2E envelope: Argon2id, per-note keys, recovery key
- Sync engine, version vectors, conflict copies
- IAP on both stores, Stripe on desktop
- Restore-from-scratch drill on a clean device before this is called done

**Phase 5 — 1.0**
- Desktop, iOS, Android, cloud behind a flag flipped on when Phase 4 clears
- Apple Developer Program agreement signed (currently expired and blocking
  every notarized build)

## Open questions

1. ~~€4.99 monthly, or yearly at a discount?~~ Both — €4.99/mo alongside
   €49.99/yr, per the economics above. Confirm the yearly figure and this one
   is closed.
2. Free tier: does no-account sync (iCloud on iOS, SAF on Android) stay
   permanently, or become a trial?
3. One repo or two? A monorepo shares `@stik/tokens` and the editor package
   cheaply; a separate repo keeps mobile release cycles independent.
4. Is the Phase 4 cut line above acceptable as the fallback for holding the
   single-1.0 goal?
5. Locked notes: derive the key from the master key, switch to a per-note
   passphrase, or exclude them from sync?
6. Do attachments sync, and what is the per-account quota?
7. Does desktop get trash and version history before sync ships, or does sync
   go out without a safety net?
8. What is a note's stable ID, and where does it live — YAML frontmatter in the
   `.md` (visible to Obsidian, survives copies) or a sidecar index (invisible,
   but breaks when a file is moved outside the app)?
9. Which `created` wins: the filename prefix, or metadata inside the file?
10. Is `git_share` allowed alongside cloud sync, or mutually exclusive?
11. One `v*` tag namespace or per-platform prefixes, and what URL does the
    desktop updater point at once mobile releases exist?
12. Does Android get a fallback sync target under the cut line, or does it ship
    local-only?
