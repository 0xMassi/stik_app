use chrono::{Datelike, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use super::folders::get_stik_folder;
use super::versioning;

const PREVIEW_MAX_LEN: usize = 120;

#[derive(Debug, Clone)]
struct OnThisDayCandidate {
    date: NaiveDate,
    folder: String,
    preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct OnThisDayState {
    last_notified_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnThisDayStatus {
    pub found: bool,
    pub message: String,
    pub date: Option<String>,
    pub folder: Option<String>,
    pub preview: Option<String>,
}

pub fn maybe_show_on_this_day_notification() -> Result<(), String> {
    let _ = check_on_this_day(false, true)?;
    Ok(())
}

#[tauri::command]
pub fn check_on_this_day_now() -> Result<OnThisDayStatus, String> {
    check_on_this_day(true, true)
}

fn check_on_this_day(force: bool, show_notification: bool) -> Result<OnThisDayStatus, String> {
    let today = Local::now().date_naive();
    let state = load_state()?;

    if !force && !should_notify_today(state.last_notified_date.as_deref(), today) {
        return Ok(OnThisDayStatus {
            found: false,
            message: "On This Day already shown today".to_string(),
            date: None,
            folder: None,
            preview: None,
        });
    }

    let candidates = collect_candidates(today)?;
    let Some(candidate) = select_best_candidate(&candidates) else {
        return Ok(OnThisDayStatus {
            found: false,
            message: "No On This Day note found".to_string(),
            date: None,
            folder: None,
            preview: None,
        });
    };

    if show_notification {
        let title = "On This Day";
        let subtitle = &format!("{} ({})", candidate.folder, candidate.date.format("%b %d, %Y"));
        show_macos_notification(title, subtitle, &candidate.preview)?;

        let new_state = OnThisDayState {
            last_notified_date: Some(today.format("%Y-%m-%d").to_string()),
        };
        save_state(&new_state)?;
    }

    Ok(OnThisDayStatus {
        found: true,
        message: "On This Day note found".to_string(),
        date: Some(candidate.date.format("%Y-%m-%d").to_string()),
        folder: Some(candidate.folder),
        preview: Some(candidate.preview),
    })
}

fn collect_candidates(today: NaiveDate) -> Result<Vec<OnThisDayCandidate>, String> {
    let stik_folder = get_stik_folder()?;
    let mut candidates = Vec::new();

    let folders: Vec<PathBuf> = fs::read_dir(&stik_folder)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.path())
        .collect();

    for folder_path in folders {
        let folder_name = folder_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Inbox")
            .to_string();

        if let Ok(entries) = fs::read_dir(&folder_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.extension().is_some_and(|ext| ext == "md") {
                    continue;
                }

                let filename = match path.file_name().and_then(|name| name.to_str()) {
                    Some(name) => name,
                    None => continue,
                };

                let Some(date) = parse_date_from_filename(filename) else {
                    continue;
                };

                if date.month() == today.month() && date.day() == today.day() && date.year() < today.year() {
                    let content = fs::read_to_string(&path).unwrap_or_default();
                    candidates.push(OnThisDayCandidate {
                        date,
                        folder: folder_name.clone(),
                        preview: build_preview(&content),
                    });
                }
            }
        }
    }

    Ok(candidates)
}

fn select_best_candidate(candidates: &[OnThisDayCandidate]) -> Option<OnThisDayCandidate> {
    candidates.iter().cloned().max_by_key(|candidate| candidate.date)
}

fn parse_date_from_filename(filename: &str) -> Option<NaiveDate> {
    let date_segment = filename.split('-').next()?;
    if date_segment.len() != 8 {
        return None;
    }
    NaiveDate::parse_from_str(date_segment, "%Y%m%d").ok()
}

fn build_preview(content: &str) -> String {
    let condensed = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if condensed.is_empty() {
        return "(empty note)".to_string();
    }

    if condensed.len() > PREVIEW_MAX_LEN {
        format!("{}...", &condensed[..PREVIEW_MAX_LEN])
    } else {
        condensed
    }
}

fn should_notify_today(last_notified_date: Option<&str>, today: NaiveDate) -> bool {
    match last_notified_date {
        Some(last) => last != today.format("%Y-%m-%d").to_string(),
        None => true,
    }
}

fn get_state_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("on_this_day.json"))
}

fn load_state() -> Result<OnThisDayState, String> {
    let path = get_state_path()?;
    match versioning::load_versioned::<OnThisDayState>(&path)? {
        Some(state) => Ok(state),
        None => Ok(OnThisDayState::default()),
    }
}

fn save_state(state: &OnThisDayState) -> Result<(), String> {
    let path = get_state_path()?;
    versioning::save_versioned(&path, state)
}

#[cfg(target_os = "macos")]
fn show_macos_notification(title: &str, subtitle: &str, body: &str) -> Result<(), String> {
    let escaped_title = escape_applescript(title);
    let escaped_subtitle = escape_applescript(subtitle);
    let escaped_body = escape_applescript(body);
    let script = format!(
        "display notification \"{}\" with title \"{}\" subtitle \"{}\"",
        escaped_body, escaped_title, escaped_subtitle
    );

    let status = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("Failed to show macOS notification".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn show_macos_notification(_title: &str, _subtitle: &str, _body: &str) -> Result<(), String> {
    Ok(())
}

fn escape_applescript(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(date: &str, folder: &str, preview: &str) -> OnThisDayCandidate {
        OnThisDayCandidate {
            date: NaiveDate::parse_from_str(date, "%Y-%m-%d").expect("valid date"),
            folder: folder.to_string(),
            preview: preview.to_string(),
        }
    }

    #[test]
    fn parses_date_from_filename_prefix() {
        let date = parse_date_from_filename("20240206-101530-my-note.md");
        assert_eq!(date, NaiveDate::from_ymd_opt(2024, 2, 6));
    }

    #[test]
    fn selects_latest_matching_year() {
        let candidates = vec![
            candidate("2021-02-06", "Inbox", "old"),
            candidate("2025-02-06", "Work", "new"),
            candidate("2023-02-06", "Ideas", "mid"),
        ];

        let selected = select_best_candidate(&candidates).expect("candidate exists");
        assert_eq!(selected.date, NaiveDate::from_ymd_opt(2025, 2, 6).expect("valid"));
        assert_eq!(selected.folder, "Work");
    }

    #[test]
    fn skips_notification_if_already_shown_today() {
        let today = NaiveDate::from_ymd_opt(2026, 2, 6).expect("valid date");
        assert!(!should_notify_today(Some("2026-02-06"), today));
        assert!(should_notify_today(Some("2026-02-05"), today));
        assert!(should_notify_today(None, today));
    }

    #[test]
    fn builds_single_line_preview() {
        let preview = build_preview("\nFirst line\n\nSecond line\n");
        assert_eq!(preview, "First line Second line");
    }
}
