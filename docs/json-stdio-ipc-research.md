# JSON-over-stdio IPC Research

Research into inter-process communication patterns for a Swift CLI communicating
with a Rust parent process via stdin/stdout JSON messages.

---

## 1. LSP (Language Server Protocol) Pattern

### How LSP Uses stdio

LSP uses a Content-Length framed protocol over stdin/stdout, directly inspired by HTTP.
The editor (client) spawns the language server as a child process, writes JSON-RPC 2.0
messages to its stdin, and reads responses from its stdout. Stderr is reserved for
logging/debug output.

**Message format:**

```
Content-Length: 52\r\n
\r\n
{"jsonrpc":"2.0","method":"initialized","params":{}}
```

The header section consists of `Content-Length: <byte-count>` followed by `\r\n\r\n`,
then the raw JSON payload of exactly that many bytes.

### Content-Length Headers vs Newline-Delimited JSON

| Aspect | Content-Length (LSP) | NDJSON (Newline-Delimited) |
|---|---|---|
| **Binary safety** | Yes -- payload can contain newlines | No -- must escape/remove newlines in values |
| **Parsing complexity** | Higher -- must parse header, track byte counts | Lower -- read until `\n`, parse JSON |
| **Debugging** | Harder to read raw stream | Easy to pipe through `jq` |
| **Error recovery** | Difficult -- one wrong byte count corrupts stream | Easy -- skip bad line, read next |
| **Streaming** | Must buffer full message before parsing | Can parse line-by-line |
| **Real-world adoption** | LSP, DAP (Debug Adapter Protocol) | MCP, Docker API, npm logs, ndjson.org |

**Recommendation for your case:** Use NDJSON. Content-Length headers are overkill for a
protocol you control end-to-end. NDJSON is what MCP (Model Context Protocol) chose for
exactly the same reason -- simplicity and debuggability. The only downside is that your
JSON values cannot contain literal newlines, but `serde_json` and Swift's `JSONEncoder`
both produce single-line output by default, so this is a non-issue.

### How LSP Handles Streaming / Long-Running Operations

LSP uses two mechanisms:

1. **Work Done Progress**: Server sends `$/progress` notifications with a token.
   The client shows a progress bar. Three phases: `begin`, `report` (with percentage),
   `end`.

2. **Partial Results**: For requests that may take a long time (e.g., find-all-references),
   the client includes a `partialResultToken` in the request. The server can then send
   partial results via `$/progress` notifications using that token, and the final response
   contains remaining results.

Both are JSON-RPC notifications (no response expected), fired alongside the pending request.

### Error Handling in LSP

LSP uses JSON-RPC 2.0 error responses:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": "optional additional info"
  }
}
```

Standard error codes: `-32700` (parse error), `-32600` (invalid request),
`-32601` (method not found), `-32602` (invalid params), `-32603` (internal error).
LSP reserves `-32800` to `-32899` for protocol-specific errors (e.g., `-32800` is
`RequestCancelled`).

---

## 2. NDJSON (Newline-Delimited JSON) Pattern

### How It Works

Each message is a single JSON object serialized on one line, terminated by `\n`.
No headers, no framing -- just JSON + newline.

```
{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"version":"1.0"}}\n
{"jsonrpc":"2.0","id":1,"result":{"status":"ok"}}\n
{"jsonrpc":"2.0","method":"progress","params":{"percent":50}}\n
```

### Real-World Tools Using NDJSON

- **MCP (Model Context Protocol)** -- Anthropic's protocol for tool use. Uses NDJSON
  over stdio. "Messages MUST be delimited by newlines and MUST NOT contain embedded
  newlines."
- **Docker Engine API** -- Streams build output and container logs as NDJSON
- **npm** -- `--json` flag outputs NDJSON for machine-parseable logs
- **jq** -- The de facto JSON CLI tool reads and writes NDJSON natively
- **Elasticsearch Bulk API** -- Uses NDJSON for batch operations
- **Apache Kafka** -- Log compaction uses NDJSON internally

### Handling Messages That Contain Newlines in Values

JSON serializers escape `\n` inside string values as `\\n` (two characters: backslash + n).
This means a properly serialized JSON object is always a single line. The rule is simple:
**never use pretty-printing when writing to the pipe.**

```swift
// CORRECT -- produces single-line JSON
let encoder = JSONEncoder()
// encoder.outputFormatting = [] // default, no pretty printing
let data = try encoder.encode(message)

