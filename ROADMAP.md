# Stik Roadmap

> Last updated: 2026-02-06 | Current version: 0.2.0 | License: MIT (Open Source)

Strategic feature roadmap based on competitive analysis, market trends, and user pain points in the quick-capture note space.

---

## Current Position

Stik occupies a unique intersection that no competitor fully covers:

| Capability | Stik | Tot | Drafts | Apple Quick Note | Antinote | SideNotes |
|---|---|---|---|---|---|---|
| Instant global shortcut capture | Yes | No | Partial | No | Yes | No |
| Folder organization | Yes | No (7 slots) | Tags | Folders | No | Folders |
| Local markdown files | Yes | No | No | No | No | No |
| Floating sticky notes | Yes | No | No | No | No | Partial |
| Open source | Yes | No | No | N/A | No | No |
| No account required | Yes | Yes | No | Apple ID | Yes | Yes |

**Defensible advantages:**
- Only app combining instant keyboard capture + post-it aesthetic + markdown file ownership + folder organization
- Local-first architecture (`~/Documents/Stik/`) enables sync via iCloud/Dropbox without building sync infrastructure
- Open source + no subscription + no account + no cloud dependency
- AI features powered by Apple's on-device frameworks = zero API costs, zero privacy trade-offs

---

## DarwinKit -- Apple Bridge Library (Separate OSS Project)

Multiple Stik features need access to Apple-native frameworks (NaturalLanguage, Vision, Speech, Foundation Models) from a Tauri/Rust backend. Instead of ad-hoc `objc` crate bridging for each feature, we build a **standalone Swift helper binary** that any Tauri or Rust app can use.

### What

A lightweight Swift CLI binary (`darwinkit`) that exposes Apple's on-device ML and system frameworks via JSON-over-stdin/stdout. Tauri/Rust apps spawn it as a subprocess and communicate via simple JSON messages.

### Why (Two Projects, One Effort)

1. **Stik benefits** — Every AI feature below (auto-folder, summarization, OCR, semantic search, voice transcription) uses DarwinKit instead of reinventing the bridge each time.
2. **Community benefits** — No good Tauri/Rust-to-Apple-ML bridge exists. Electron has `node-mlx`, Swift-native apps have direct access, but Tauri apps are stuck. DarwinKit fills that gap.
3. **Two GitHub repos, shared development** — Work done for Stik directly improves DarwinKit and vice versa. Contributors to either project help both.

### Apple Frameworks Exposed

| Framework | Capability | macOS Version | Stik Feature |
|---|---|---|---|
| **NaturalLanguage** (`NLEmbedding`) | Semantic similarity / search | 14+ | Related notes, auto-folder |
| **NaturalLanguage** (`NLTagger`) | Language detection, tokenization, part-of-speech | 13+ | Auto-tagging |
| **Vision** (`VNRecognizeTextRequest`) | OCR / text extraction from images | 13+ | Screenshot capture |
| **Speech** (`SFSpeechRecognizer`) | On-device speech-to-text | 13+ | Voice capture |
| **Foundation Models** | On-device LLM (3B param, Apple Intelligence) | 26+ | Clean up notes, smart suggestions |
| **UserNotifications** | Rich notifications | 13+ | On This Day, daily digest |

### Architecture

```
Stik (Rust/Tauri)                    DarwinKit (Swift)
    |                                     |
    |-- spawn process ------------------>  |
    |-- stdin: {"action":"embed",          |
    |           "text":"meeting notes"}    |
    |                                      |-- NLEmbedding.wordEmbedding
    |                                      |-- compute vector
    |<- stdout: {"vector":[0.1,0.2,...]}   |
    |                                      |
    |-- stdin: {"action":"ocr",            |
    |           "image":"/tmp/screen.png"} |
    |                                      |-- VNRecognizeTextRequest
    |<- stdout: {"text":"extracted..."}    |
```

**Protocol:** JSON-over-stdio (one JSON object per line). No networking, no sockets, no dependencies. The binary is bundled inside the `.app` bundle or installed separately.

**Fallback:** If DarwinKit is not available (older macOS, binary not found), Stik gracefully degrades — AI features are disabled, core capture works normally.

