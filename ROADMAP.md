# Stik Roadmap

> Last updated: 2026-02-06 | Current version: 0.2.0

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
| One-time purchase | Yes | Yes ($20 iOS) | No ($50/yr) | Free | Yes ($5) | Yes |
| No account required | Yes | Yes | No | Apple ID | Yes | Yes |

**Defensible advantages:**
- Only app combining instant keyboard capture + post-it aesthetic + markdown file ownership + folder organization
- Local-first architecture (`~/Documents/Stik/`) enables sync via iCloud/Dropbox without building sync infrastructure
- No subscription, no account, no cloud dependency

---

## Tier 1 -- Quick Wins

Low-effort, high-return features that exploit existing infrastructure. Each is a 1-2 day sprint.

### 1.1 "On This Day" Resurfacing

**What:** Daily macOS notification showing a note from the same date in a previous year.

**Why:** Day One's most-loved feature. Creates an emotional hook no competitor in the quick-capture space has. Studies show autobiographical memory resurfacing uplifts mood.

**How:** Filenames already encode dates (`YYYYMMDD-HHMMSS-slug.md`). On app launch, query files matching today's month+day from prior years. Show via macOS notification center.

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

**How:** Integrate `whisper.cpp` (C/C++ with Rust bindings via `whisper-rs`). Record audio via macOS `AVFoundation` (accessible from Rust via `objc` crate or a small Swift bridge). Transcribe on release, insert text into a new note. Fully offline, privacy-first.

**Complexity:** Medium. Audio recording + Whisper integration. Model download (~75MB for `base.en`) on first use.

**Risks:** Microphone permission prompt. Model size. Transcription speed on older Macs (mitigated by using `tiny` or `base` model).

---

### 2.2 AI Auto-Folder Suggestion

**What:** When saving a note to Inbox, a subtle suggestion appears: "Move to Work?" based on content analysis. Accept with Tab, dismiss with Escape.

**Why:** The #1 organizational pain point: notes pile up in a default bucket and never get sorted. Mem 2.0 ditches folders entirely in favor of AI organization. Stik can offer the middle ground: folders + AI assistance.

**How (Option A - On-device):** Use Apple's Foundation Models framework (macOS 26, 3B parameter LLM) for classification. Send note content + folder list, get a folder suggestion. Fully local, no API key needed.

**How (Option B - API):** Single API call to Claude/GPT with the note content and folder names. ~$0.001 per classification. Requires user to provide an API key in Settings.

**How (Option C - Heuristic):** Keyword matching against existing notes in each folder. No AI needed. "If 60% of notes in 'Work' contain words like 'meeting', 'deadline', 'project', and this note does too, suggest 'Work'." Free, instant, no dependencies.

**Recommendation:** Start with Option C (zero dependencies), add Option A when macOS 26 adoption is sufficient.

---

### 2.3 Daily Digest / Review

**What:** Evening notification: "You captured 5 thoughts today" with note previews. Optional morning notification: "Yesterday you wrote about..."

**Why:** Creates a natural daily touchpoint. Pairs with the brain-dump journaling trend on TikTok. Positions Stik as a mental clarity tool, not just productivity.

**How:** Background task (or launch-time check) counts today's notes and composes a notification via macOS `UserNotifications` framework. Configurable in Settings (off/morning/evening/both).

**Effort:** Medium. Requires macOS notification permissions and a Settings UI toggle.

---

### 2.4 "Clean Up This Note" Action

**What:** Select a messy brain-dump note, trigger "Clean Up" action, receive a restructured version with filler removed and key points highlighted. Original stays untouched.

**Why:** This is Granola's core pattern ($250M valuation). AudioPen does this for voice. "Sparse input, rich output" is the dominant AI-for-notes paradigm.

**How:** Button in viewing/sticked note mode. Single LLM API call (Claude or GPT) with the note content and a system prompt: "Restructure this brain dump into clear, organized prose. Keep all information, remove filler." Show result in a new note or as an inline diff. Requires API key in Settings.

**Effort:** Medium. API integration + UI for showing cleaned version.

---

## Tier 3 -- Strategic Bets

Bigger features that define Stik's next chapter. Each is a full 6-day sprint.

### 3.1 Screenshot OCR Capture

**What:** Global shortcut triggers area selection. Selected region is OCR'd and saved as a markdown note. Captures whiteboards, code snippets, receipts, error messages.

**Why:** Unfriction is the only competitor doing this, and users love it. CleanShot X and Shottr prove the demand. The boundary between "clipboard manager" and "note capture" is dissolving.

**How:** Use macOS `CGWindowListCreateImage` for screen capture, `Vision` framework's `VNRecognizeTextRequest` for OCR. Both are native macOS APIs accessible from Rust via `objc` crate. Save extracted text as a new markdown note with an optional screenshot attachment.

**Complexity:** Higher. Requires macOS screen recording permission, native API bridging, and a capture overlay UI.

