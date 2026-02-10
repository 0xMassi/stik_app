// Anonymous, privacy-respecting analytics via PostHog.
//
// Events: app_opened, note_created, note_updated, note_deleted
// Properties: word count, system info — never content, titles, folders, or PII.

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;
use tauri::AppHandle;
use uuid::Uuid;

// Injected at build time via POSTHOG_API_KEY env var (set in CI from GitHub secret).
// When unset (local dev builds), analytics silently no-ops.
const POSTHOG_API_KEY: Option<&str> = option_env!("POSTHOG_API_KEY");
const POSTHOG_HOST: &str = "https://eu.i.posthog.com";

static DEVICE_ID: OnceLock<String> = OnceLock::new();
static ANALYTICS_ENABLED: OnceLock<bool> = OnceLock::new();

fn analytics_id_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("analytics-id"))
}

fn get_or_create_device_id() -> Result<String, String> {
    let path = analytics_id_path()?;

    if path.exists() {
        let id = fs::read_to_string(&path)
            .map_err(|e| e.to_string())?
            .trim()
            .to_string();
        if !id.is_empty() {
            return Ok(id);
        }
    }

    let id = Uuid::new_v4().to_string();
    fs::write(&path, &id).map_err(|e| e.to_string())?;
    Ok(id)
}

fn collect_system_props() -> Value {
    let os_version = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let screen_resolution = Command::new("system_profiler")
        .args(["SPDisplaysDataType", "-json"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|json_str| serde_json::from_str::<Value>(&json_str).ok())
        .and_then(|v| {
            v.get("SPDisplaysDataType")?
                .as_array()?
                .iter()
                .find_map(|gpu| {
                    gpu.get("spdisplays_ndrvs")?
                        .as_array()?
                        .first()?
                        .get("_spdisplays_resolution")
                        .and_then(|r| r.as_str())
                        .map(|s| s.to_string())
                })
        })
        .unwrap_or_default();

    let locale = std::env::var("LANG").unwrap_or_default();

    json!({
        "$os": "macOS",
        "os_version": os_version,
        "arch": std::env::consts::ARCH,
        "screen_resolution": screen_resolution,
        "app_version": env!("CARGO_PKG_VERSION"),
        "locale": locale,
    })
}

async fn send_event(event: &str, extra_properties: Value) {
    let api_key = match POSTHOG_API_KEY {
        Some(k) if !k.is_empty() => k,
        _ => return,
    };

    let device_id = match DEVICE_ID.get() {
        Some(id) => id.clone(),
        None => return,
    };

    let mut properties = extra_properties.as_object().cloned().unwrap_or_default();
    properties.insert("distinct_id".to_string(), json!(device_id));

    let body = json!({
        "api_key": api_key,
        "event": event,
        "properties": properties,
    });

    eprintln!("[analytics] sending: {}", event);

    match reqwest::Client::new()
        .post(format!("{}/capture/", POSTHOG_HOST))
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            eprintln!("[analytics] {} → {} {}", event, status, body_text);
        }
        Err(e) => eprintln!("[analytics] {} failed: {}", event, e),
    }
}

/// Fire-and-forget: spawns an async task to send the event.
/// No-ops silently if analytics is disabled or no API key is present.
pub fn track(event: &str, properties: Value) {
    if !ANALYTICS_ENABLED.get().copied().unwrap_or(false) {
        return;
    }
    let event = event.to_string();
    tauri::async_runtime::spawn(async move {
        send_event(&event, properties).await;
    });
}

pub fn start_analytics(app: &AppHandle) {
    let _ = app;

    // Initialize device ID and enabled flag once
    let enabled = POSTHOG_API_KEY.is_some()
        && super::settings::load_settings_from_file()
            .map(|s| s.analytics_enabled)
            .unwrap_or(false);

    if let Ok(id) = get_or_create_device_id() {
        let _ = DEVICE_ID.set(id);
    }
    let _ = ANALYTICS_ENABLED.set(enabled);

    if !enabled {
        eprintln!("[analytics] disabled (key={}, setting={})",
            POSTHOG_API_KEY.is_some(),
            super::settings::load_settings_from_file().map(|s| s.analytics_enabled).unwrap_or(false),
        );
        return;
    }

    // Send app_opened with full system info (only at startup)
    let system_props = collect_system_props();
    tauri::async_runtime::spawn(async move {
        send_event("app_opened", system_props).await;
    });
}

#[tauri::command]
pub fn get_analytics_device_id() -> Result<String, String> {
    get_or_create_device_id()
}
