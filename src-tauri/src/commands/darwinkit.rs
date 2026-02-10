/// DarwinKit sidecar bridge — JSON-RPC over stdio.
///
/// Spawns the darwinkit binary as a child process, communicates via
/// newline-delimited JSON-RPC on stdin/stdout, and auto-restarts on death.
/// Follows the OnceLock<Sender> background-worker pattern from git_share.rs.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write as IoWrite};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::Manager;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<Value>,
}

struct BridgeMessage {
    id: String,
    method: String,
    params: Option<Value>,
    reply_tx: mpsc::Sender<Result<Value, String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DarwinKitStatus {
    pub ready: bool,
    pub version: Option<String>,
    pub capabilities: Vec<String>,
}

// ── Static Globals ─────────────────────────────────────────────────

static BRIDGE_SENDER: OnceLock<Sender<BridgeMessage>> = OnceLock::new();
static BRIDGE_READY: OnceLock<Mutex<DarwinKitStatus>> = OnceLock::new();
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(1);

fn bridge_status() -> &'static Mutex<DarwinKitStatus> {
    BRIDGE_READY.get_or_init(|| {
        Mutex::new(DarwinKitStatus {
            ready: false,
            version: None,
            capabilities: Vec::new(),
        })
    })
}

fn next_id() -> String {
    REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed).to_string()
}

// ── Public API ─────────────────────────────────────────────────────

/// Resolve the sidecar binary path.
/// Prod: `{bundle}/Contents/Resources/binaries/darwinkit-{triple}`
/// Dev:  `src-tauri/binaries/darwinkit-{triple}` (CARGO_MANIFEST_DIR)
fn resolve_sidecar_path(app: &tauri::AppHandle) -> Result<String, String> {
    let binary_rel = format!(
        "binaries/darwinkit-{}-apple-darwin",
        std::env::consts::ARCH
    );

    // 1) Resource dir (works in production bundles)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir.join(&binary_rel);
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // 2) Relative to CARGO_MANIFEST_DIR (works in dev via `cargo run` / `tauri dev`)
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let dev_path = std::path::Path::new(manifest_dir).join(&binary_rel);
    if dev_path.exists() {
        return Ok(dev_path.to_string_lossy().to_string());
    }

    Err(format!(
        "DarwinKit sidecar not found (looked for {})",
        binary_rel
    ))
}

/// Start the bridge background thread. Call once during app setup.
pub fn start_bridge(app: tauri::AppHandle) {
    if BRIDGE_SENDER.get().is_some() {
        return;
    }

    let sidecar_path = match resolve_sidecar_path(&app) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("DarwinKit sidecar not available: {}", e);
            return;
        }
    };

    let (tx, rx) = mpsc::channel::<BridgeMessage>();
    if BRIDGE_SENDER.set(tx).is_err() {
        return;
    }

    if let Err(e) = thread::Builder::new()
        .name("stik-darwinkit".to_string())
        .spawn(move || bridge_loop(sidecar_path, rx))
    {
        eprintln!("Failed to start darwinkit bridge thread: {}", e);
    }
}

/// Send a JSON-RPC call and wait for the response (10s timeout).
pub fn call(method: &str, params: Option<Value>) -> Result<Value, String> {
    let sender = BRIDGE_SENDER
        .get()
        .ok_or_else(|| "DarwinKit bridge not started".to_string())?;

    let id = next_id();
    let (reply_tx, reply_rx) = mpsc::channel();

    sender
        .send(BridgeMessage {
            id,
            method: method.to_string(),
            params,
            reply_tx,
        })
        .map_err(|_| "DarwinKit bridge channel closed".to_string())?;

    reply_rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "DarwinKit call timed out (10s)".to_string())?
}

/// Non-blocking check whether the sidecar is running.
pub fn is_available() -> bool {
    bridge_status()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .ready
}

// ── Bridge Loop ────────────────────────────────────────────────────

