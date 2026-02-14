/// AI Assistant — on-device language model features via DarwinKit's LLM handler.
///
/// Uses Apple Foundation Models (macOS 26+) through DarwinKit for:
/// - Rephrasing notes in different styles
/// - Summarizing note content
/// - Smart organization (folder + tag suggestions via LLM)
/// - Free-form generation with RAG context from user's notes
///
/// All processing happens on-device. No data leaves the machine.
use serde::Serialize;
use serde_json::Value;

use super::darwinkit;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AiAvailability {
    pub available: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RephraseResult {
    pub text: String,
    pub style: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SummarizeResult {
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrganizeResult {
    pub suggested_folder: Option<String>,
    pub tags: Vec<String>,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenerateResult {
    pub text: String,
}

// ── Helpers ────────────────────────────────────────────────────────

fn check_ai_enabled() -> Result<(), String> {
    let enabled = super::settings::get_settings().ok()
        .map(|s| s.ai_features_enabled)
        .unwrap_or(false);

    if !enabled {
        return Err("AI features are disabled in settings".to_string());
    }

    if !darwinkit::is_available() {
        return Err("DarwinKit sidecar not available".to_string());
    }

    Ok(())
}

/// Build RAG context by finding semantically similar notes to inject into prompts.
/// Returns a formatted string of relevant note snippets.
fn build_rag_context(
    content: &str,
    embeddings: &super::embeddings::EmbeddingIndex,
    index: &super::index::NoteIndex,
    max_notes: usize,
) -> String {
    embeddings.ensure_loaded();

    // Detect language
    let lang = darwinkit::call("nlp.language", Some(serde_json::json!({ "text": content })))
        .ok()
        .and_then(|v| v.get("language").and_then(|l| l.as_str()).map(String::from))
        .unwrap_or_else(|| "en".to_string());

    // Embed the content
    let vector = darwinkit::call(
        "nlp.embed",
        Some(serde_json::json!({ "text": content, "language": lang })),
    )
    .ok()
    .and_then(|v| {
        v.get("vector")
            .and_then(|a| a.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_f64()).collect::<Vec<f64>>())
    })
    .unwrap_or_default();

    if vector.is_empty() {
        return String::new();
    }

    // Find similar notes
    let nearest = embeddings.nearest(&vector, max_notes, &lang);
    let mut context_parts = Vec::new();

    for (path, similarity) in nearest {
        if similarity < 0.3 {
            continue;
        }
        if let Some(entry) = index.get(&path) {
            context_parts.push(format!(
                "- [{}] {}: {}",
                entry.folder,
                entry.title,
                entry.preview.replace('\n', " ").chars().take(200).collect::<String>()
            ));
        }
    }

    if context_parts.is_empty() {
        return String::new();
    }

    format!("Related notes from this user:\n{}", context_parts.join("\n"))
}

// ── Tauri Commands ─────────────────────────────────────────────────

#[tauri::command]
pub async fn ai_available() -> AiAvailability {
    let ai_enabled = super::settings::get_settings().ok()
        .map(|s| s.ai_features_enabled)
        .unwrap_or(false);

    if !ai_enabled {
        return AiAvailability {
            available: false,
            note: Some("AI features are disabled in settings".to_string()),
        };
    }

    if !darwinkit::is_available() {
        return AiAvailability {
            available: false,
            note: Some("DarwinKit sidecar not running".to_string()),
        };
    }

    // Check LLM availability via DarwinKit
    match darwinkit::call("llm.available", None) {
        Ok(result) => {
            let available = result
                .get("available")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let note = result
                .get("note")
                .and_then(|v| v.as_str())
                .map(String::from);
            AiAvailability { available, note }
        }
        Err(e) => AiAvailability {
            available: false,
            note: Some(e),
        },
    }
}

#[tauri::command]
pub async fn ai_rephrase(content: String, style: Option<String>) -> Result<RephraseResult, String> {
    let style = style.unwrap_or_else(|| "casual".to_string());

    tauri::async_runtime::spawn_blocking(move || {
        check_ai_enabled()?;

        let result = darwinkit::call(
            "llm.rephrase",
            Some(serde_json::json!({
                "text": content,
                "style": style,
            })),
        )?;

        let text = result
            .get("text")
            .and_then(|v| v.as_str())
            .ok_or("Invalid response from LLM")?
            .to_string();
        let returned_style = result
            .get("style")
            .and_then(|v| v.as_str())
            .unwrap_or(&style)
            .to_string();

        Ok(RephraseResult {
            text,
            style: returned_style,
        })
    })
    .await
    .map_err(|e| format!("Rephrase failed: {}", e))?
}

#[tauri::command]
pub async fn ai_summarize(content: String) -> Result<SummarizeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_ai_enabled()?;

        let result = darwinkit::call(
            "llm.summarize",
            Some(serde_json::json!({ "text": content })),
        )?;

        let summary = result
            .get("summary")
            .and_then(|v| v.as_str())
            .ok_or("Invalid response from LLM")?
            .to_string();

        Ok(SummarizeResult { summary })
    })
    .await
    .map_err(|e| format!("Summarize failed: {}", e))?
}