---

### 3.2 Related Notes Sidebar

**What:** When viewing a note, show 3-5 related notes based on content similarity.

**Why:** Turns Stik from "dump and forget" into a lightweight knowledge base. Obsidian's graph and Reflect's backlinks prove users want connections, but those tools are complex. A simple "related notes" panel is the 80/20 solution.

**How (Option A - TF-IDF):** Compute term frequency vectors for all notes at index build time. On note view, find highest cosine similarity. No external dependencies, fast, works offline.

**How (Option B - Embeddings):** Use a small local embedding model (e.g., `all-MiniLM-L6-v2`, 22MB) to compute vectors. Store in a simple vector index. Higher quality matches but larger footprint.

**Recommendation:** Start with TF-IDF (zero dependencies, leverages existing `NoteIndex`). Graduate to embeddings if users want better semantic matching.

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
| **Real-time collaboration** | Quick capture is personal. Collaboration adds massive complexity for a use case that doesn't fit. |
| **Subscription pricing** | #1 complaint about Drafts ($50/yr) and Raycast ($96/yr). Users strongly prefer one-time purchase ($5-$20) for focused tools. |
| **Browser extension / web clipper** | Scope creep. Clipboard monitoring covers 80% of the same use case with far less maintenance. |
| **Complex block editor** | Markdown is enough. Don't chase Notion's block editor. The constraint is the feature. |
| **Multi-platform (Windows/Linux)** | macOS-native is a feature, not a limitation. Tauri supports cross-platform but the UX would suffer. |

---

## Brand & Positioning

### Core Insight

The brain-dump journaling trend on TikTok frames thought capture as **mental health**, not productivity. "Clear your head in 3 seconds" resonates more than "capture thoughts efficiently."

### Brand Angles

- **"Your thoughts don't need to be perfect to be saved"** -- embraces messy capture
- **"Think out loud, clean up later"** -- if voice capture ships
- **"Zero accounts, zero cloud, zero tracking -- just your thoughts"** -- privacy-first positioning
- **"The fastest way from brain to file"** -- speed as the core value prop

### TikTok / Marketing Opportunities

- Stik's warm coral palette and floating post-it windows align with the "aesthetic productivity" trend
- A 5-second video of summoning a post-it, typing, and it vanishing is inherently satisfying and shareable
- "365 days of captured thoughts" content series fits current TikTok patterns
- "Clean girl desk setup" and "aesthetic Mac apps" hashtag spaces are active and growing
- The "Reali-TEA" 2026 trend favors honest, grounded tools over overengineered ones -- Stik's simplicity is on-trend

---

## Competitive Landscape Reference

### Direct Competitors

| App | Price | Notes Limit | Sync | Folders | Markdown | Quick Capture |
|---|---|---|---|---|---|---|
| **Stik** | Free/TBD | Unlimited | Via iCloud | Yes | Yes (.md files) | Global shortcut |
| **Tot** | Free (Mac) | 7 | iCloud | No | No | Menu bar click |
| **Antinote** | $5 | Unlimited | None | No | Partial | Option+A |
| **Unfriction** | $19 | Unlimited | None | Hashtags | Yes | Overlay UI |
| **Type** | One-time | Unlimited | None | No | Yes | Cmd bar |
| **Noted** | $0.99 | 1 | None | No | No | Option+` |
| **SideNotes** | $20 | Unlimited | None | Folders | Yes | Screen edge |
| **Scratchpad** | $4.99 | 1 | iCloud | No | No | Cmd+Shift+S |

### Adjacent Competitors

| App | Price | Quick Capture Quality | Main Weakness |
|---|---|---|---|
| **Drafts** | $50/yr | Good (URL scheme) | Complex, subscription fatigue |
| **Raycast Notes** | $96/yr | Good (built-in) | Locked to Raycast, 5 free limit |
| **Apple Quick Note** | Free | Poor (opens full app) | Clunky, unreliable, unchanged since 2021 |
| **Bear** | $30/yr | None (no quick capture) | Community requesting since 2020 |
| **NotePlan** | $100/yr | Partial (plugin) | Expensive, sync issues |

---

## Suggested Sprint Order

If implementing sequentially, this order maximizes value and builds on previous work:

1. **1.4** iCloud sync docs (zero effort, immediate value)
2. **1.2** Capture streak (habit formation, retention)
3. **1.1** On This Day (emotional hook, retention)
4. **1.3** Share as clipboard (utility, workflow integration)
5. **2.2** AI auto-folder suggestion (start with heuristic, zero deps)
6. **2.3** Daily digest (retention, brand positioning)
7. **2.1** Voice capture (major differentiator)
8. **2.4** Clean up note (AI value-add)
9. **3.2** Related notes (knowledge base evolution)
10. **3.1** Screenshot OCR (capture expansion)
11. **3.3** Export rules (workflow integration)
12. **3.4** iOS companion (platform expansion)