fn bridge_loop(sidecar_path: String, rx: Receiver<BridgeMessage>) {
    loop {
        match spawn_sidecar(&sidecar_path) {
            Ok((mut child, stdin, stdout)) => {
                run_session(stdin, stdout, &rx);
                let _ = child.kill();
                let _ = child.wait();
            }
            Err(e) => {
                eprintln!("Failed to spawn darwinkit sidecar: {}", e);
            }
        }

        // Mark not ready while restarting
        {
            let mut status = bridge_status().lock().unwrap_or_else(|e| e.into_inner());
            status.ready = false;
        }

        // Drain pending messages so callers don't hang
        while let Ok(msg) = rx.try_recv() {
            let _ = msg
                .reply_tx
                .send(Err("DarwinKit sidecar restarting".to_string()));
        }

        thread::sleep(Duration::from_secs(2));
    }
}

fn spawn_sidecar(path: &str) -> Result<(Child, ChildStdin, ChildStdout), String> {
    let mut child = Command::new(path)
        .arg("serve")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn failed: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    Ok((child, stdin, stdout))
}

fn run_session(mut stdin: ChildStdin, stdout: ChildStdout, rx: &Receiver<BridgeMessage>) {
    let pending: std::sync::Arc<Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>> =
        std::sync::Arc::new(Mutex::new(HashMap::new()));

    // Reader thread: parses stdout lines and dispatches responses
    let pending_clone = pending.clone();
    let reader_handle = thread::Builder::new()
        .name("stik-darwinkit-reader".to_string())
        .spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let line = match line {
                    Ok(l) => l,
                    Err(_) => break,
                };

                if line.trim().is_empty() {
                    continue;
                }

                let response: JsonRpcResponse = match serde_json::from_str(&line) {
                    Ok(r) => r,
                    Err(e) => {
                        eprintln!("darwinkit: invalid JSON response: {}", e);
                        continue;
                    }
                };

                // Handle the "ready" notification (no id)
                if response.id.is_none() {
                    if response.method.as_deref() == Some("ready") {
                        if let Some(params) = &response.params {
                            let version = params
                                .get("version")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            let capabilities = params
                                .get("capabilities")
                                .and_then(|v| v.as_array())
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                        .collect()
                                })
                                .unwrap_or_default();

                            let mut status =
                                bridge_status().lock().unwrap_or_else(|e| e.into_inner());
                            status.ready = true;
                            status.version = version;
                            status.capabilities = capabilities;
                        }
                    }
                    continue;
                }

                // Dispatch response to waiting caller
                let id = response.id.unwrap();
                let reply_tx = {
                    let mut map = pending_clone.lock().unwrap_or_else(|e| e.into_inner());
                    map.remove(&id)
                };

                if let Some(tx) = reply_tx {
                    let result = if let Some(error) = response.error {
                        let msg = error
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown darwinkit error");
                        Err(msg.to_string())
                    } else {
                        Ok(response.result.unwrap_or(Value::Null))
                    };
                    let _ = tx.send(result);
                }
            }
        });

    if reader_handle.is_err() {
        eprintln!("Failed to spawn darwinkit reader thread");
        return;
    }

    // Main loop: take messages from callers, write to stdin
    for msg in rx.iter() {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: msg.id.clone(),
            method: msg.method,
            params: msg.params,
        };

        let json = match serde_json::to_string(&request) {
            Ok(j) => j,
            Err(e) => {
                let _ = msg
                    .reply_tx
                    .send(Err(format!("Failed to serialize request: {}", e)));
                continue;
            }
        };

        // Register pending response
        {
            let mut map = pending.lock().unwrap_or_else(|e| e.into_inner());
            map.insert(msg.id.clone(), msg.reply_tx);
        }

        // Write to sidecar stdin
        if writeln!(stdin, "{}", json).is_err() || stdin.flush().is_err() {
            // Process died — remove pending and break to trigger restart
            let mut map = pending.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(tx) = map.remove(&msg.id) {
                let _ = tx.send(Err("DarwinKit sidecar process died".to_string()));
            }
            break;
        }
    }
}

// ── Tauri Commands ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct SemanticResult {
    pub path: String,
    pub filename: String,
    pub folder: String,
    pub title: String,
    pub snippet: String,
    pub created: String,
    pub similarity: f64,
}

#[tauri::command]
pub fn darwinkit_status() -> DarwinKitStatus {
    bridge_status()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[tauri::command]
pub async fn darwinkit_call(method: String, params: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || call(&method, params))
        .await
        .map_err(|e| format!("DarwinKit call failed: {}", e))?
}

