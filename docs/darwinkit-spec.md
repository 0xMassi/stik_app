# DarwinKit — Project Specification

> A Swift CLI that exposes Apple's on-device ML and system frameworks via JSON-RPC over stdio.
> Any Tauri, Electron, or Rust app can use it. Zero dependencies, zero API keys, zero cost.

**Status:** Planning | **License:** MIT | **Platforms:** macOS 13+ (Ventura)

---

## 1. Problem

Tauri and Rust apps on macOS cannot easily access Apple-native ML frameworks (NaturalLanguage, Vision, Speech, Foundation Models). The `objc` crate works but requires unsafe code, manual memory management, and deep Objective-C knowledge for each framework. There is no reusable bridge.

Electron apps have `node-mlx`. Swift-native apps have direct access. **Tauri apps have nothing.**

## 2. Solution

A standalone Swift CLI binary (`darwinkit`) that:

1. Reads JSON-RPC requests from **stdin**
2. Calls Apple frameworks
3. Writes JSON-RPC responses to **stdout**
4. Logs to **stderr**

Parent processes spawn it as a subprocess and communicate via pipes. No networking, no sockets, no shared memory. The protocol is language-agnostic — any process that can spawn a child and read/write pipes can use DarwinKit.

## 3. Non-Goals

- **Not a library.** DarwinKit is a binary, not a framework you link against.
- **Not cross-platform.** macOS only, by design.
- **Not a daemon.** Spawned on demand, exits when stdin closes.
- **Not a full LSP.** Simpler protocol, no capability negotiation.

---

## 4. Protocol Specification

### 4.1 Transport

**NDJSON (Newline-Delimited JSON)** over stdio. Each message is a single line of JSON terminated by `\n`. Same pattern used by MCP (Model Context Protocol), Docker, and Elasticsearch.

- **Requests:** Parent writes to DarwinKit's stdin
- **Responses:** DarwinKit writes to stdout
- **Logs/debug:** DarwinKit writes to stderr (never stdout)

### 4.2 Message Format (JSON-RPC 2.0)

**Request** (parent -> darwinkit):
```json
{"jsonrpc":"2.0","id":"req-1","method":"nlp.embed","params":{"text":"meeting notes","language":"en"}}
```

**Success response** (darwinkit -> parent):
```json
{"jsonrpc":"2.0","id":"req-1","result":{"vector":[0.123,-0.456,...],"dimension":512}}
```

**Error response** (darwinkit -> parent):
```json
{"jsonrpc":"2.0","id":"req-1","error":{"code":-32001,"message":"Language not supported","data":{"language":"xx"}}}
```

**Notification** (no `id`, no response expected — used for progress):
```json
{"jsonrpc":"2.0","method":"progress","params":{"id":"req-1","percent":45,"message":"Processing page 2/5"}}
```

### 4.3 Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error (malformed JSON) |
| -32600 | Invalid request (missing required fields) |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32001 | Framework unavailable (e.g., NLEmbedding returns nil for language) |
| -32002 | Permission denied (e.g., Speech recognition not authorized) |
| -32003 | OS version too old for requested feature |
| -32004 | Operation cancelled |

### 4.4 Lifecycle

1. Parent spawns `darwinkit serve`
2. DarwinKit writes initialization message to stdout: `{"jsonrpc":"2.0","method":"ready","params":{"version":"0.1.0","capabilities":["nlp.embed","nlp.tag","vision.ocr"]}}`
3. Parent reads the `ready` notification to discover available capabilities
4. Parent sends requests, DarwinKit responds
5. Parent closes stdin -> DarwinKit exits cleanly (exit code 0)

### 4.5 Cancellation

Parent sends a notification (no `id`):
```json
{"jsonrpc":"2.0","method":"$/cancel","params":{"id":"req-1"}}
```

DarwinKit responds with error code -32004 for the cancelled request.

---

## 5. Supported Methods