### Release Strategy

1. Build DarwinKit features incrementally as Stik needs them (OCR first, then NLEmbedding, etc.)
2. Publish as a separate GitHub repo (`darwinkit`) with its own README and examples
3. Distribute via Homebrew and as a pre-built universal binary (arm64 + x86_64)
4. Stik bundles the binary in its `.app` package for zero-config

---

## Tier 1 -- Quick Wins

Low-effort, high-return features that exploit existing infrastructure. Each is a 1-2 day sprint.

### 1.1 "On This Day" Resurfacing

**What:** Daily macOS notification showing a note from the same date in a previous year.

**Why:** Day One's most-loved feature. Creates an emotional hook no competitor in the quick-capture space has. Studies show autobiographical memory resurfacing uplifts mood.

**How:** Filenames already encode dates (`YYYYMMDD-HHMMSS-slug.md`). On app launch, query files matching today's month+day from prior years. Show via macOS notification center (via DarwinKit `UserNotifications`, or directly from Rust via `objc` crate).

**Effort:** Trivial. File date parsing already exists in `index.rs`. Add a check in `.setup()`.

---

### 1.2 Capture Streak

**What:** Count consecutive days with at least 1 captured note. Show in tray menu or as a subtle menu bar badge.

**Why:** Apps with streak mechanics see 40-60% higher DAU. Users with 7+ day streaks are 2.3x more likely to engage daily. Reduces 30-day churn by 35%.

**How:** On app launch, scan file dates to compute streak length. Store last-computed streak in `~/.stik/stats.json`. Display in tray menu: "5-day streak" with a small flame or dot.

**Effort:** Low. No new UI surfaces needed, just a tray menu item.

---

### 1.3 Share as Formatted Clipboard

**What:** One action to copy a note's content as rich text (for Slack/email) or raw markdown (for dev tools).

**Why:** Notes are currently trapped in the app. This makes Stik the starting point of a workflow, not a dead end. Table stakes for social/work sharing.

**How:** Add a "Copy" button or `Cmd+C` in viewing mode. Convert markdown to rich text using a Rust markdown parser, place both plain and rich text on the pasteboard via macOS NSPasteboard.

**Effort:** Low. Rust has `pulldown-cmark` for markdown-to-HTML, and Tauri can access the clipboard.

---

### 1.4 iCloud Sync (Documentation Only)

**What:** Explicitly document and market that Stik syncs across Macs via iCloud Drive (or Dropbox, Syncthing, etc.) with zero configuration.

**Why:** "No sync" is the #1 complaint about Antinote, SideNotes, Unfriction, and Noted. Stik already works with iCloud Drive if `~/Documents/` is synced. Zero engineering, pure marketing win.

**How:** Add a section to README, in-app Settings tooltip, and website (if applicable). Optionally, detect iCloud Drive in Settings and show a "Syncing via iCloud" indicator.

**Effort:** Documentation only. Zero code changes.

---

## Tier 2 -- Differentiators

Features that create real moat and address the biggest market gaps. Each is a 3-4 day sprint.

### 2.1 Voice Capture via Global Shortcut

**What:** Hold `Cmd+Shift+V` (configurable) to record voice. On release, audio is transcribed locally and saved as a markdown note.

**Why:** Voice-to-text capture is exploding (AudioPen, VoiceNotes, Mem 2.0, Superwhisper). But voice and text capture are always separate apps. A unified "type or speak into the same post-it" flow doesn't exist.

**How:** Use DarwinKit's `speech` action, backed by Apple's `SFSpeechRecognizer` (on-device mode, macOS 13+). Record audio via `AVAudioEngine`, stream to recognizer, return transcription. Fully offline, zero cost.

**Fallback:** If DarwinKit unavailable, optionally integrate `whisper.cpp` via `whisper-rs` (requires ~75MB model download).

**Risks:** Microphone permission prompt. On-device recognition quality varies by language (English is excellent, others vary).

---

### 2.2 AI Auto-Folder Suggestion

**What:** When saving a note to Inbox, a subtle suggestion appears: "Move to Work?" based on content analysis. Accept with Tab, dismiss with Escape.