#[tauri::command]
pub async fn semantic_search(
    app: tauri::AppHandle,
    query: String,
    folder: Option<String>,
) -> Result<Vec<SemanticResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let index = app.state::<super::index::NoteIndex>();
        let embeddings = app.state::<super::embeddings::EmbeddingIndex>();
        semantic_search_inner(&query, folder.as_deref(), &index, &embeddings)
    })
    .await
    .map_err(|e| format!("Semantic search failed: {}", e))?
}

fn semantic_search_inner(
    query: &str,
    folder: Option<&str>,
    index: &super::index::NoteIndex,
    embeddings: &super::embeddings::EmbeddingIndex,
) -> Result<Vec<SemanticResult>, String> {
    if !super::settings::load_settings_from_file().map(|s| s.ai_features_enabled).unwrap_or(false) {
        return Ok(Vec::new());
    }

    if !is_available() {
        return Err("DarwinKit not available".to_string());
    }

    embeddings.ensure_loaded();

    // Detect language
    let lang_result = call(
        "nlp.language",
        Some(serde_json::json!({ "text": query })),
    )?;
    let language = lang_result
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("en");

    // Embed query
    let embed_result = call(
        "nlp.embed",
        Some(serde_json::json!({
            "text": query,
            "language": language,
        })),
    )?;

    let query_vector: Vec<f64> = embed_result
        .get("vector")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
        .unwrap_or_default();

    if query_vector.is_empty() {
        return Err("Failed to embed query".to_string());
    }

    // Find nearest (same language only — different languages use different vector spaces)
    let nearest = embeddings.nearest(&query_vector, 10, language);

    // Build results with NoteIndex metadata, filtering low similarity
    let mut results = Vec::new();
    for (path, similarity) in nearest {
        if similarity < 0.3 {
            continue;
        }
        if let Some(entry) = index.get(&path) {
            if let Some(f) = folder {
                if entry.folder != f {
                    continue;
                }
            }
            results.push(SemanticResult {
                path: entry.path,
                filename: entry.filename,
                folder: entry.folder,
                title: entry.title,
                snippet: entry.preview.replace('\n', " "),
                created: entry.created,
                similarity: (similarity * 100.0).round() / 100.0,
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn suggest_folder(
    app: tauri::AppHandle,
    content: String,
    current_folder: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let embeddings = app.state::<super::embeddings::EmbeddingIndex>();
        suggest_folder_inner(&content, &current_folder, &embeddings)
    })
    .await
    .map_err(|e| format!("Folder suggestion failed: {}", e))?
}

fn suggest_folder_inner(
    content: &str,
    current_folder: &str,
    embeddings: &super::embeddings::EmbeddingIndex,
) -> Result<Option<String>, String> {
    if !super::settings::load_settings_from_file().map(|s| s.ai_features_enabled).unwrap_or(false) {
        return Ok(None);
    }

    // Skip short content
    if content.split_whitespace().count() < 5 {
        return Ok(None);
    }

    if !is_available() {
        return Ok(None);
    }

    embeddings.ensure_loaded();

    // Detect language first — needed for language-filtered centroids
    let lang_result = call(
        "nlp.language",
        Some(serde_json::json!({ "text": content })),
    )?;
    let language = lang_result
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("en");

    // Compute centroids only from notes in the same language
    let centroids = embeddings.folder_centroids(language);
    if centroids.len() < 2 {
        return Ok(None);
    }

    let embed_result = call(
        "nlp.embed",
        Some(serde_json::json!({
            "text": content,
            "language": language,
        })),
    )?;

    let vector: Vec<f64> = embed_result
        .get("vector")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
        .unwrap_or_default();

    if vector.is_empty() {
        return Ok(None);
    }

    // Find most similar folder centroid
    let mut best_folder = None;
    let mut best_score = 0.0f64;

    for (folder, centroid) in &centroids {
        let sim = super::embeddings::cosine_similarity(&vector, centroid);
        if sim > best_score {
            best_score = sim;
            best_folder = Some(folder.clone());
        }
    }

    // Only suggest if score > 0.35 and different from current
    match best_folder {
        Some(folder) if best_score > 0.35 && folder != current_folder => Ok(Some(folder)),
        _ => Ok(None),
    }
}
