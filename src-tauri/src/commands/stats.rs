use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use super::folders::get_stik_folder;
use super::versioning;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureStats {
    pub capture_streak_days: u32,
    pub last_computed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureStreakStatus {
    pub days: u32,
    pub label: String,
}

pub fn calculate_and_persist_capture_streak() -> Result<u32, String> {
    let note_dates = collect_note_dates()?;
    let today = Local::now().date_naive();
    let streak = compute_capture_streak_from_dates(&note_dates, today);

    let stats = CaptureStats {
        capture_streak_days: streak,
        last_computed_at: Local::now().to_rfc3339(),
    };
    save_stats_to_file(&stats)?;

    Ok(streak)
}

pub fn format_capture_streak_label(days: u32) -> String {
    if days == 1 {
        "Streak: 1 day".to_string()
    } else {
        format!("Streak: {} days", days)
    }
}

#[tauri::command]
pub fn get_capture_streak() -> Result<CaptureStreakStatus, String> {
    let days = calculate_and_persist_capture_streak()?;
    Ok(CaptureStreakStatus {
        days,
        label: format_capture_streak_label(days),
    })
}

fn collect_note_dates() -> Result<Vec<NaiveDate>, String> {
    let stik_folder = get_stik_folder()?;
    let mut dates = Vec::new();

    let folders: Vec<PathBuf> = fs::read_dir(&stik_folder)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.path())
        .collect();

    for folder in folders {
        if let Ok(entries) = fs::read_dir(folder) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.extension().is_some_and(|ext| ext == "md") {
                    continue;
                }

                if let Some(filename) = path.file_name().and_then(|name| name.to_str()) {
                    if let Some(date) = parse_date_from_filename(filename) {
                        dates.push(date);
                    }
                }
            }
        }
    }

    Ok(dates)
}

fn get_stats_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let stik_config = home.join(".stik");
    fs::create_dir_all(&stik_config).map_err(|e| e.to_string())?;
    Ok(stik_config.join("stats.json"))
}

fn save_stats_to_file(stats: &CaptureStats) -> Result<(), String> {
    let path = get_stats_path()?;
    versioning::save_versioned(&path, stats)
}

fn parse_date_from_filename(filename: &str) -> Option<NaiveDate> {
    let date_segment = filename.split('-').next()?;
    if date_segment.len() != 8 {
        return None;
    }

    NaiveDate::parse_from_str(date_segment, "%Y%m%d").ok()
}

fn compute_capture_streak_from_dates(dates: &[NaiveDate], today: NaiveDate) -> u32 {
    let unique_dates: HashSet<NaiveDate> = dates.iter().copied().collect();

    if unique_dates.is_empty() {
        return 0;
    }

    let mut cursor = if unique_dates.contains(&today) {
        today
    } else {
        let yesterday = today - Duration::days(1);
        if unique_dates.contains(&yesterday) {
            yesterday
        } else {
            return 0;
        }
    };

    let mut streak = 0u32;
    while unique_dates.contains(&cursor) {
        streak += 1;
        cursor -= Duration::days(1);
    }

    streak
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_date_from_filename_prefix() {
        let date = parse_date_from_filename("20260206-101530-my-note.md");
        assert_eq!(date, NaiveDate::from_ymd_opt(2026, 2, 6));
    }

    #[test]
    fn returns_zero_when_no_recent_activity() {
        let today = NaiveDate::from_ymd_opt(2026, 2, 6).expect("valid date");
        let dates = vec![
            today - Duration::days(2),
            today - Duration::days(3),
            today - Duration::days(4),
        ];

        let streak = compute_capture_streak_from_dates(&dates, today);
        assert_eq!(streak, 0);
    }

    #[test]
    fn counts_streak_when_today_has_capture() {
        let today = NaiveDate::from_ymd_opt(2026, 2, 6).expect("valid date");
        let dates = vec![
            today,
            today - Duration::days(1),
            today - Duration::days(2),
            today - Duration::days(5),
        ];

        let streak = compute_capture_streak_from_dates(&dates, today);
        assert_eq!(streak, 3);
    }

    #[test]
    fn counts_streak_from_yesterday_when_today_missing() {
        let today = NaiveDate::from_ymd_opt(2026, 2, 6).expect("valid date");
        let dates = vec![
            today - Duration::days(1),
            today - Duration::days(2),
            today - Duration::days(3),
            today - Duration::days(7),
        ];

        let streak = compute_capture_streak_from_dates(&dates, today);
        assert_eq!(streak, 3);
    }

    #[test]
    fn ignores_duplicate_captures_on_same_day() {
        let today = NaiveDate::from_ymd_opt(2026, 2, 6).expect("valid date");
        let dates = vec![
            today,
            today,
            today - Duration::days(1),
            today - Duration::days(1),
        ];

        let streak = compute_capture_streak_from_dates(&dates, today);
        assert_eq!(streak, 2);
    }

    #[test]
    fn formats_streak_label_for_singular_day() {
        assert_eq!(format_capture_streak_label(1), "Streak: 1 day");
    }

    #[test]
    fn formats_streak_label_for_plural_days() {
        assert_eq!(format_capture_streak_label(5), "Streak: 5 days");
    }
}