### Phase 1 (v0.1.0)

#### `nlp.embed` — Text Embedding

Compute semantic vectors using Apple's NLEmbedding (macOS 10.15+, 512-dim).

```json
// Request
{"jsonrpc":"2.0","id":"1","method":"nlp.embed","params":{
  "text": "quarterly meeting notes",
  "language": "en",
  "type": "sentence"
}}

// Response
{"jsonrpc":"2.0","id":"1","result":{
  "vector": [0.0312, -0.0891, ...],
  "dimension": 512
}}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | yes | — | Text to embed |
| `language` | string | yes | — | ISO 639-1 code (en, es, fr, de, it, pt, zh) |
| `type` | string | no | `"sentence"` | `"word"` (macOS 10.15+) or `"sentence"` (macOS 11+) |

**Apple API:** `NLEmbedding.sentenceEmbedding(for:)` / `NLEmbedding.wordEmbedding(for:)`

**Gotchas:**
- Word embeddings return `nil` for out-of-vocabulary words
- Sentence embeddings require macOS 11+ (Big Sur)
- Only 7 languages supported: en, es, fr, de, it, pt, zh

---

#### `nlp.distance` — Semantic Distance

Compute cosine distance between two texts.

```json
// Request
{"jsonrpc":"2.0","id":"2","method":"nlp.distance","params":{
  "text1": "cat",
  "text2": "dog",
  "language": "en",
  "type": "word"
}}

// Response
{"jsonrpc":"2.0","id":"2","result":{
  "distance": 0.312,
  "type": "cosine"
}}
```

**Apple API:** `NLEmbedding.distance(between:and:distanceType:)`

---

#### `nlp.neighbors` — Find Similar Words/Sentences

```json
// Request
{"jsonrpc":"2.0","id":"3","method":"nlp.neighbors","params":{
  "text": "programming",
  "language": "en",
  "count": 5,
  "type": "word"
}}

// Response
{"jsonrpc":"2.0","id":"3","result":{
  "neighbors": [
    {"text": "coding", "distance": 0.21},
    {"text": "software", "distance": 0.34},
    {"text": "development", "distance": 0.38},
    {"text": "computer", "distance": 0.41},
    {"text": "engineering", "distance": 0.44}
  ]
}}
```

**Apple API:** `NLEmbedding.enumerateNeighbors(for:maximumCount:)`

---

#### `nlp.tag` — Part-of-Speech & Named Entity Recognition

Tag text with linguistic annotations.

```json
// Request
{"jsonrpc":"2.0","id":"4","method":"nlp.tag","params":{
  "text": "Steve Jobs founded Apple in Cupertino",
  "language": "en",
  "schemes": ["nameType", "lexicalClass"]
}}

// Response
{"jsonrpc":"2.0","id":"4","result":{
  "tokens": [
    {"text": "Steve Jobs", "tags": {"nameType": "PersonalName", "lexicalClass": "Noun"}},
    {"text": "founded", "tags": {"nameType": "OtherWord", "lexicalClass": "Verb"}},
    {"text": "Apple", "tags": {"nameType": "OrganizationName", "lexicalClass": "Noun"}},
    {"text": "in", "tags": {"nameType": "OtherWord", "lexicalClass": "Preposition"}},
    {"text": "Cupertino", "tags": {"nameType": "PlaceName", "lexicalClass": "Noun"}}
  ]
}}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | yes | — | Text to analyze |
| `language` | string | no | auto-detect | ISO 639-1 code |
| `schemes` | string[] | no | `["lexicalClass"]` | Tag schemes: `lexicalClass`, `nameType`, `lemma`, `sentimentScore`, `language` |

**Apple API:** `NLTagger(tagSchemes:)`

**Gotchas:**
- `sentimentScore` requires macOS 11+ and works at paragraph level only
- Use `.joinNames` option for multi-word entities (Steve Jobs, New York)
- Sentiment is returned as a string ("0.8"), must be parsed to number