// WRONG -- produces multi-line JSON, breaks NDJSON framing
encoder.outputFormatting = .prettyPrinted
```

```rust
// CORRECT -- single line
serde_json::to_string(&message)?;

// WRONG -- multi-line
serde_json::to_string_pretty(&message)?;
```

---

## 3. Protocol Design Decisions

### Request/Response with IDs vs Fire-and-Forget

JSON-RPC 2.0 provides both patterns:

**Requests (with ID)** -- Expect a response. Client assigns an incrementing integer ID.
Server must respond with the same ID. This allows multiplexing multiple in-flight requests.

```json
{"jsonrpc":"2.0","id":1,"method":"ocr","params":{"image_path":"/tmp/photo.png"}}
```

**Notifications (no ID)** -- Fire-and-forget. No response expected or allowed.
Perfect for progress updates, log messages, state changes.

```json
{"jsonrpc":"2.0","method":"progress","params":{"task_id":1,"percent":45}}
```

**Recommendation:** Use both. Requests for operations where you need a result (OCR,
speech recognition result). Notifications for progress, status updates, heartbeats.

### Handling Long-Running Operations (e.g., OCR)

Pattern: **Request + Progress Notifications + Response**

```
--> {"jsonrpc":"2.0","id":1,"method":"ocr","params":{"path":"/tmp/img.png"}}
<-- {"jsonrpc":"2.0","method":"progress","params":{"request_id":1,"percent":25,"stage":"preprocessing"}}
<-- {"jsonrpc":"2.0","method":"progress","params":{"request_id":1,"percent":75,"stage":"recognizing"}}
<-- {"jsonrpc":"2.0","id":1,"result":{"text":"Hello World","confidence":0.95}}
```

The progress notifications reference the request_id so the client knows which operation
they relate to. The final response closes the request.

**Cancellation:** Support a `cancel` notification:
```
--> {"jsonrpc":"2.0","method":"$/cancel","params":{"id":1}}
```

### Progress Reporting

Define a standard progress notification shape:

```json
{
  "jsonrpc": "2.0",
  "method": "$/progress",
  "params": {
    "request_id": 1,
    "percent": 45,
    "stage": "recognizing_text",
    "message": "Processing page 2 of 4"
  }
}
```

### Error Response Format

Follow JSON-RPC 2.0. Define application-specific error codes in a reserved range:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -1,
    "message": "OCR failed: image format not supported",
    "data": {
      "image_path": "/tmp/photo.heic",
      "supported_formats": ["png", "jpg", "tiff"]
    }
  }
}
```

Suggested application error codes:
- `-1` -- General error
- `-2` -- Permission denied (e.g., no microphone access)
- `-3` -- Resource not found
- `-4` -- Operation cancelled
- `-5` -- Timeout
- `-6` -- Feature not available on this OS version

### Versioning the Protocol

Include version in the initialization handshake:

```
--> {"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocol_version":"1.0","capabilities":["ocr","speech"]}}
<-- {"jsonrpc":"2.0","id":0,"result":{"protocol_version":"1.0","server_info":{"name":"stik-helper","version":"0.2.0"}}}
```

The `initialize` request is always the first message. Both sides declare their version.
If incompatible, the parent can show an error and refuse to use the sidecar.

---

## 4. Rust Side: Spawning and Communicating with Child Processes

### std::process::Command (Synchronous)

```rust
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

fn spawn_swift_cli() -> std::io::Result<()> {
    let mut child = Command::new("/path/to/swift-cli")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())  // capture logs separately
        .spawn()?;

    // Take ownership of stdin/stdout handles
    let mut child_stdin = child.stdin.take().expect("stdin was piped");
    let child_stdout = child.stdout.take().expect("stdout was piped");

    // Write a JSON message
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "ocr",
        "params": {"path": "/tmp/image.png"}
    });
    writeln!(child_stdin, "{}", serde_json::to_string(&request)?)?;

    // Read response line by line
    let reader = BufReader::new(child_stdout);
    for line in reader.lines() {
        let line = line?;
        let msg: serde_json::Value = serde_json::from_str(&line)?;
        println!("Received: {}", msg);
    }

    Ok(())
}
```

