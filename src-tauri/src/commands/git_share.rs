use chrono::Local;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

use super::folders::{get_stik_folder, validate_name};
use super::index::NoteIndex;
use super::settings::{self, GitSharingSettings};

const DEFAULT_DEBOUNCE_SECONDS: u64 = 30;
const DEFAULT_PERIODIC_SYNC_SECONDS: u64 = 300;
const MIN_PERIODIC_SYNC_SECONDS: u64 = 60;
const DEFAULT_GITIGNORE_ENTRIES: [&str; 1] = [".DS_Store"];

#[derive(Debug, Clone, Serialize)]
pub struct GitSyncStatus {
    pub enabled: bool,
    pub linked_folder: Option<String>,
    pub remote_url: Option<String>,
    pub branch: String,
    pub repo_initialized: bool,
    pub pending_changes: bool,
    pub syncing: bool,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct RuntimeStatus {
    pending_changes: bool,
    syncing: bool,
    last_sync_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Debug)]
struct GitCommandOutput {
    status_code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Debug)]
enum WorkerMessage {
    NoteChanged(String),
    ForceSync,
}

#[derive(Clone, Copy)]
enum SyncTrigger {
    Startup,
    DebouncedSave,
    Periodic,
    Manual,
}

impl SyncTrigger {
    fn commit_label(self) -> &'static str {
        match self {
            SyncTrigger::Startup => "startup",
            SyncTrigger::DebouncedSave => "autosave",
            SyncTrigger::Periodic => "periodic",
            SyncTrigger::Manual => "manual",
        }
    }
}

static RUNTIME_STATUS: OnceLock<Mutex<RuntimeStatus>> = OnceLock::new();
static WORKER_SENDER: OnceLock<Sender<WorkerMessage>> = OnceLock::new();
static SYNC_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn runtime_status() -> &'static Mutex<RuntimeStatus> {
    RUNTIME_STATUS.get_or_init(|| Mutex::new(RuntimeStatus::default()))
}

fn sync_mutex() -> &'static Mutex<()> {
    SYNC_MUTEX.get_or_init(|| Mutex::new(()))
}

fn update_runtime_status(update: impl FnOnce(&mut RuntimeStatus)) {
    let mut state = runtime_status().lock().unwrap_or_else(|e| e.into_inner());
    update(&mut state);
}