#[tauri::command]
pub async fn ai_organize(
    app: tauri::AppHandle,
    content: String,
    current_folder: String,
) -> Result<OrganizeResult, String> {
    use tauri::Manager;

    tauri::async_runtime::spawn_blocking(move || {
        check_ai_enabled()?;

        // Get all folder names
        let folders = super::folders::list_folders().unwrap_or_default();

        // Get existing tags from similar notes via RAG
        let index = app.state::<super::index::NoteIndex>();
        let embeddings = app.state::<super::embeddings::EmbeddingIndex>();
        let rag_context = build_rag_context(&content, &embeddings, &index, 5);

        // Collect tags from similar notes (simple extraction from context)
        let existing_tags: Vec<String> = Vec::new(); // Could extract from notes later

        let mut params = serde_json::json!({
            "text": content,
            "folders": folders,
            "existingTags": existing_tags,
        });

        // Inject RAG context into the text if available
        if !rag_context.is_empty() {
            params["text"] = Value::String(format!(
                "{}\n\n---\nContext about the user's notes:\n{}",
                content, rag_context
            ));
        }

        let result = darwinkit::call("llm.organize", Some(params))?;

        let suggested_folder = result
            .get("suggestedFolder")
            .and_then(|v| v.as_str())
            .map(String::from);
        let tags = result
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let reasoning = result
            .get("reasoning")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Don't suggest the same folder
        let suggested_folder = suggested_folder.filter(|f| f != &current_folder);

        Ok(OrganizeResult {
            suggested_folder,
            tags,
            reasoning,
        })
    })
    .await
    .map_err(|e| format!("Organize failed: {}", e))?
}

#[tauri::command]
pub async fn ai_generate(
    app: tauri::AppHandle,
    prompt: String,
    note_context: Option<String>,
) -> Result<GenerateResult, String> {
    use tauri::Manager;

    tauri::async_runtime::spawn_blocking(move || {
        check_ai_enabled()?;

        let index = app.state::<super::index::NoteIndex>();
        let embeddings = app.state::<super::embeddings::EmbeddingIndex>();

        // Build RAG context from the prompt or note content
        let context_source = note_context.as_deref().unwrap_or(&prompt);
        let rag_context = build_rag_context(context_source, &embeddings, &index, 3);

        let system_instructions = if rag_context.is_empty() {
            "You are a helpful note-taking assistant. Be concise and direct.".to_string()
        } else {
            format!(
                "You are a helpful note-taking assistant. Be concise and direct.\n\n{}",
                rag_context
            )
        };

        let result = darwinkit::call(
            "llm.generate",
            Some(serde_json::json!({
                "prompt": prompt,
                "systemInstructions": system_instructions,
            })),
        )?;

        let text = result
            .get("text")
            .and_then(|v| v.as_str())
            .ok_or("Invalid response from LLM")?
            .to_string();

        Ok(GenerateResult { text })
    })
    .await
    .map_err(|e| format!("Generate failed: {}", e))?
}