---

#### `nlp.sentiment` — Sentiment Analysis (convenience)

Shortcut for sentiment scoring without full tagging.

```json
// Request
{"jsonrpc":"2.0","id":"5","method":"nlp.sentiment","params":{
  "text": "I love this product, it works perfectly!"
}}

// Response
{"jsonrpc":"2.0","id":"5","result":{
  "score": 0.9,
  "label": "positive"
}}
```

Labels: `positive` (> 0.1), `negative` (< -0.1), `neutral` (between)

**Apple API:** `NLTagger` with `.sentimentScore` scheme (macOS 11+)

---

#### `nlp.language` — Language Detection

```json
// Request
{"jsonrpc":"2.0","id":"6","method":"nlp.language","params":{
  "text": "Bonjour, comment allez-vous?"
}}

// Response
{"jsonrpc":"2.0","id":"6","result":{
  "language": "fr",
  "confidence": 0.98
}}
```

**Apple API:** `NLLanguageRecognizer`

---

#### `vision.ocr` — Text Extraction from Images

Extract text from an image file using Apple Vision.

```json
// Request
{"jsonrpc":"2.0","id":"7","method":"vision.ocr","params":{
  "path": "/tmp/screenshot.png",
  "languages": ["en-US"],
  "level": "accurate"
}}

// Response
{"jsonrpc":"2.0","id":"7","result":{
  "text": "Meeting Notes\n\nQ4 targets are...",
  "blocks": [
    {"text": "Meeting Notes", "confidence": 0.99, "bounds": {"x": 0.1, "y": 0.85, "width": 0.3, "height": 0.05}},
    {"text": "Q4 targets are...", "confidence": 0.95, "bounds": {"x": 0.1, "y": 0.75, "width": 0.8, "height": 0.04}}
  ]
}}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | yes | — | Absolute path to image file |
| `languages` | string[] | no | `["en-US"]` | Recognition languages |
| `level` | string | no | `"accurate"` | `"accurate"` (neural net) or `"fast"` |

Supported formats: JPEG, PNG, TIFF, HEIC, BMP, GIF, PDF (first page).

**Apple API:** `VNRecognizeTextRequest` + `VNImageRequestHandler(url:)`

**Gotchas:**
- Bounding boxes use normalized coordinates (0..1, origin at bottom-left)
- Large images use significant memory
- No entitlements needed

---

#### `system.capabilities` — Query Available Features

```json
// Request
{"jsonrpc":"2.0","id":"8","method":"system.capabilities","params":{}}