fn snapshot_runtime_status() -> RuntimeStatus {
    runtime_status()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

pub fn start_background_worker(app: tauri::AppHandle) {
    if WORKER_SENDER.get().is_some() {
        return;
    }

    let (sender, receiver) = mpsc::channel::<WorkerMessage>();
    if WORKER_SENDER.set(sender).is_err() {
        return;
    }

    if let Err(error) = thread::Builder::new()
        .name("stik-git-sync".to_string())
        .spawn(move || background_worker_loop(app, receiver))
    {
        update_runtime_status(|state| {
            state.last_error = Some(format!("Failed to start git sync worker: {}", error));
        });
        return;
    }

    notify_force_sync();
}

pub fn notify_note_changed(folder: &str) {
    if let Some(sender) = WORKER_SENDER.get() {
        let _ = sender.send(WorkerMessage::NoteChanged(folder.to_string()));
    }
}

pub fn notify_force_sync() {
    if let Some(sender) = WORKER_SENDER.get() {
        let _ = sender.send(WorkerMessage::ForceSync);
    }
}

fn background_worker_loop(app: tauri::AppHandle, receiver: Receiver<WorkerMessage>) {
    let mut pending_deadline: Option<Instant> = None;
    let mut next_periodic_sync = Instant::now() + periodic_sync_interval();

    loop {
        match receiver.recv_timeout(Duration::from_secs(1)) {
            Ok(WorkerMessage::NoteChanged(folder)) => {
                if is_folder_linked_for_sync(&folder) {
                    pending_deadline =
                        Some(Instant::now() + Duration::from_secs(DEFAULT_DEBOUNCE_SECONDS));
                    update_runtime_status(|state| state.pending_changes = true);
                }
            }
            Ok(WorkerMessage::ForceSync) => {
                run_sync_from_saved_settings(&app, SyncTrigger::Startup);
                next_periodic_sync = Instant::now() + periodic_sync_interval();
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }

        if let Some(deadline) = pending_deadline {
            if Instant::now() >= deadline {
                run_sync_from_saved_settings(&app, SyncTrigger::DebouncedSave);
                pending_deadline = None;
                update_runtime_status(|state| state.pending_changes = false);
                next_periodic_sync = Instant::now() + periodic_sync_interval();
            }
        }

        if Instant::now() >= next_periodic_sync {
            run_sync_from_saved_settings(&app, SyncTrigger::Periodic);
            next_periodic_sync = Instant::now() + periodic_sync_interval();
        }
    }
}

fn periodic_sync_interval() -> Duration {
    match settings::get_settings() {
        Ok(settings) => Duration::from_secs(
            settings
                .git_sharing
                .sync_interval_seconds
                .max(MIN_PERIODIC_SYNC_SECONDS),
        ),
        Err(_) => Duration::from_secs(DEFAULT_PERIODIC_SYNC_SECONDS),
    }
}

fn is_folder_linked_for_sync(folder: &str) -> bool {
    let settings = match settings::get_settings() {
        Ok(settings) => settings,
        Err(_) => return false,
    };
    let config = settings.git_sharing;
    config.enabled
        && !config.remote_url.trim().is_empty()
        && config.shared_folder.trim().eq(folder.trim())
}

fn run_sync_from_saved_settings(app: &tauri::AppHandle, trigger: SyncTrigger) {
    let settings = match settings::get_settings() {
        Ok(settings) => settings,
        Err(error) => {
            update_runtime_status(|state| {
                state.last_error = Some(format!("Failed to load settings: {}", error))
            });
            return;
        }
    };

    let config = settings.git_sharing;
    if !config.enabled {
        return;
    }

    if let Err(error) = run_sync_operation(&config, trigger) {
        update_runtime_status(|state| state.last_error = Some(error));
        return;
    }

    rebuild_note_index(app);
}

fn rebuild_note_index(app: &tauri::AppHandle) {
    let index = app.state::<NoteIndex>();
    if let Err(error) = index.build() {
        update_runtime_status(|state| {
            state.last_error = Some(format!(
                "Git sync succeeded but index rebuild failed: {}",
                error
            ))
        });
    }
}

fn run_sync_operation(config: &GitSharingSettings, trigger: SyncTrigger) -> Result<(), String> {
    validate_git_config_fields(config)?;

    let _sync_guard = sync_mutex().lock().unwrap_or_else(|e| e.into_inner());
    update_runtime_status(|state| {
        state.syncing = true;
        state.last_error = None;
    });

    let result = (|| {
        let repo_path = linked_folder_path(config)?;
        ensure_repository_ready(&repo_path, config)?;
        commit_local_changes(&repo_path, trigger)?;
        pull_with_conflict_resolution(&repo_path, normalized_branch(&config.branch).as_str())?;
        push_branch(&repo_path, normalized_branch(&config.branch).as_str())?;
        Ok::<(), String>(())
    })();

    update_runtime_status(|state| {
        state.syncing = false;
        match &result {
            Ok(()) => {
                state.last_sync_at = Some(Local::now().to_rfc3339());
                state.last_error = None;
            }
            Err(error) => {
                state.last_error = Some(error.clone());
            }
        }
    });

    result
}

#[tauri::command]
pub fn git_prepare_repository(
    folder: String,
    remote_url: String,
    branch: Option<String>,
) -> Result<GitSyncStatus, String> {
    let config = build_ad_hoc_config(folder, remote_url, branch);
    validate_git_config_fields(&config)?;
    let repo_path = linked_folder_path(&config)?;
    ensure_repository_ready(&repo_path, &config)?;
    Ok(status_for_config(Some(&config)))
}

#[tauri::command]
pub fn git_sync_now(
    app: tauri::AppHandle,
    folder: String,
    remote_url: String,
    branch: Option<String>,
) -> Result<GitSyncStatus, String> {
    let config = build_ad_hoc_config(folder, remote_url, branch);
    run_sync_operation(&config, SyncTrigger::Manual)?;
    rebuild_note_index(&app);
    Ok(status_for_config(Some(&config)))
}

#[tauri::command]
pub fn git_get_sync_status() -> Result<GitSyncStatus, String> {
    let settings = settings::get_settings()?;
    Ok(status_for_config(Some(&settings.git_sharing)))
}

fn build_ad_hoc_config(
    folder: String,
    remote_url: String,
    branch: Option<String>,
) -> GitSharingSettings {
    let defaults = GitSharingSettings::default();
    GitSharingSettings {
        enabled: true,
        shared_folder: folder.trim().to_string(),
        remote_url: remote_url.trim().to_string(),
        branch: branch
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or(defaults.branch),
        sync_interval_seconds: defaults.sync_interval_seconds,
    }
}

fn status_for_config(config: Option<&GitSharingSettings>) -> GitSyncStatus {
    let runtime = snapshot_runtime_status();
    let config = config.cloned().unwrap_or_default();
    let normalized_folder = normalized_optional(&config.shared_folder);
    let normalized_remote = normalized_optional(&config.remote_url);
    let branch = normalized_branch(&config.branch);

    let repo_initialized = normalized_folder
        .as_deref()
        .and_then(|folder| resolve_folder_path(folder).ok())
        .map(|path| path.join(".git").exists())
        .unwrap_or(false);

    GitSyncStatus {
        enabled: config.enabled,
        linked_folder: normalized_folder,
        remote_url: normalized_remote,
        branch,
        repo_initialized,
        pending_changes: runtime.pending_changes,
        syncing: runtime.syncing,
        last_sync_at: runtime.last_sync_at,
        last_error: runtime.last_error,
    }
}

fn validate_git_config_fields(config: &GitSharingSettings) -> Result<(), String> {
    if config.shared_folder.trim().is_empty() {
        return Err("Pick a folder to link before enabling Git sharing".to_string());
    }
    if config.remote_url.trim().is_empty() {
        return Err("Remote URL is required for Git sharing".to_string());
    }
    if config.branch.trim().is_empty() {
        return Err("Branch cannot be empty".to_string());
    }
    validate_name(config.shared_folder.trim())
}

fn linked_folder_path(config: &GitSharingSettings) -> Result<PathBuf, String> {
    resolve_folder_path(config.shared_folder.trim())
}

fn resolve_folder_path(folder: &str) -> Result<PathBuf, String> {
    validate_name(folder)?;
    let stik_folder = get_stik_folder()?;
    let folder_path = stik_folder.join(folder);
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;
    Ok(folder_path)
}

fn ensure_repository_ready(repo_path: &Path, config: &GitSharingSettings) -> Result<(), String> {
    fs::create_dir_all(repo_path).map_err(|e| e.to_string())?;
    let branch = normalized_branch(&config.branch);

    if !repo_path.join(".git").exists() {
        let init_result = run_git(repo_path, &["init", "-b", &branch])?;
        if init_result.status_code != Some(0) {
            run_git_success(repo_path, &["init"], "initialize git repository")?;
            run_git_success(repo_path, &["checkout", "-B", &branch], "create git branch")?;
        }
    }

    ensure_local_identity(repo_path)?;
    ensure_repository_gitignore(repo_path)?;
    configure_origin_remote(repo_path, config.remote_url.trim())?;
    run_git_success(
        repo_path,
        &["checkout", "-B", &branch],
        "switch repository branch",
    )?;
    Ok(())
}

fn ensure_repository_gitignore(repo_path: &Path) -> Result<(), String> {
    let gitignore_path = repo_path.join(".gitignore");
    let existing = fs::read_to_string(&gitignore_path).unwrap_or_default();

    let mut lines: Vec<String> = existing.lines().map(|line| line.to_string()).collect();
    let mut changed = false;

    for entry in DEFAULT_GITIGNORE_ENTRIES {
        if !lines.iter().any(|line| line.trim() == entry) {
            lines.push(entry.to_string());
            changed = true;
        }
    }

    if changed {
        let mut output = lines.join("\n");
        if !output.ends_with('\n') {
            output.push('\n');
        }
        fs::write(gitignore_path, output).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn ensure_local_identity(repo_path: &Path) -> Result<(), String> {
    if git_config_value(repo_path, "user.name")?.is_none() {
        run_git_success(
            repo_path,
            &["config", "user.name", "Stik"],
            "set git user.name",
        )?;
    }
    if git_config_value(repo_path, "user.email")?.is_none() {
        run_git_success(
            repo_path,
            &["config", "user.email", "stik@local.invalid"],
            "set git user.email",
        )?;
    }
    Ok(())
}

fn configure_origin_remote(repo_path: &Path, remote_url: &str) -> Result<(), String> {
    let existing_remote = git_remote_url(repo_path)?;
    match existing_remote {
        Some(url) if url.trim() == remote_url => Ok(()),
        Some(_) => run_git_success(
            repo_path,
            &["remote", "set-url", "origin", remote_url],
            "update origin remote",
        ),
        None => run_git_success(
            repo_path,
            &["remote", "add", "origin", remote_url],
            "add origin remote",
        ),
    }
}

fn commit_local_changes(repo_path: &Path, trigger: SyncTrigger) -> Result<(), String> {
    run_git_success(repo_path, &["add", "-A"], "stage note changes")?;

    let status_output = run_git(repo_path, &["status", "--porcelain"])?;
    if status_output.status_code != Some(0) {
        return Err(format!(
            "Failed to inspect repository status: {}",
            command_error_message(&status_output)
        ));
    }
    if status_output.stdout.trim().is_empty() {
        return Ok(());
    }

    let commit_message = format!(
        "stik: sync {} notes ({})",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        trigger.commit_label()
    );
    let commit_output = run_git(repo_path, &["commit", "-m", &commit_message])?;
    if commit_output.status_code == Some(0) {
        return Ok(());
    }

    let error = command_error_message(&commit_output);
    if error.contains("nothing to commit") {
        return Ok(());
    }
    Err(format!("Failed to commit note changes: {}", error))
}

fn pull_with_conflict_resolution(repo_path: &Path, branch: &str) -> Result<(), String> {
    let pull_output = run_git(repo_path, &["pull", "--no-rebase", "origin", branch])?;
    if pull_output.status_code == Some(0) {
        return Ok(());
    }

    let lower_error = command_error_message(&pull_output).to_lowercase();
    if lower_error.contains("couldn't find remote ref")
        || lower_error.contains("no such ref was fetched")
        || lower_error.contains("not a git repository")
    {
        return Ok(());
    }

    if lower_error.contains("refusing to merge unrelated histories") {
        let retry = run_git(
            repo_path,
            &[
                "pull",
                "--no-rebase",
                "--allow-unrelated-histories",
                "origin",
                branch,
            ],
        )?;
        if retry.status_code == Some(0) {
            return Ok(());
        }
    }

    let conflicted_files = list_conflicted_files(repo_path)?;
    if conflicted_files.is_empty() {
        return Err(format!(
            "Failed to pull from origin/{}: {}",
            branch,
            command_error_message(&pull_output)
        ));
    }

    resolve_conflicts_by_duplication(repo_path, &conflicted_files)?;
    Ok(())
}

fn push_branch(repo_path: &Path, branch: &str) -> Result<(), String> {
    let push_output = run_git(repo_path, &["push", "-u", "origin", branch])?;
    if push_output.status_code == Some(0) {
        return Ok(());
    }

    let lower_error = command_error_message(&push_output).to_lowercase();
    if lower_error.contains("non-fast-forward") || lower_error.contains("fetch first") {
        pull_with_conflict_resolution(repo_path, branch)?;
        run_git_success(
            repo_path,
            &["push", "-u", "origin", branch],
            "push synced notes to remote",
        )?;
        return Ok(());
    }

    Err(format!(
        "Failed to push to origin/{}: {}",
        branch,
        command_error_message(&push_output)
    ))
}

fn resolve_conflicts_by_duplication(
    repo_path: &Path,
    conflicted_files: &[String],
) -> Result<(), String> {
    let timestamp = Local::now().format("%Y%m%d-%H%M%S").to_string();

    for relative_path in conflicted_files {
        let duplicate_content = read_conflict_blob(repo_path, relative_path, 2)?
            .or_else(|| {
                read_conflict_blob(repo_path, relative_path, 3)
                    .ok()
                    .flatten()
            })
            .unwrap_or_default();

        let duplicate_relative = conflict_duplicate_relative_path(relative_path, &timestamp)?;
        let duplicate_absolute = repo_path.join(&duplicate_relative);
        if let Some(parent) = duplicate_absolute.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&duplicate_absolute, duplicate_content.as_bytes()).map_err(|e| e.to_string())?;

        let duplicate_argument = path_to_git_argument(&duplicate_relative);
        run_git_success(
            repo_path,
            &["add", "--", &duplicate_argument],
            "stage duplicate conflict file",
        )?;
        run_git_success(
            repo_path,
            &["checkout", "--theirs", "--", relative_path],
            "checkout remote conflict version",
        )?;
        run_git_success(
            repo_path,
            &["add", "--", relative_path],
            "stage resolved conflict file",
        )?;
    }

    let merge_commit_output = run_git(
        repo_path,
        &[
            "commit",
            "-m",
            "stik: resolve conflicts by keeping both versions",
        ],
    )?;
    if merge_commit_output.status_code == Some(0) {
        return Ok(());
    }

    let error = command_error_message(&merge_commit_output);
    if error.contains("nothing to commit") {
        return Ok(());
    }
    Err(format!("Failed to finalize conflict resolution: {}", error))
}

fn list_conflicted_files(repo_path: &Path) -> Result<Vec<String>, String> {
    let diff_output = run_git(repo_path, &["diff", "--name-only", "--diff-filter=U"])?;
    if diff_output.status_code != Some(0) {
        return Err(format!(
            "Failed to list conflicted files: {}",
            command_error_message(&diff_output)
        ));
    }

    Ok(diff_output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect())
}

fn read_conflict_blob(
    repo_path: &Path,
    relative_path: &str,
    stage: u8,
) -> Result<Option<String>, String> {
    let blob_output = run_git(
        repo_path,
        &["show", &format!(":{}:{}", stage, relative_path)],
    )?;
    if blob_output.status_code == Some(0) {
        return Ok(Some(blob_output.stdout));
    }
    Ok(None)
}

fn conflict_duplicate_relative_path(
    relative_path: &str,
    timestamp: &str,
) -> Result<PathBuf, String> {
    let path = Path::new(relative_path);
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Invalid conflicted file path: {}", relative_path))?;

    let (stem, extension) = split_file_name(file_name);
    let duplicate_name = if extension.is_empty() {
        format!("{}-conflict-{}", stem, timestamp)
    } else {
        format!("{}-conflict-{}.{}", stem, timestamp, extension)
    };

    let mut duplicate_path = path.to_path_buf();
    duplicate_path.set_file_name(duplicate_name);
    Ok(duplicate_path)
}

fn split_file_name(file_name: &str) -> (&str, &str) {
    match file_name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, extension),
        _ => (file_name, ""),
    }
}

fn path_to_git_argument(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn git_config_value(repo_path: &Path, key: &str) -> Result<Option<String>, String> {
    let output = run_git(repo_path, &["config", "--get", key])?;
    if output.status_code == Some(0) {
        return Ok(normalized_optional(&output.stdout));
    }
    Ok(None)
}

fn git_remote_url(repo_path: &Path) -> Result<Option<String>, String> {
    let output = run_git(repo_path, &["remote", "get-url", "origin"])?;
    if output.status_code == Some(0) {
        return Ok(normalized_optional(&output.stdout));
    }
    Ok(None)
}

fn run_git_success(repo_path: &Path, args: &[&str], context: &str) -> Result<(), String> {
    let output = run_git(repo_path, args)?;
    if output.status_code == Some(0) {
        return Ok(());
    }
    Err(format!(
        "Failed to {}: {}",
        context,
        command_error_message(&output)
    ))
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("Git command failed to launch: {}", e))?;

    Ok(GitCommandOutput {
        status_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn command_error_message(output: &GitCommandOutput) -> String {
    let stderr = output.stderr.trim();
    if !stderr.is_empty() {
        return stderr.to_string();
    }
    let stdout = output.stdout.trim();
    if !stdout.is_empty() {
        return stdout.to_string();
    }
    "unknown git error".to_string()
}

fn normalized_optional(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalized_branch(branch: &str) -> String {
    let trimmed = branch.trim();
    if trimmed.is_empty() {
        "main".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_conflict_suffix_before_extension() {
        let result = conflict_duplicate_relative_path("Inbox/idea.md", "20260206-220000").unwrap();
        assert_eq!(
            path_to_git_argument(&result),
            "Inbox/idea-conflict-20260206-220000.md"
        );
    }

    #[test]
    fn appends_conflict_suffix_without_extension() {
        let result = conflict_duplicate_relative_path("Inbox/idea", "20260206-220000").unwrap();
        assert_eq!(
            path_to_git_argument(&result),
            "Inbox/idea-conflict-20260206-220000"
        );
    }

    #[test]
    fn trims_manual_config_inputs() {
        let config = build_ad_hoc_config(
            " Inbox ".to_string(),
            " https://example.com/team.git ".to_string(),
            Some(" main ".to_string()),
        );
        assert_eq!(config.shared_folder, "Inbox");
        assert_eq!(config.remote_url, "https://example.com/team.git");
        assert_eq!(config.branch, "main");
        assert!(config.enabled);
    }
}
