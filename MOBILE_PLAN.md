# Stik Mobile & Sync — plan

> Status: draft for review. Nothing built yet.
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
| Editor | existing `WebEditor/` CodeMirror bundle in a WebView | Already built, already matches desktop behaviour |
| Crypto | libsodium via `react-native-libsodium` | Audited primitives; do not hand-roll |
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
(`bg: "255 252 249"`) consumed through CSS variables. Ten built-in themes.

Extract them once into a shared `@stik/tokens` package emitting both:
- CSS variables for desktop and the WebView editor
- a NativeWind theme object for the RN app

One source, so a palette change reaches all three surfaces. The `WebEditor`
bundle already consumes the CSS-variable form, so it needs no change.

## Reusing the existing scaffold

`~/Developer/stik` is not wasted on the React Native path:

- **`Intents/QuickCaptureIntent.swift` moves into the RN app's iOS native
  module unchanged.** App Intents must be declared in Swift on any stack, so
  this file is the Action button implementation regardless of what renders the
  UI.
- **`Models/NoteFilename.swift` is the reference** for the TypeScript port of
  `YYYYMMDD-HHMMSS-<slug>-<4char-uuid>.md`. Round-tripping with desktop
  depends on matching `generate_filename` in `notes.rs` exactly.
- **`WebEditor/`** is lifted wholesale.
- **`Design/StikColors.swift`** confirms the token values already ported once.

What is discarded: the SwiftUI views and view models. Roughly 20 of 28 files.

## Platform integration

**iPhone Action button** — a Swift native module exposing `QuickCaptureIntent`
and `StikShortcuts`, bridged to RN so `perform()` deep-links into the capture
screen. Requires iPhone 15 Pro or newer; the intent is still declared on all
devices and reachable from Spotlight, Shortcuts, and the Lock Screen.

**Android** — a share-target intent (`ACTION_SEND` for text) plus a
quick-settings tile, both Kotlin, both thin.

**Storage** — local-first, same filename contract as desktop. iOS reads and
writes the iCloud Drive `Stik/` folder through a native module (the ubiquity
container path desktop already uses). Android uses the Storage Access
Framework so an existing synced folder works with no account.

## Stik Cloud

Client-side encryption; the server stores ciphertext and never holds a key.

**Keys.** Passphrase → Argon2id → master key; per-note keys wrapped by it.
Zero-knowledge means **no password reset is possible**. A recovery key is
generated at signup and the copy around it has to be blunt: lose both and the
notes are gone.

**Conflicts.** Two devices editing offline is the normal case, not the edge
case. Last-write-wins silently destroys work, and per-note CRDTs are heavy for
markdown. Plan: per-note version vectors, and on divergence write a conflict
copy beside the original — the same thing Obsidian does, and users understand
it.

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
MAC, wrapped per-note key), ×3 for retained versions and conflict copies:

| user | notes | stored |
|---|---|---|
| light | 200 | 1.2 MB |
| median | 1,000 | 6.2 MB |
| heavy | 10,000 | 61.5 MB |
| extreme | 50,000 | 307.6 MB |

At a generous 10 MB average, the €4.99 base tier holds **~105,000 users**. At
100 MB average it still holds ~10,500.

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

The honest risk in shipping everything together is that the encrypted sync is
the part that must not be rushed — it is the one component where a bug loses
user data permanently and unrecoverably. The flag plus the cut line is how the
single-release goal survives contact with that.

## Sequenced work

**Phase 1 — foundations (parallel with Phase 4)**
- `@stik/tokens` extracted from `src/themes/index.ts`
- Expo bare project, NativeWind, react-native-reusables
- TypeScript port of the filename contract, with tests asserting parity against `notes.rs` fixtures

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

1. €4.99 monthly, or yearly at a discount?
2. Free tier: does no-account sync (iCloud on iOS, SAF on Android) stay
   permanently, or become a trial?
3. One repo or two? A monorepo shares `@stik/tokens` and the editor bundle
   cheaply; a separate repo keeps mobile release cycles independent.
4. Is the Phase 4 cut line above acceptable as the fallback for holding the
   single-1.0 goal?