// Response
{"jsonrpc":"2.0","id":"8","result":{
  "version": "0.1.0",
  "os": "15.2",
  "arch": "arm64",
  "methods": {
    "nlp.embed": {"available": true, "note": "sentence requires macOS 11+"},
    "nlp.tag": {"available": true},
    "nlp.sentiment": {"available": true},
    "nlp.language": {"available": true},
    "nlp.distance": {"available": true},
    "nlp.neighbors": {"available": true},
    "vision.ocr": {"available": true},
    "speech.transcribe": {"available": false, "note": "Requires macOS 13+ and Speech permission"},
    "llm.generate": {"available": false, "note": "Requires macOS 26+ with Apple Intelligence enabled"}
  },
  "embedding_languages": ["en", "es", "fr", "de", "it", "pt", "zh"]
}}
```

---

### Phase 2 (v0.2.0)

#### `speech.transcribe` — Speech-to-Text

```json
{"jsonrpc":"2.0","id":"9","method":"speech.transcribe","params":{
  "path": "/tmp/recording.m4a",
  "language": "en-US",
  "on_device": true
}}
```

**Apple API:** `SFSpeechRecognizer` + `SFSpeechURLRecognitionRequest`

**Known issues:** Requires Info.plist with `NSSpeechRecognitionUsageDescription`. DarwinKit ships as a minimal `.app` bundle to satisfy this requirement (see section 7).

---

### Phase 3 (v0.3.0)

#### `llm.generate` — On-Device LLM (Apple Intelligence)

```json
{"jsonrpc":"2.0","id":"10","method":"llm.generate","params":{
  "prompt": "Summarize this text in 3 bullet points: ...",
  "system": "You are a concise summarizer. Respond in markdown.",
  "temperature": 0.7,
  "max_tokens": 500
}}
```

**Apple API:** `FoundationModels.LanguageModelSession` (macOS 26+)

**Hard constraints:**
- Apple Silicon only (M1+)
- 4096 token context window (input + output combined)
- Apple Intelligence must be enabled in System Settings
- Aggressive safety guardrails (cannot be disabled)
- 3B parameter model — good for summarization/classification, not complex reasoning

---

## 6. Package Structure

```
darwinkit/
  Package.swift
  Sources/
    DarwinKit/                    # Thin executable entry point
      DarwinKit.swift             # @main, ArgumentParser, spawns server
    DarwinKitCore/                # All business logic (testable)
      Server/
        JsonRpcServer.swift       # Stdin reader, stdout writer, message dispatch
        Protocol.swift            # Request, Response, Error types (Codable)
      Handlers/
        NLPHandler.swift          # nlp.embed, nlp.tag, nlp.sentiment, etc.
        VisionHandler.swift       # vision.ocr
        SpeechHandler.swift       # speech.transcribe (Phase 2)
        LLMHandler.swift          # llm.generate (Phase 3)
        SystemHandler.swift       # system.capabilities
      Providers/                  # Protocol abstractions (for testing)
        EmbeddingProvider.swift   # protocol + Apple implementation
        TaggerProvider.swift
        OCRProvider.swift
        SpeechProvider.swift
        LLMProvider.swift
  Tests/
    DarwinKitCoreTests/
      ServerTests/
        JsonRpcServerTests.swift  # Protocol parsing, error handling
        ProtocolTests.swift       # Codable round-trip tests
      HandlerTests/
        NLPHandlerTests.swift     # Tests with mock providers
        VisionHandlerTests.swift
        SystemHandlerTests.swift
  .github/
    workflows/
      ci.yml                      # Build + test on every PR
      release.yml                 # Build universal binary, GitHub Release, Homebrew update
  Formula/
    darwinkit.rb                  # Homebrew formula (in separate homebrew-darwinkit repo)
```

### Why Executable + Library Split

Swift does not allow linking executable targets into test bundles. By putting all logic in `DarwinKitCore` (a library), tests can import and test it directly. The `DarwinKit` executable is just a thin entry point that calls into the library.

---

## 7. Distribution

### 7.1 Homebrew (Primary)

```bash
brew tap user/darwinkit
brew install darwinkit
```

Homebrew formula builds from source via `swift build -c release --arch arm64 --arch x86_64`. Users get a universal binary that works on both Apple Silicon and Intel Macs.

### 7.2 GitHub Releases

Pre-built universal binary attached to each GitHub release. For users who don't use Homebrew:

```bash
curl -L https://github.com/user/darwinkit/releases/latest/download/darwinkit-macos-universal.tar.gz | tar xz
sudo mv darwinkit /usr/local/bin/
```

### 7.3 Tauri Sidecar (for Stik and other Tauri apps)

DarwinKit binary bundled inside the `.app` package using Tauri's sidecar feature.

**tauri.conf.json:**
```json
{
  "bundle": {
    "externalBin": ["binaries/darwinkit"]
  }
}
```

**Binary naming convention (required by Tauri):**
```
src-tauri/binaries/
  darwinkit-aarch64-apple-darwin      # Apple Silicon
  darwinkit-x86_64-apple-darwin       # Intel
```

**Rust side (spawn + communicate):**
```rust
use tauri_plugin_shell::ShellExt;

