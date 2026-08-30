// Anonymous, privacy-respecting analytics via PostHog.
//
// Events: app_opened, note_created, note_updated, note_deleted
// Properties: word count, system info — never content, titles, folders, or PII.

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use uuid::Uuid;

// Injected at build time via POSTHOG_API_KEY env var (set in CI from GitHub secret).
// When unset (local dev builds), analytics silently no-ops.
const POSTHOG_API_KEY: Option<&str> = option_env!("POSTHOG_API_KEY");
const POSTHOG_HOST: &str = "https://eu.i.posthog.com";

struct AnalyticsRuntime {
    enabled: AtomicBool,
    device_id: Mutex<Option<String>>,
}

impl Default for AnalyticsRuntime {
    fn default() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            device_id: Mutex::new(None),
        }
    }
}

impl AnalyticsRuntime {
    fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Acquire)
    }

    fn configure(&self, enabled: bool, id_path: &std::path::Path) -> Result<(), String> {
        self.enabled.store(enabled, Ordering::Release);
        if !enabled {
            *self.device_id.lock().unwrap_or_else(|e| e.into_inner()) = None;
            match fs::remove_file(id_path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(())
    }

    fn device_id_at(&self, path: &std::path::Path) -> Result<Option<String>, String> {
        if !self.is_enabled() {
            return Ok(None);
        }

        let mut cached = self.device_id.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(id) = cached.as_ref() {
            return Ok(Some(id.clone()));
        }

        let id = get_or_create_device_id_at(path)?;
        *cached = Some(id.clone());
        Ok(Some(id))
    }

    fn reset_device_id(&self, path: &std::path::Path) -> Result<Option<String>, String> {
        *self.device_id.lock().unwrap_or_else(|e| e.into_inner()) = None;
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        self.device_id_at(path)
    }
}

fn runtime() -> &'static AnalyticsRuntime {
    static RUNTIME: OnceLock<AnalyticsRuntime> = OnceLock::new();
    RUNTIME.get_or_init(AnalyticsRuntime::default)
}

fn analytics_id_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("analytics-id"))
}

fn get_or_create_device_id_at(path: &std::path::Path) -> Result<String, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if path.exists() {
        let id = fs::read_to_string(path)
            .map_err(|e| e.to_string())?
            .trim()
            .to_string();
        if !id.is_empty() {
            return Ok(id);
        }
    }

    let id = Uuid::new_v4().to_string();
    fs::write(path, id.as_bytes()).map_err(|e| e.to_string())?;
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

    let device_id = match analytics_id_path()
        .and_then(|path| runtime().device_id_at(&path))
        .ok()
        .flatten()
    {
        Some(id) => id,
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
    if !runtime().is_enabled() {
        return;
    }
    let event = event.to_string();
    tauri::async_runtime::spawn(async move {
        send_event(&event, properties).await;
    });
}

pub fn start_analytics(app: &AppHandle) {
    let _ = app;

    let enabled = POSTHOG_API_KEY.is_some()
        && super::settings::load_settings_from_file()
            .map(|s| s.analytics_enabled)
            .unwrap_or(false);

    if let Ok(path) = analytics_id_path() {
        if let Err(error) = runtime().configure(enabled, &path) {
            eprintln!("[analytics] failed to configure: {error}");
        }
    }

    if !enabled {
        eprintln!(
            "[analytics] disabled (key={}, setting={})",
            POSTHOG_API_KEY.is_some(),
            super::settings::load_settings_from_file()
                .map(|s| s.analytics_enabled)
                .unwrap_or(false),
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
pub fn get_analytics_device_id() -> Result<Option<String>, String> {
    let path = analytics_id_path()?;
    runtime().device_id_at(&path)
}

#[tauri::command]
pub fn configure_analytics(enabled: bool) -> Result<(), String> {
    let effective = enabled && POSTHOG_API_KEY.is_some();
    let path = analytics_id_path()?;
    runtime().configure(effective, &path)
}

#[tauri::command]
pub fn reset_analytics_device_id() -> Result<Option<String>, String> {
    let path = analytics_id_path()?;
    runtime().reset_device_id(&path)
}

#[cfg(test)]
mod tests {
    use super::AnalyticsRuntime;
    use std::fs;

    fn temp_id_path(label: &str) -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("stik-analytics-{label}-{nonce}"))
            .join("analytics-id")
    }

    #[test]
    fn disabled_runtime_never_creates_an_identifier() {
        let runtime = AnalyticsRuntime::default();
        let path = temp_id_path("disabled");

        assert!(!runtime.is_enabled());
        assert_eq!(runtime.device_id_at(&path).unwrap(), None);
        assert!(!path.exists());
    }

    #[test]
    fn consent_is_runtime_effective_and_disable_removes_the_identifier() {
        let runtime = AnalyticsRuntime::default();
        let path = temp_id_path("toggle");

        runtime.configure(true, &path).unwrap();
        assert!(runtime.is_enabled());
        assert!(!path.exists(), "identifier must remain lazy");

        let id = runtime.device_id_at(&path).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), id);

        runtime.configure(false, &path).unwrap();
        assert!(!runtime.is_enabled());
        assert!(!path.exists());
        assert_eq!(runtime.device_id_at(&path).unwrap(), None);
    }
}