**Critical gotcha:** If you read stdout on the same thread that writes to stdin, you
can deadlock. The child fills its stdout buffer, blocks on write, and you block on
read waiting for the child which is blocked on write. Solution: read and write on
separate threads/tasks.

### Async Communication with Tokio

```rust
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use std::process::Stdio;

async fn spawn_and_communicate() -> Result<(), Box<dyn std::error::Error>> {
    let mut child = Command::new("/path/to/swift-cli")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();

    // Spawn a task to read stdout
    let read_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            // Parse each line as JSON
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(msg) => {
                    // Route based on message type
                    if msg.get("id").is_some() && msg.get("result").is_some() {
                        println!("Response: {}", msg);
                    } else if msg.get("method").is_some() {
                        println!("Notification: {}", msg);
                    }
                }
                Err(e) => eprintln!("Failed to parse JSON from child: {}", e),
            }
        }
    });

    // Write requests
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "ocr",
        "params": {"path": "/tmp/image.png"}
    });
    let msg = format!("{}\n", serde_json::to_string(&request)?);
    stdin.write_all(msg.as_bytes()).await?;

    // Wait for reader to finish (child closed stdout)
    read_handle.await?;

    Ok(())
}
```

**Important:** `serde_json`'s streaming deserializer is NOT async-compatible with tokio.
You must read a complete line as a `String` first, then parse synchronously with
`serde_json::from_str()`. This is fine for NDJSON since each line is a complete message.

### How Tauri's Sidecar API Handles This