let sidecar = app.shell()
    .sidecar("darwinkit")
    .map_err(|e| format!("Sidecar not found: {}", e))?
    .args(["serve"]);

let (mut rx, child) = sidecar.spawn()
    .map_err(|e| format!("Failed to spawn: {}", e))?;

// Write request to stdin
child.write(b"{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"nlp.embed\",\"params\":{\"text\":\"hello\",\"language\":\"en\",\"type\":\"sentence\"}}\n")?;

// Read responses from stdout
while let Some(event) = rx.recv().await {
    match event {
        CommandEvent::Stdout(line) => {
            let response: serde_json::Value = serde_json::from_slice(&line)?;
            // handle response
        }
        CommandEvent::Terminated(_) => break,
        _ => {}
    }
}
```

### 7.4 App Bundle for Speech/Notifications (Phase 2+)

`SFSpeechRecognizer` and `UserNotifications` require an app bundle with `Info.plist`. For Phase 2+, DarwinKit ships as a minimal `.app` bundle:

```
DarwinKit.app/
  Contents/
    Info.plist
    MacOS/
      darwinkit
```

The `Info.plist` contains:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.darwinkit.cli</string>
    <key>CFBundleName</key>
    <string>DarwinKit</string>
    <key>CFBundleExecutable</key>
    <string>darwinkit</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>DarwinKit uses speech recognition to transcribe audio files.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>DarwinKit uses the microphone for voice capture.</string>
</dict>
</plist>
```

