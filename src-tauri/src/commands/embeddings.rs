/// Embedding index — persists note embeddings to disk, provides cosine
/// similarity search and per-folder centroids for folder suggestion.
///
/// Storage: `~/.stik/embeddings.json` (~4KB per note, 512 floats each).
/// Uses content hashing to skip re-embedding unchanged notes.
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use super::darwinkit;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteEmbedding {
    pub vector: Vec<f64>,
    pub content_hash: String,
    pub language: String,
}

pub struct EmbeddingIndex {
    entries: Mutex<HashMap<String, NoteEmbedding>>,
    loaded: Mutex<bool>,
}

// ── Persistence ────────────────────────────────────────────────────

fn embeddings_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let config_dir = home.join(".stik");
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.join("embeddings.json"))
}

fn content_hash(content: &str) -> String {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

// ── Cosine Similarity ──────────────────────────────────────────────

pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let mut dot = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for i in 0..a.len() {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

// ── EmbeddingIndex ─────────────────────────────────────────────────

impl EmbeddingIndex {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            loaded: Mutex::new(false),
        }
    }

    /// Lazy-load from disk on first access.
    pub fn ensure_loaded(&self) {
        let mut loaded = self.loaded.lock().unwrap_or_else(|e| e.into_inner());
        if *loaded {
            return;
        }
        *loaded = true;
        drop(loaded);

        let path = match embeddings_path() {
            Ok(p) => p,
            Err(_) => return,
        };

        if !path.exists() {
            return;
        }

        let data = match fs::read_to_string(&path) {
            Ok(d) => d,
            Err(_) => return,
        };

        let map: HashMap<String, NoteEmbedding> = match serde_json::from_str(&data) {
            Ok(m) => m,
            Err(_) => return,
        };

        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        *entries = map;
    }

    /// Atomic write to disk (tmp + rename).
    pub fn save(&self) -> Result<(), String> {
        let path = embeddings_path()?;
        let tmp = path.with_extension("json.tmp");

        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let json = serde_json::to_string(&*entries).map_err(|e| e.to_string())?;
        drop(entries);

        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Add or update an embedding for a note path.
    pub fn add_entry(&self, path: &str, embedding: NoteEmbedding) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.insert(path.to_string(), embedding);
    }

    /// Remove embedding when a note is deleted.
    pub fn remove_entry(&self, path: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.remove(path);
    }

    /// Move embedding when a note is moved to another folder.
    pub fn move_entry(&self, old_path: &str, new_path: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(embedding) = entries.remove(old_path) {
            entries.insert(new_path.to_string(), embedding);
        }
    }

    /// Get the content hash for a path (to check if re-embedding is needed).
    pub fn get_hash(&self, path: &str) -> Option<String> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.get(path).map(|e| e.content_hash.clone())
    }

    /// Find the k nearest notes to a query vector. Only compares embeddings
    /// in the same language since Apple NLEmbedding uses different vector
    /// spaces (and dimensions) per language.
    pub fn nearest(&self, query: &[f64], k: usize, language: &str) -> Vec<(String, f64)> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());

        let mut scored: Vec<(String, f64)> = entries
            .iter()
            .filter(|(_, emb)| emb.language == language)
            .map(|(path, emb)| (path.clone(), cosine_similarity(query, &emb.vector)))
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(k);
        scored
    }

    /// Compute average embedding vector per folder, filtered to a single
    /// language. Different languages produce incompatible vector spaces.
    pub fn folder_centroids(&self, language: &str) -> HashMap<String, Vec<f64>> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let mut folder_sums: HashMap<String, (Vec<f64>, usize)> = HashMap::new();

        for (path, emb) in entries.iter().filter(|(_, e)| e.language == language) {
            // Extract folder name from path: .../Stik/{Folder}/{file}.md
            let folder = std::path::Path::new(path)
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if folder.is_empty() {
                continue;
            }

            let entry = folder_sums
                .entry(folder)
                .or_insert_with(|| (vec![0.0; emb.vector.len()], 0));

            for (i, val) in emb.vector.iter().enumerate() {
                if i < entry.0.len() {
                    entry.0[i] += val;
                }
            }
            entry.1 += 1;
        }

        folder_sums
            .into_iter()
            .map(|(folder, (sum, count))| {
                let centroid: Vec<f64> = sum.into_iter().map(|v| v / count as f64).collect();
                (folder, centroid)
            })
            .collect()
    }

    /// Number of embeddings stored.
    pub fn len(&self) -> usize {
        self.entries.lock().unwrap_or_else(|e| e.into_inner()).len()
    }
}

// ── Background Build ───────────────────────────────────────────────

/// Embed a single note's content via DarwinKit. Returns the embedding
/// if successful, or None if the bridge isn't ready.
pub fn embed_content(content: &str) -> Option<NoteEmbedding> {
    if !darwinkit::is_available() {
        return None;
    }

    // Detect language first
    let lang_result = darwinkit::call(
        "nlp.language",
        Some(serde_json::json!({ "text": content })),
    )
    .ok()?;
    let language = lang_result
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("en")
        .to_string();

    // Embed with detected language
    let embed_result = darwinkit::call(
        "nlp.embed",
        Some(serde_json::json!({
            "text": content,
            "language": language,
        })),
    )
    .ok()?;

    let vector: Vec<f64> = embed_result
        .get("vector")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
        .unwrap_or_default();

    if vector.is_empty() {
        return None;
    }

    Some(NoteEmbedding {
        vector,
        content_hash: content_hash(content),
        language,
    })
}

/// Build embeddings for all notes in the NoteIndex that are missing or stale.
/// Called as a background task during app setup.
pub fn build_embeddings(
    index: &super::index::NoteIndex,
    embeddings: &EmbeddingIndex,
) {
    embeddings.ensure_loaded();

    let entries = match index.list(None) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("Failed to list notes for embedding build: {}", e);
            return;
        }
    };

    // Wait for DarwinKit to become available (up to 10s)
    for _ in 0..20 {
        if darwinkit::is_available() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    if !darwinkit::is_available() {
        eprintln!("DarwinKit not available, skipping embedding build");
        return;
    }

    let mut processed = 0;
    let mut embedded = 0;

    for entry in &entries {
        // Read full content
        let content = match fs::read_to_string(&entry.path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if content.trim().is_empty() {
            continue;
        }

        let hash = content_hash(&content);

        // Skip if hash matches existing embedding
        if let Some(existing_hash) = embeddings.get_hash(&entry.path) {
            if existing_hash == hash {
                continue;
            }
        }

        // Embed
        if let Some(embedding) = embed_content(&content) {
            embeddings.add_entry(&entry.path, embedding);
            embedded += 1;
        }

        processed += 1;

        // Save every 50 notes
        if processed % 50 == 0 {
            if let Err(e) = embeddings.save() {
                eprintln!("Failed to save embeddings (batch): {}", e);
            }
        }
    }

    // Final save
    if embedded > 0 {
        if let Err(e) = embeddings.save() {
            eprintln!("Failed to save embeddings (final): {}", e);
        }
    }

    eprintln!(
        "Embedding build complete: {} embedded, {} total stored",
        embedded,
        embeddings.len()
    );
}