Tauri 2.0 uses the `tauri-plugin-shell` crate. The pattern is:

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
async fn run_ocr(app: AppHandle, image_path: String) -> Result<String, String> {
    let (mut rx, mut child) = app.shell()
        .sidecar("stik-helper")
        .map_err(|e| e.to_string())?
        .spawn()
        .map_err(|e| e.to_string())?;

    // Write request to child's stdin
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "ocr",
        "params": {"path": image_path}
    });
    child.write(format!("{}\n", serde_json::to_string(&request).unwrap()).as_bytes())
        .map_err(|e| e.to_string())?;

    // Read stdout events
    let mut result = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                // Tauri already splits by newline, so `line` is one message
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                    if msg.get("result").is_some() {
                        result = msg["result"]["text"].as_str()
                            .unwrap_or("").to_string();
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                // Log debug output from child
                log::debug!("sidecar stderr: {}", line);
            }
            CommandEvent::Error(err) => {
                return Err(format!("Sidecar error: {}", err));
            }
            CommandEvent::Terminated(status) => {
                log::info!("Sidecar exited with: {:?}", status);
                break;
            }
            _ => {}
        }
    }

    Ok(result)
}
```

**Key Tauri behaviors:**
- `CommandEvent::Stdout(line)` already splits output by newlines -- you get one line per event
- Tauri requires configuring sidecar permissions in `capabilities/*.json`
- The sidecar binary must be in `src-tauri/binaries/` with platform-specific naming
- Tauri auto-appends the target triple to the binary name (e.g., `stik-helper-aarch64-apple-darwin`)

### Error Handling When Child Process Crashes

```rust
use std::process::ExitStatus;

async fn monitor_child(mut child: tokio::process::Child) {
    match child.wait().await {
        Ok(status) => {
            if status.success() {
                log::info!("Child exited normally");
            } else {
                match status.code() {
                    Some(code) => log::error!("Child exited with code: {}", code),
                    None => log::error!("Child killed by signal"),  // Unix only
                }
            }
        }
        Err(e) => {
            log::error!("Failed to wait on child: {}", e);
        }
    }
}
```

**Gotchas with child process crashes:**
1. Dropping a `Child` without calling `.wait()` or `.kill()` leaves a zombie process on Unix.
2. `try_wait()` is non-blocking -- useful for periodic health checks.
3. When stdout pipe breaks (child crashes), `reader.next_line()` returns `Ok(None)` (EOF).
4. When stdin pipe breaks, `stdin.write_all()` returns `Err` with `BrokenPipe`.
5. On macOS, a child killed by signal returns `ExitStatus` with `code() == None`. Use
   `.signal()` (Unix extension) to check which signal killed it.

---

## 5. Swift Side: Reading stdin and Writing stdout

### Reading stdin -- Three Approaches

**Approach A: `readLine()` (simplest, blocking)**

```swift
import Foundation

// Blocks the current thread until a line is available or EOF
while let line = readLine(strippingNewline: true) {
    guard let data = line.data(using: .utf8),
          let message = try? JSONDecoder().decode(RPCMessage.self, from: data) else {
        // Write error to stderr, never stdout
        FileHandle.standardError.write("Failed to parse: \(line)\n".data(using: .utf8)!)
        continue
    }
    handleMessage(message)
}
// readLine() returned nil = EOF = parent closed our stdin
exit(0)
```

**Approach B: `FileHandle.standardInput.bytes.lines` (async/await)**

```swift
import Foundation

@main
struct StikHelper {
    static func main() async throws {
        for try await line in FileHandle.standardInput.bytes.lines {
            guard let data = line.data(using: .utf8),
                  let message = try? JSONDecoder().decode(RPCMessage.self, from: data) else {
                logToStderr("Failed to parse: \(line)")
                continue
            }
            await handleMessage(message)
        }
        // Stream ended = EOF = graceful shutdown
    }
}
```

**Approach C: `readLine()` on background thread + RunLoop (for macOS framework access)**

This is what you need when the Swift CLI must run frameworks that require a RunLoop,
such as Speech framework or Vision framework.

```swift
import Foundation

// Set up unbuffered stdout immediately
setbuf(stdout, nil)

// Start reading stdin on a background thread
DispatchQueue(label: "com.stik.stdin-reader", qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8),
              let message = try? JSONDecoder().decode(RPCMessage.self, from: data) else {
            logToStderr("Parse error: \(line)")
            continue
        }
        // Dispatch work to main thread (where RunLoop lives)
        DispatchQueue.main.async {
            handleMessage(message)
        }
    }
    // EOF received -- shut down
    DispatchQueue.main.async {
        exit(0)
    }
}

// Run the main RunLoop -- required for Speech, Vision, etc.
RunLoop.main.run()
```

### Writing stdout -- The Critical Buffering Problem

**The single most important gotcha in this entire system:**

When Swift's stdout is connected to a pipe (not a terminal), it uses **block buffering**.
This means your JSON responses sit in a 4KB buffer and the parent process never sees them
until the buffer fills up or the process exits. Your parent will appear to hang.

**The fix:**

```swift
// Option 1: Disable buffering entirely at startup (RECOMMENDED)
setbuf(stdout, nil)

// Option 2: Flush after every write
func send(_ message: Encodable) throws {
    let data = try JSONEncoder().encode(message)
    let json = String(data: data, encoding: .utf8)!
    print(json)           // writes to stdout with \n
    fflush(stdout)        // CRITICAL: force flush
}

// Option 3: Use FileHandle directly (bypasses stdio buffering)
func send(_ message: Encodable) throws {
    let data = try JSONEncoder().encode(message)
    var output = data
    output.append(0x0A)   // append newline byte
    FileHandle.standardOutput.write(output)
    // FileHandle.write() is unbuffered -- no flush needed
}
```

**Recommendation:** Use `setbuf(stdout, nil)` at the very start of `main()`, then use
`print()` normally. This is the simplest and most reliable approach.

### print() vs FileHandle.standardOutput

| | `print()` | `FileHandle.standardOutput.write()` |
|---|---|---|
| **Buffering** | Uses C stdio buffering (block-buffered when piped) | Unbuffered (writes directly to fd) |
| **Newline** | Appends `\n` automatically | You must append `\n` yourself |
| **Thread safety** | Not thread-safe | Not thread-safe |
| **Encoding** | Handles String directly | Requires `Data` |
| **Flushing** | Need `fflush(stdout)` | No flush needed |

### Handling EOF and Graceful Shutdown

```swift
// readLine() returns nil on EOF
while let line = readLine(strippingNewline: true) {
    // process messages
}
// We reach here when parent closes our stdin
// Clean up resources before exiting
cleanupSpeechRecognizer()
cleanupTemporaryFiles()
exit(0)
```

The parent signals "no more input" by closing the child's stdin pipe. On the Rust side,
this happens when you drop the `ChildStdin` handle. The child's `readLine()` then returns
`nil` (EOF).

### Running a RunLoop for Framework Access

Many Apple frameworks (Speech, Vision, AVFoundation) require a RunLoop on the thread
where they operate. In a CLI tool, you must set this up manually:

```swift
import Foundation
import Speech

// Global state
var recognizer: SFSpeechRecognizer?

func handleMessage(_ msg: RPCMessage) {
    switch msg.method {
    case "speech.recognize":
        startRecognition(msg)
    case "speech.stop":
        stopRecognition(msg)
    default:
        sendError(id: msg.id, code: -32601, message: "Method not found: \(msg.method)")
    }
}

func startRecognition(_ msg: RPCMessage) {
    // This works because we are on the main thread with a RunLoop
    let request = SFSpeechURLRecognitionRequest(url: audioURL)
    recognizer?.recognitionTask(with: request) { result, error in
        // This callback fires on the main RunLoop
        if let result = result {
            sendResponse(id: msg.id, result: ["text": result.bestTranscription.formattedString])
        } else if let error = error {
            sendError(id: msg.id, code: -1, message: error.localizedDescription)
        }
    }
}

// Entry point
setbuf(stdout, nil)

DispatchQueue(label: "stdin", qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        if let data = line.data(using: .utf8),
           let msg = try? JSONDecoder().decode(RPCMessage.self, from: data) {
            DispatchQueue.main.async {
                handleMessage(msg)
            }
        }
    }
    DispatchQueue.main.async { exit(0) }
}

RunLoop.main.run()
```

---

## 6. Real-World Examples and References

### MCP (Model Context Protocol) -- The Closest Analogue

MCP is the best reference architecture for your use case. It was designed by Anthropic
specifically for spawning tool processes and communicating via JSON-RPC over stdio.

Key design decisions from MCP that you should follow:
1. **NDJSON framing** -- one JSON-RPC message per line, no Content-Length headers
2. **JSON-RPC 2.0** -- requests have IDs, notifications do not
3. **Initialization handshake** -- first message is always `initialize` with version negotiation
4. **Stderr for logging** -- protocol messages on stdout only, debug output on stderr
5. **Graceful shutdown** -- close stdin, wait for exit, SIGTERM, then SIGKILL

### sourcekit-lsp -- Swift's Own LSP Server

sourcekit-lsp uses the full LSP protocol (Content-Length headers + JSON-RPC). Its
`JSONRPCConnection` class:
- Redirects stdout to stderr at startup to prevent log contamination of the protocol stream
- Uses `DispatchIO` for non-blocking reads from file descriptors
- Maintains a buffer and parses Content-Length headers to extract complete messages
- Uses a `QueueBasedMessageHandler` protocol for dispatching decoded messages

The stdout-to-stderr redirect is a particularly clever pattern worth copying:

```swift
// Prevent accidental stdout writes from corrupting the protocol
dup2(FileHandle.standardError.fileDescriptor, FileHandle.standardOutput.fileDescriptor)
// Now use a dedicated file descriptor for protocol output
let protocolOutput = FileHandle(fileDescriptor: originalStdoutFd)
```

### swift-format

swift-format reads from stdin when no file arguments are given. It uses a simple
`readDataToEndOfFile()` approach since it processes the entire input as one blob.
Not relevant for streaming IPC.

### imsg-plus (Swift CLI with JSON-RPC over stdio)

An open-source Swift CLI that implements JSON-RPC 2.0 over stdin/stdout for programmatic
control of Apple Messages. This is the closest real-world example to what you are building.
Repository: https://github.com/micahbrich/imsg-plus

---

## 7. Recommended Protocol Design for Stik

Based on all the research, here is the recommended protocol for Stik's Rust-to-Swift
sidecar communication:

### Framing

NDJSON (newline-delimited JSON). One JSON-RPC 2.0 message per line.

### Message Types

```swift
// Swift models
struct RPCRequest: Codable {
    let jsonrpc: String  // always "2.0"
    let id: Int
    let method: String
    let params: [String: AnyCodable]?
}

struct RPCNotification: Codable {
    let jsonrpc: String
    let method: String
    let params: [String: AnyCodable]?
}

struct RPCResponse: Codable {
    let jsonrpc: String
    let id: Int
    let result: AnyCodable?
    let error: RPCError?
}

struct RPCError: Codable {
    let code: Int
    let message: String
    let data: AnyCodable?
}
```

### Lifecycle

```
Parent (Rust)                          Child (Swift)
    |                                      |
    |--- spawn process ------------------->|
    |                                      |-- setbuf(stdout, nil)
    |                                      |-- start stdin reader thread
    |                                      |-- RunLoop.main.run()
    |                                      |
    |--- initialize {version:"1.0"} ----->|
    |<-- result {version:"1.0"} ----------|
    |                                      |
    |--- ocr {path:"/tmp/img.png"} ------>|
    |<-- $/progress {percent:25} ---------|
    |<-- $/progress {percent:75} ---------|
    |<-- result {text:"Hello"} -----------|
    |                                      |
    |--- close stdin -------------------->|
    |                                  readLine() returns nil
    |                                  cleanup and exit(0)
    |<-- process exits -------------------|
    |                                      |
    |  (if no exit after 5s)               |
    |--- SIGTERM ------------------------>|
    |  (if no exit after 2s)               |
    |--- SIGKILL ------------------------>|
```

### Error Codes

```
-32700  Parse error (invalid JSON)
-32600  Invalid request (missing required fields)
-32601  Method not found
-32602  Invalid params
-32603  Internal error

-1      General application error
-2      Permission denied
-3      Resource not found
-4      Operation cancelled
-5      Timeout
-6      Feature unavailable
```

### Critical Implementation Checklist

**Swift side:**
- [ ] Call `setbuf(stdout, nil)` before any output
- [ ] Never use `JSONEncoder.outputFormatting = .prettyPrinted`
- [ ] Read stdin on a background thread, use main thread for RunLoop/framework calls
- [ ] Write debug/log output to stderr, never stdout
- [ ] Handle `readLine() == nil` as graceful shutdown signal
- [ ] Use `fflush(stdout)` after every `print()` if not using `setbuf`

**Rust side:**
- [ ] Use `Stdio::piped()` for stdin, stdout, and stderr
- [ ] Read stdout on a separate tokio task from writing stdin (avoid deadlock)
- [ ] Handle `BrokenPipe` errors on stdin write (child crashed)
- [ ] Handle EOF on stdout read (child exited)
- [ ] Call `child.wait()` to avoid zombie processes
- [ ] Implement graceful shutdown: close stdin, wait, SIGTERM, SIGKILL
- [ ] Parse each stdout line as JSON independently (skip unparseable lines)

---

## Sources

- LSP Specification: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- JSON-RPC 2.0 Specification: https://www.jsonrpc.org/specification
- NDJSON Specification: https://ndjson.com/definition/
- MCP Transport Specification: https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
- MCP Stdio Walkthrough: https://foojay.io/today/understanding-mcp-through-raw-stdio-communication/
- Tokio Process Module: https://docs.rs/tokio/latest/tokio/process/index.html
- Rust std::process Pipes: https://doc.rust-lang.org/rust-by-example/std_misc/process/pipe.html
- Tauri Sidecar Docs: https://v2.tauri.app/develop/sidecar/
- Tauri Shell Plugin: https://v2.tauri.app/plugin/shell/
- sourcekit-lsp: https://github.com/swiftlang/sourcekit-lsp
- Swift readLine: https://developer.apple.com/documentation/swift/readline(strippingnewline:)
- Swift FileHandle: https://developer.apple.com/documentation/foundation/filehandle
- imsg-plus (Swift JSON-RPC CLI): https://github.com/micahbrich/imsg-plus