Phase 1 ships as a bare binary (NLP + Vision don't need a bundle). Phase 2 upgrades to `.app` bundle.

---

## 8. Swift Implementation Notes

### 8.1 Critical: Disable stdout Buffering

When stdout is piped (always the case when spawned as a subprocess), Swift uses 4KB block buffering. Responses accumulate in the buffer and the parent process never sees them.

**This line must be the very first thing in `main()`:**

```swift
setbuf(stdout, nil)
```

### 8.2 Threading Model

```
Main Thread (RunLoop)              Background Thread
    |                                    |
    |                                    |-- while let line = readLine()
    |                                    |-- decode JSON-RPC request
    |                                    |-- dispatch to main thread:
    |<-- DispatchQueue.main.async -------|
    |                                    |
    |-- call Apple framework             |
    |-- encode JSON-RPC response         |
    |-- print(json) to stdout            |
    |                                    |
    |-- RunLoop.main.run()               |-- (blocks on readLine)
```

- **stdin reading** happens on a background thread (blocking `readLine()` loop)
- **Apple framework calls** happen on the main thread (required for Speech, Vision callbacks)
- **stdout writing** happens on the main thread (serialized, no races)
- When stdin reaches EOF (parent closed pipe), the background thread exits, triggering clean shutdown

### 8.3 Provider Protocol Pattern (for testability)

```swift
// Protocol
protocol EmbeddingProvider {
    func embed(text: String, language: String, type: EmbedType) throws -> [Double]
    func distance(text1: String, text2: String, language: String) throws -> Double
    func supportedLanguages() -> [String]
}

// Real implementation
struct AppleEmbeddingProvider: EmbeddingProvider {
    func embed(text: String, language: String, type: EmbedType) throws -> [Double] {
        let nlLanguage = NLLanguage(rawValue: language)
        switch type {
        case .sentence:
            guard let embedding = NLEmbedding.sentenceEmbedding(for: nlLanguage) else {
                throw DarwinKitError.frameworkUnavailable("Sentence embedding not available for \(language)")
            }
            guard let vector = embedding.vector(for: text) else {
                throw DarwinKitError.noResult("No embedding for given text")
            }
            return vector
        case .word:
            guard let embedding = NLEmbedding.wordEmbedding(for: nlLanguage) else {
                throw DarwinKitError.frameworkUnavailable("Word embedding not available for \(language)")
            }
            guard let vector = embedding.vector(for: text) else {
                throw DarwinKitError.noResult("Word not in vocabulary")
            }
            return vector
        }
    }
}

// Mock for testing
struct MockEmbeddingProvider: EmbeddingProvider {
    var mockVector: [Double] = Array(repeating: 0.1, count: 512)
    func embed(text: String, language: String, type: EmbedType) throws -> [Double] {
        return mockVector
    }
}
```

---

## 9. Testing Strategy

### Unit Tests (DarwinKitCoreTests)

- **Protocol parsing:** JSON-RPC encode/decode round-trips, malformed input handling, error serialization
- **Handler logic:** Each handler tested with mock providers. No real Apple framework calls in unit tests (they require specific OS versions and return different results per machine)
- **Server lifecycle:** Simulate stdin input, verify stdout output, test EOF shutdown

### Integration Tests (Manual / CI)

- Run `echo '{"jsonrpc":"2.0","id":"1","method":"system.capabilities","params":{}}' | darwinkit serve` and verify output
- Run OCR on a known test image and verify extracted text
- Run embedding on known words and verify vector dimensions
- These run on macOS CI runners only

### CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - run: swift test --parallel
      - run: swift build -c release --arch arm64 --arch x86_64
      - run: |
          BINARY=".build/apple/Products/Release/darwinkit"
          echo '{"jsonrpc":"2.0","id":"1","method":"system.capabilities","params":{}}' \
            | "$BINARY" serve \
            | head -2
```

---

## 10. Phase 1 Scope (v0.1.0)

**Goal:** Ship a working binary that Stik can use for semantic search and auto-folder suggestions.

**Methods:**
- `nlp.embed` (sentence + word)
- `nlp.distance`
- `nlp.neighbors`
- `nlp.tag` (lexicalClass, nameType, lemma)
- `nlp.sentiment`
- `nlp.language`
- `vision.ocr`
- `system.capabilities`

**Distribution:**
- GitHub repo with README, LICENSE, Package.swift
- GitHub Actions CI (build + test on every PR)
- GitHub Actions Release (universal binary + Homebrew formula update on tag)
- Homebrew tap

**Not in Phase 1:**
- Speech transcription (needs .app bundle — Phase 2)
- Foundation Models / LLM (macOS 26 only — Phase 3)
- Tauri sidecar integration docs (after Stik integrates it)

**Estimated effort:** 3-4 days for a clean v0.1.0 with full test coverage.

---

## 11. Reference Projects

| Project | Relevance |
|---------|-----------|
| [AXorcist](https://github.com/steipete/AXorcist) | Swift CLI with JSON-over-stdin, closest architecture match |
| [macocr](https://github.com/ughe/macocr) | Proves Vision OCR works from CLI |
| [afm](https://github.com/scouzi1966/maclocal-api) | Proves Foundation Models works from CLI |
| [sourcekit-lsp](https://github.com/swiftlang/sourcekit-lsp) | JSON-RPC over stdio in Swift (reference implementation) |
| [MCP spec](https://spec.modelcontextprotocol.io) | NDJSON + JSON-RPC 2.0 protocol design |
| [swift-argument-parser](https://github.com/apple/swift-argument-parser) | CLI argument handling |

---

## 12. Open Questions

1. **Naming:** `darwinkit` vs `apple-bridge` vs `nativekit` vs `mackit`? "DarwinKit" references the macOS kernel name and avoids Apple trademark issues.

2. **Batch operations:** Should `nlp.embed` accept an array of texts for batch embedding? Reduces subprocess communication overhead for indexing 1000+ notes. Leaning yes.

3. **Streaming for LLM:** Phase 3's `llm.generate` should support streaming via multiple JSON-RPC notifications. Design the streaming protocol now even if we implement it later.

4. **Long-running process vs spawn-per-request:** Current design is long-running (spawn once, send many requests). Alternative: spawn per request (simpler, no state, but slower due to process startup). Leaning long-running for Stik's use case (frequent embedding queries during search).
