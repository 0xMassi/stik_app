import { useState, useEffect, useRef } from "react";
import ShortcutRecorder from "./ShortcutRecorder";
import type { GitSyncStatus, ShortcutMapping, StikSettings } from "@/types";

// Reserved shortcuts that Stik uses internally
export const RESERVED_SHORTCUTS = [
  "Cmd+Shift+P", // Search
  "Cmd+Shift+M", // Manager
  "Cmd+Shift+Comma", // Settings
];

function remoteToWebUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\.git$/i, "");
  }

  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const repoPath = sshMatch[2].replace(/\.git$/i, "");
    return `https://${host}/${repoPath}`;
  }

  return null;
}

interface DropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function Dropdown({ value, options, onChange, placeholder }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allOptions = options.some((o) => o.value === value)
    ? options
    : [{ value, label: value }, ...options];

  const selectedOption = allOptions.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink text-left flex items-center justify-between hover:border-coral/50 transition-colors"
      >
        <span className={selectedOption ? "text-ink" : "text-stone"}>
          {selectedOption?.label || placeholder || "Select..."}
        </span>
        <span className={`text-[8px] text-stone transition-transform ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg border border-line rounded-lg shadow-stik overflow-hidden max-h-[220px] overflow-y-auto">
          {allOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2.5 text-[13px] text-left transition-colors ${
                option.value === value
                  ? "bg-coral text-white"
                  : "text-ink hover:bg-line/50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type SettingsTab = "shortcuts" | "folders" | "editor" | "git" | "ai" | "insights";

interface SettingsContentProps {
  activeTab: SettingsTab;
  settings: StikSettings;
  folders: string[];
  onSettingsChange: (settings: StikSettings) => void;
  captureStreakLabel: string;
  captureStreakDays: number | null;
  isRefreshingStreak: boolean;
  onRefreshCaptureStreak: () => Promise<void>;
  onThisDayMessage: string;
  onThisDayPreview: string | null;
  onThisDayDate: string | null;
  onThisDayFolder: string | null;
  isCheckingOnThisDay: boolean;
  onCheckOnThisDay: () => Promise<void>;
  gitSyncStatus: GitSyncStatus | null;
  isPreparingGitRepo: boolean;
  isSyncingGitNow: boolean;
  isOpeningGitRemote: boolean;
  onPrepareGitRepository: () => Promise<void>;
  onSyncGitNow: () => Promise<void>;
  onOpenGitRemote: () => Promise<void>;
}

export default function SettingsContent({
  activeTab,
  settings,
  folders,
  onSettingsChange,
  captureStreakLabel,
  captureStreakDays,
  isRefreshingStreak,
  onRefreshCaptureStreak,
  onThisDayMessage,
  onThisDayPreview,
  onThisDayDate,
  onThisDayFolder,
  isCheckingOnThisDay,
  onCheckOnThisDay,
  gitSyncStatus,
  isPreparingGitRepo,
  isSyncingGitNow,
  isOpeningGitRemote,
  onPrepareGitRepository,
  onSyncGitNow,
  onOpenGitRemote,
}: SettingsContentProps) {
  const remoteWebUrl = remoteToWebUrl(settings.git_sharing.remote_url);
  const linkedRepoPath =
    settings.git_sharing.repository_layout === "stik_root"
      ? "~/Documents/Stik"
      : `~/Documents/Stik/${settings.git_sharing.shared_folder || "Inbox"}`;

  const updateMapping = (index: number, updates: Partial<ShortcutMapping>) => {
    const newMappings = [...settings.shortcut_mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const removeMapping = (index: number) => {
    const newMappings = settings.shortcut_mappings.filter((_, i) => i !== index);
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const addMapping = () => {
    const usedShortcuts = settings.shortcut_mappings.map((m) => m.shortcut);
    let defaultShortcut = "Cmd+Shift+S";

    const letters = "ABCDEFGHIJKLNOQRTUVWXYZ".split("");
    for (const letter of letters) {
      const shortcut = `Cmd+Shift+${letter}`;
      if (!usedShortcuts.includes(shortcut) && !RESERVED_SHORTCUTS.includes(shortcut)) {
        defaultShortcut = shortcut;
        break;
      }
    }

    onSettingsChange({
      ...settings,
      shortcut_mappings: [
        ...settings.shortcut_mappings,
        { shortcut: defaultShortcut, folder: folders[0] || "Inbox", enabled: true },
      ],
    });
  };

  const getExistingShortcuts = (excludeIndex?: number) => {
    return settings.shortcut_mappings
      .filter((_, i) => i !== excludeIndex)
      .map((m) => m.shortcut);
  };

  const updateGitSharing = (updates: Partial<StikSettings["git_sharing"]>) => {
    onSettingsChange({
      ...settings,
      git_sharing: {
        ...settings.git_sharing,
        ...updates,
      },
    });
  };

  return (
    <div>
        {activeTab === "shortcuts" && (
          <div>
            <p className="mb-4 text-[12px] text-stone">
              Configure global shortcuts that instantly open capture in a chosen folder.
            </p>

            <div className="space-y-3">
              {settings.shortcut_mappings.map((mapping, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-line/30 rounded-xl border border-line/50"
                >
                  <div className="w-28">
                    <ShortcutRecorder
                      value={mapping.shortcut}
                      onChange={(value) => updateMapping(index, { shortcut: value })}
                      reservedShortcuts={RESERVED_SHORTCUTS}
                      existingShortcuts={getExistingShortcuts(index)}
                    />
                  </div>
                  <span className="text-coral text-sm">→</span>
                  <div className="flex-1">
                    <Dropdown
                      value={mapping.folder}
                      options={folders.map((f) => ({ value: f, label: f }))}
                      onChange={(value) => updateMapping(index, { folder: value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMapping(index)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-coral-light text-stone hover:text-coral transition-colors"
                    title="Remove shortcut"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addMapping}
              className="mt-4 w-full px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
            >
              <span className="text-lg">+</span>
              <span>Add shortcut</span>
            </button>
          </div>
        )}

        {activeTab === "folders" && (
          <div>
            <p className="mb-4 text-[12px] text-stone">
              Choose which folder opens by default from tray and quick-capture flows.
            </p>

            <div className="max-w-[360px]">
              <Dropdown
                value={settings.default_folder}
                options={folders.map((f) => ({ value: f, label: f }))}
                onChange={(value) =>
                  onSettingsChange({ ...settings, default_folder: value })
                }
              />
            </div>

            <p className="mt-3 text-[12px] text-stone leading-relaxed">
              Opens when using tray menu or if no folder is specified.
            </p>

            <div className="mt-4 p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
              <p className="text-[12px] text-stone leading-relaxed">
                Sync tip: notes are saved in ~/Documents/Stik/. If your Documents folder is
                synced (iCloud Drive, Dropbox, Syncthing), Stik syncs across Macs automatically.
              </p>
            </div>
          </div>
        )}

        {activeTab === "editor" && (
          <div className="space-y-4">
            <div className="p-4 bg-line/30 rounded-xl border border-line/50">
              <p className="text-[13px] text-ink font-medium mb-1">Theme</p>
              <p className="text-[12px] text-stone leading-relaxed mb-3">
                Choose light, dark, or follow your macOS appearance.
              </p>
              <div className="inline-flex rounded-lg border border-line overflow-hidden">
                {(["system", "light", "dark"] as const).map((opt) => {
                  const labels = { system: "System", light: "Light", dark: "Dark" } as const;
                  const current = settings.theme_mode || "system";
                  const isActive =
                    opt === "system" ? !current || current === "system" : current === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        onSettingsChange({ ...settings, theme_mode: opt === "system" ? "" : opt })
                      }
                      className={`px-4 py-1.5 text-[12px] font-medium transition-colors ${
                        isActive
                          ? "bg-coral text-white"
                          : "text-stone hover:text-ink hover:bg-line/50"
                      }`}
                    >
                      {labels[opt]}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
              <div>
                <p className="text-[13px] text-ink font-medium">Vim mode</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Use Vim-style keybindings in the editor. Press <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">i</kbd> to
                  type, <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">Esc</kbd> to
                  return to Normal mode.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    vim_mode_enabled: !settings.vim_mode_enabled,
                  })
                }
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  settings.vim_mode_enabled ? "bg-coral" : "bg-line"
                }`}
                title="Toggle Vim mode"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.vim_mode_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
              <p className="text-[13px] text-ink font-medium">Quick reference</p>
              <div className="text-[12px] text-stone leading-relaxed space-y-1">
                <p><span className="text-ink font-medium">Movement</span> — h j k l, w b (word), 0 $ (line), gg G (document)</p>
                <p><span className="text-ink font-medium">Insert</span> — i (before), a (after), A (end of line), o O (new line)</p>
                <p><span className="text-ink font-medium">Edit</span> — x dd cc cw C, yy p, diw ciw, ci/di + &quot; &apos; ( {'{'}</p>
                <p><span className="text-ink font-medium">Visual</span> — v (chars), V (lines), d x (delete), y (yank), c (change)</p>
                <p><span className="text-ink font-medium">Undo</span> — u, Ctrl+r (redo), . (repeat)</p>
                <p><span className="text-ink font-medium">Commands</span> — :wq (save &amp; close), :q! (discard &amp; close)</p>
              </div>
            </div>

            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl space-y-1">
              <p className="text-[12px] font-semibold text-ink">How to close</p>
              <p className="text-[12px] text-stone leading-relaxed">
                Press <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">:</kbd> in
                Normal mode to open the command bar, then type <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">wq</kbd> + Enter
                to save and close. Escape always switches between Insert and Normal mode.
              </p>
            </div>
          </div>
        )}

        {activeTab === "git" && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink font-medium">Enable Git sharing</span>
              <button
                type="button"
                onClick={() => updateGitSharing({ enabled: !settings.git_sharing.enabled })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings.git_sharing.enabled ? "bg-coral" : "bg-line"
                }`}
                title="Toggle Git sharing"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.git_sharing.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div>
              <p className="text-[12px] text-stone mb-1.5">Repository layout</p>
              <Dropdown
                value={settings.git_sharing.repository_layout}
                options={[
                  { value: "folder_root", label: "Selected folder is repo root" },
                  { value: "stik_root", label: "Whole Stik folder is repo root" },
                ]}
                onChange={(value) =>
                  updateGitSharing({
                    repository_layout: value as "folder_root" | "stik_root",
                  })
                }
              />
            </div>

            {settings.git_sharing.repository_layout === "folder_root" ? (
              <div>
                <p className="text-[12px] text-stone mb-1.5">Shared folder</p>
                <Dropdown
                  value={settings.git_sharing.shared_folder}
                  options={folders.map((f) => ({ value: f, label: f }))}
                  onChange={(value) => updateGitSharing({ shared_folder: value })}
                />
              </div>
            ) : (
              <p className="text-[12px] text-stone leading-relaxed">
                Notes are synced from your full Stik root, so GitHub will show folders like
                <span className="mx-1 text-ink">Inbox/</span>
                <span className="text-ink">Work/</span>
                <span className="mx-1 text-ink">Ideas/</span>.
              </p>
            )}

            <div>
              <p className="text-[12px] text-stone mb-1.5">Remote URL</p>
              <input
                type="text"
                value={settings.git_sharing.remote_url}
                onChange={(e) => updateGitSharing({ remote_url: e.target.value })}
                placeholder="https://github.com/your-org/stik-notes.git"
                className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
              />
            </div>

            <div className="grid grid-cols-[1fr_130px] gap-3">
              <div>
                <p className="text-[12px] text-stone mb-1.5">Branch</p>
                <input
                  type="text"
                  value={settings.git_sharing.branch}
                  onChange={(e) => updateGitSharing({ branch: e.target.value })}
                  placeholder="main"
                  className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
                />
              </div>
              <div>
                <p className="text-[12px] text-stone mb-1.5">Pull interval</p>
                <input
                  type="number"
                  min={60}
                  step={30}
                  value={settings.git_sharing.sync_interval_seconds}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value || "300", 10);
                    updateGitSharing({
                      sync_interval_seconds: Number.isFinite(parsed) ? Math.max(parsed, 60) : 300,
                    });
                  }}
                  className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-coral/50"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onPrepareGitRepository}
                disabled={isPreparingGitRepo || isSyncingGitNow}
                className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
              >
                {isPreparingGitRepo ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="animate-spin">↻</span>
                    <span>Linking...</span>
                  </span>
                ) : (
                  "Link repository"
                )}
              </button>
              <button
                type="button"
                onClick={onSyncGitNow}
                disabled={isSyncingGitNow}
                className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
              >
                {isSyncingGitNow ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="animate-spin">↻</span>
                    <span>Syncing...</span>
                  </span>
                ) : (
                  "Sync now"
                )}
              </button>
              {remoteWebUrl && (
                <button
                  type="button"
                  onClick={onOpenGitRemote}
                  disabled={isOpeningGitRemote}
                  className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors"
                >
                  {isOpeningGitRemote ? "Opening..." : "Open remote"}
                </button>
              )}
            </div>

            <div className="text-[12px] text-stone leading-relaxed space-y-0.5">
              <p>
                Status:{" "}
                <span className="text-ink font-medium">
                  {gitSyncStatus?.repo_initialized ? "Repository linked" : "Not linked yet"}
                </span>
              </p>
              {gitSyncStatus?.last_sync_at && (
                <p>Last sync: {new Date(gitSyncStatus.last_sync_at).toLocaleString()}</p>
              )}
              {gitSyncStatus?.last_error && (
                <p className="text-coral">Last error: {gitSyncStatus.last_error}</p>
              )}
              <p>Auto-sync commits and pushes changes ~30s after note edits in the shared folder.</p>
            </div>

            <div className="p-3 bg-coral-light/35 border border-coral/20 rounded-xl space-y-1">
              <p className="text-[12px] font-semibold text-ink">GitHub account setup</p>
              <p className="text-[12px] text-stone leading-relaxed">
                Stik uses your existing Git credentials on this Mac (SSH key or HTTPS credential
                helper). Stik does not ask for or store GitHub tokens.
              </p>
              <p className="text-[12px] text-stone leading-relaxed">
                If auth fails once, run this in Terminal to complete login:
              </p>
              <code className="block px-2.5 py-2 text-[11px] rounded-lg bg-bg border border-line text-ink break-all">
                git -C "{linkedRepoPath}" push
              </code>
            </div>
          </div>
        )}

        {activeTab === "ai" && (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
              <div>
                <p className="text-[13px] text-ink font-medium">Enable AI features</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Powers semantic search in the search bar and folder suggestions while
                  capturing notes.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    ai_features_enabled: !settings.ai_features_enabled,
                  })
                }
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  settings.ai_features_enabled ? "bg-coral" : "bg-line"
                }`}
                title="Toggle AI features"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.ai_features_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
              <p className="text-[13px] text-ink font-medium">How it works</p>
              <ul className="text-[12px] text-stone leading-relaxed space-y-1.5">
                <li>
                  <span className="text-ink font-medium">Semantic search</span> — find notes by
                  meaning, not just keywords. Search "what to buy" to find your grocery list.
                </li>
                <li>
                  <span className="text-ink font-medium">Folder suggestions</span> — while
                  capturing, Stik suggests the best folder based on what you're writing.
                </li>
                <li>
                  <span className="text-ink font-medium">Note embeddings</span> — each note gets a
                  numeric fingerprint used for similarity matching. Built in the background.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl space-y-1">
              <p className="text-[12px] font-semibold text-ink">Privacy</p>
              <p className="text-[12px] text-stone leading-relaxed">
                All processing happens on-device via Apple NaturalLanguage. No data leaves your
                Mac. English works best; other languages have limited semantic understanding.
              </p>
            </div>

            {!settings.ai_features_enabled && (
              <p className="text-[12px] text-stone text-center">
                Restart Stik after enabling to start the AI engine.
              </p>
            )}
          </div>
        )}

        {activeTab === "insights" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-coral">↻</span>
                <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                  Capture Streak
                </h3>
              </div>
              <div className="p-4 bg-line/30 rounded-xl border border-line/50 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-ink">{captureStreakLabel}</p>
                  <p className="mt-1 text-[12px] text-stone leading-relaxed">
                    Consecutive days with at least one captured note.
                    {captureStreakDays === null
                      ? " Open settings again if this stays unavailable."
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRefreshCaptureStreak}
                  disabled={isRefreshingStreak}
                  className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
                >
                  {isRefreshingStreak ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-coral">☼</span>
                <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                  On This Day
                </h3>
              </div>
              <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
                <p className="text-[14px] font-semibold text-ink">{onThisDayMessage}</p>
                {(onThisDayDate || onThisDayFolder) && (
                  <p className="text-[12px] text-stone">
                    {onThisDayFolder || "Folder unknown"} • {onThisDayDate || "Date unknown"}
                  </p>
                )}
                {onThisDayPreview && (
                  <p className="text-[12px] text-stone leading-relaxed">{onThisDayPreview}</p>
                )}
                <button
                  type="button"
                  onClick={onCheckOnThisDay}
                  disabled={isCheckingOnThisDay}
                  className="mt-2 px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
                >
                  {isCheckingOnThisDay ? "Checking..." : "Check now"}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}