**Why:** The #1 organizational pain point: notes pile up in a default bucket and never get sorted. Mem 2.0 ditches folders entirely in favor of AI organization. Stik can offer the middle ground: folders + AI assistance.

**How (Phase 1 - Heuristic, zero deps):** Keyword matching against existing notes in each folder. "If 60% of notes in 'Work' contain words like 'meeting', 'deadline', 'project', and this note does too, suggest 'Work'." Free, instant, no dependencies.

**How (Phase 2 - DarwinKit NLEmbedding):** Compute semantic embeddings for each folder (average of its notes' embeddings via `NLEmbedding.wordEmbedding`). On new note, compute its embedding and find the closest folder by cosine similarity. Much better accuracy than keyword matching, still fully on-device and free.

**How (Phase 3 - DarwinKit Foundation Models, macOS 26+):** Use Apple's on-device LLM for classification. Send note content + folder list, get a folder suggestion with reasoning. Highest quality, still zero API cost.

**Recommendation:** Ship Phase 1 immediately (zero deps), add Phase 2 when DarwinKit ships NLEmbedding support.

---

### 2.3 Daily Digest / Review

**What:** Evening notification: "You captured 5 thoughts today" with note previews. Optional morning notification: "Yesterday you wrote about..."

**Why:** Creates a natural daily touchpoint. Pairs with the brain-dump journaling trend on TikTok. Positions Stik as a mental clarity tool, not just productivity.

**How:** Background task (or launch-time check) counts today's notes and composes a notification via DarwinKit's `notify` action (or directly via macOS `UserNotifications`). Configurable in Settings (off/morning/evening/both).

**Effort:** Medium. Requires macOS notification permissions and a Settings UI toggle.

---

### 2.4 "Clean Up This Note" Action

**What:** Select a messy brain-dump note, trigger "Clean Up" action, receive a restructured version with filler removed and key points highlighted. Original stays untouched.

**Why:** This is Granola's core pattern ($250M valuation). AudioPen does this for voice. "Sparse input, rich output" is the dominant AI-for-notes paradigm.

**How (Option A - DarwinKit Foundation Models, macOS 26+):** Use Apple's on-device 3B param LLM via DarwinKit's `generate` action. System prompt: "Restructure this brain dump into clear, organized prose. Keep all information, remove filler." Zero cost, fully private, no API key needed.

**How (Option B - External API fallback):** For users on macOS <26, optionally support a user-provided Claude/GPT API key. Single API call per clean-up (~$0.001). Configured in Settings.

**Recommendation:** Ship Option A first (zero cost, privacy-first). Add Option B as an opt-in fallback for older macOS versions.

---

### 2.5 Git-Based Team Sharing

**What:** Share a Stik folder with teammates via a git repository. Notes are synced through git push/pull, with automatic conflict resolution for markdown files.

**Why:** Stik's notes are already plain `.md` files in a folder — git is the natural collaboration layer. No server to build, no accounts to manage, no sync infrastructure. Teams already familiar with git get collaboration for free.

**How:**

1. In Settings, configure a folder to be "git-linked" (point to a git remote URL)
2. Stik initializes a git repo in that folder (or uses an existing one)
3. On note save: auto-commit + push (debounced, batched every 30s)
4. On app launch + periodic interval: pull and merge
5. Conflicts resolved by keeping both versions (append `-conflict-YYYYMMDD` to the duplicate)

**UX:** Users see a small sync indicator on git-linked folders. No git knowledge required — Stik handles all git operations silently. Power users can use their own git workflow alongside Stik.

**Scope:** Start with a single shared folder, expand to per-folder git config later.

**Effort:** Medium. Shell out to `git` CLI (avoid libgit2 complexity). The merge strategy is simple since markdown files rarely conflict at the line level.

---

## Tier 3 -- Strategic Bets

Bigger features that define Stik's next chapter. Each is a full 6-day sprint.

### 3.1 Screenshot OCR Capture

**What:** Global shortcut triggers area selection. Selected region is OCR'd and saved as a markdown note. Captures whiteboards, code snippets, receipts, error messages.

**Why:** Unfriction is the only competitor doing this, and users love it. CleanShot X and Shottr prove the demand. The boundary between "clipboard manager" and "note capture" is dissolving.

**How:** Use DarwinKit's `ocr` action, backed by Apple Vision framework's `VNRecognizeTextRequest`. Stik handles the screen capture via `CGWindowListCreateImage` (Rust `objc` crate) and passes the image path to DarwinKit for text extraction. Save extracted text as a new markdown note.

**Complexity:** Medium-high. Requires macOS screen recording permission and a capture overlay UI. But DarwinKit handles the hard part (OCR).

---

### 3.2 Related Notes Sidebar

**What:** When viewing a note, show 3-5 related notes based on content similarity.

**Why:** Turns Stik from "dump and forget" into a lightweight knowledge base. Obsidian's graph and Reflect's backlinks prove users want connections, but those tools are complex. A simple "related notes" panel is the 80/20 solution.

**How (Phase 1 - TF-IDF):** Compute term frequency vectors for all notes at index build time. On note view, find highest cosine similarity. No external dependencies, fast, works offline. Leverages existing `NoteIndex`.

**How (Phase 2 - DarwinKit NLEmbedding):** Use Apple's `NLEmbedding` to compute semantic vectors for each note. Store vectors alongside the note index. Cosine similarity on vectors gives much better "related by meaning" results than keyword matching.

**Recommendation:** Start with TF-IDF (zero dependencies). Upgrade to NLEmbedding via DarwinKit when available — the switch is just changing the vector source, the similarity logic stays the same.

---

### 3.3 Simple Export Rules

**What:** User-defined rules like "notes in Projects/ folder automatically append to my Obsidian daily note" or "notes containing #task get copied to a Tasks.md file."

**Why:** Drafts has this with a complex Actions system. Simple, declarative rules would hit the sweet spot between power and usability. Makes Stik the capture layer for any workflow.

**How:** Rules defined in `~/.stik/rules.json`. Each rule has a trigger (folder, tag, keyword) and an action (copy to path, append to file, run shell command). Evaluated after each note save.

**Complexity:** Medium-high. Rule evaluation engine, Settings UI for rule management, file system operations outside Stik's folder.

---

### 3.4 iOS Companion (Read-Only)

**What:** Minimal iOS app that reads `~/Documents/Stik/` via iCloud. Search and view only. Capture stays on Mac.

**Why:** "I captured it on my Mac but need it on my phone" is the universal pain point for local-first tools. A read-only companion avoids sync complexity while solving 80% of the use case.

**How:** SwiftUI app using FileManager to read from iCloud Drive container. Reuse the same folder structure and filename conventions. Search via in-memory index (same approach as Rust `NoteIndex`).

**Complexity:** High. Separate codebase (Swift/SwiftUI), iCloud entitlements, App Store review process. But architecturally simple since it's read-only.

---

## Anti-Patterns -- What NOT to Build

Based on competitor failures and market signals:

| Feature | Why Not |
|---|---|
| **Full PKM / graph view** | Obsidian's territory. Adding backlinks, graph visualization, or wiki-style linking dilutes Stik's "fast and simple" identity. |
| **Real-time collaboration (Google Docs style)** | CRDT/OT adds massive complexity. Git-based async sharing (2.5) covers team use cases without the engineering nightmare. |
| **Subscription pricing** | #1 complaint about Drafts ($50/yr) and Raycast ($96/yr). Stik is open source — community contributions replace subscription revenue. |
| **Browser extension / web clipper** | Scope creep. Clipboard monitoring covers 80% of the same use case with far less maintenance. |
| **Complex block editor** | Markdown is enough. Don't chase Notion's block editor. The constraint is the feature. |
| **Cloud AI APIs as default** | Apple's on-device ML is free and private. External APIs (Claude/GPT) should only exist as opt-in fallbacks for older macOS versions. Never require an API key for core functionality. |

---

## Brand & Positioning

### Core Insight

The brain-dump journaling trend on TikTok frames thought capture as **mental health**, not productivity. "Clear your head in 3 seconds" resonates more than "capture thoughts efficiently."

### Brand Angles

- **"Your thoughts don't need to be perfect to be saved"** -- embraces messy capture
- **"Think out loud, clean up later"** -- if voice capture ships
- **"Zero accounts, zero cloud, zero tracking -- just your thoughts"** -- privacy-first positioning
- **"The fastest way from brain to file"** -- speed as the core value prop
- **"Open source, open mind"** -- community-driven, transparent development

### TikTok / Marketing Opportunities

- Stik's warm coral palette and floating post-it windows align with the "aesthetic productivity" trend
- A 5-second video of summoning a post-it, typing, and it vanishing is inherently satisfying and shareable
- "365 days of captured thoughts" content series fits current TikTok patterns
- "Clean girl desk setup" and "aesthetic Mac apps" hashtag spaces are active and growing
- The "Reali-TEA" 2026 trend favors honest, grounded tools over overengineered ones -- Stik's simplicity is on-trend
- "I built an open source app and here's what happened" developer storytelling format

---

## Competitive Landscape Reference

### Direct Competitors

| App | Price | Notes Limit | Sync | Folders | Markdown | Quick Capture | AI | Open Source |
|---|---|---|---|---|---|---|---|---|
| **Stik** | Free (OSS) | Unlimited | Via iCloud/git | Yes | Yes (.md files) | Global shortcut | On-device (Apple) | Yes |
| **Tot** | Free (Mac) | 7 | iCloud | No | No | Menu bar click | No | No |
| **Antinote** | $5 | Unlimited | None | No | Partial | Option+A | No | No |
| **Unfriction** | $19 | Unlimited | None | Hashtags | Yes | Overlay UI | No | No |
| **Type** | One-time | Unlimited | None | No | Yes | Cmd bar | No | No |
| **Noted** | $0.99 | 1 | None | No | No | Option+` | No | No |
| **SideNotes** | $20 | Unlimited | None | Folders | Yes | Screen edge | No | No |
| **Scratchpad** | $4.99 | 1 | iCloud | No | No | Cmd+Shift+S | No | No |

### Adjacent Competitors

| App | Price | Quick Capture Quality | Main Weakness |
|---|---|---|---|
| **Drafts** | $50/yr | Good (URL scheme) | Complex, subscription fatigue |
| **Raycast Notes** | $96/yr | Good (built-in) | Locked to Raycast, 5 free limit |
| **Apple Quick Note** | Free | Poor (opens full app) | Clunky, unreliable, unchanged since 2021 |
| **Bear** | $30/yr | None (no quick capture) | Community requesting since 2020 |
| **NotePlan** | $100/yr | Partial (plugin) | Expensive, sync issues |

---

## Open Source Projects

| Repo | Description | Status |
|---|---|---|
| **stik** | The main app — instant thought capture for macOS | Active |
| **darwinkit** | Swift CLI exposing Apple ML/system frameworks for Tauri/Rust apps | Planned |

DarwinKit is developed alongside Stik but published as a completely independent project. Any Tauri, Electron, or Rust-based macOS app can use it. This maximizes community reach and contribution surface.

---

## Suggested Sprint Order

If implementing sequentially, this order maximizes value and builds on previous work:

1. [x] **1.4** iCloud sync docs (zero effort, immediate value)
2. [x] **1.2** Capture streak (habit formation, retention)
3. [x] **1.1** On This Day (emotional hook, retention)
4. [x] **1.3** Share as clipboard (utility, workflow integration)
5. [ ] **DarwinKit v0.1** -- OCR + NLEmbedding actions (foundation for AI features)
6. [ ] **2.2** AI auto-folder suggestion (Phase 1 heuristic, then Phase 2 with DarwinKit)
7. [ ] **2.3** Daily digest (retention, brand positioning)
8. [ ] **2.1** Voice capture via DarwinKit speech (major differentiator)
9. [ ] **2.4** Clean up note via DarwinKit Foundation Models (AI value-add)
10. [ ] **2.5** Git-based team sharing (collaboration without infrastructure)
11. [ ] **3.2** Related notes via DarwinKit NLEmbedding (knowledge base evolution)
12. [ ] **3.1** Screenshot OCR via DarwinKit Vision (capture expansion)
13. [ ] **3.3** Export rules (workflow integration)
14. [ ] **3.4** iOS companion (platform expansion)
