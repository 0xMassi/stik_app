import { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import SettingsContent from "./SettingsContent";
import type { SettingsTab } from "./SettingsContent";
import type { CaptureStreakStatus, GitSyncStatus, OnThisDayStatus, StikSettings } from "@/types";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M9 16h6" />
      </svg>
    ),
  },
  {
    id: "folders",
    label: "Folders",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "git",
    label: "Git Sharing",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  {
    id: "insights",
    label: "Insights",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isWindow?: boolean;
}

export default function SettingsModal({ isOpen, onClose, isWindow = false }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("shortcuts");
  const [settings, setSettings] = useState<StikSettings | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [captureStreak, setCaptureStreak] = useState<CaptureStreakStatus | null>(null);
  const [isRefreshingStreak, setIsRefreshingStreak] = useState(false);
  const [onThisDayStatus, setOnThisDayStatus] = useState<OnThisDayStatus | null>(null);
  const [isCheckingOnThisDay, setIsCheckingOnThisDay] = useState(false);
  const [gitSyncStatus, setGitSyncStatus] = useState<GitSyncStatus | null>(null);
  const [isPreparingGitRepo, setIsPreparingGitRepo] = useState(false);
  const [isSyncingGitNow, setIsSyncingGitNow] = useState(false);
  const [isOpeningGitRemote, setIsOpeningGitRemote] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  const waitForPaint = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

  const loadCaptureStreak = async () => {
    setIsRefreshingStreak(true);
    try {
      const streak = await invoke<CaptureStreakStatus>("get_capture_streak");
      setCaptureStreak(streak);
    } catch (error) {
      console.error("Failed to load capture streak:", error);
      setCaptureStreak(null);
    } finally {
      setIsRefreshingStreak(false);
    }
  };

  const checkOnThisDay = async () => {
    setIsCheckingOnThisDay(true);
    try {
      const status = await invoke<OnThisDayStatus>("check_on_this_day_now");
      setOnThisDayStatus(status);
    } catch (error) {
      console.error("Failed to check On This Day:", error);
      setOnThisDayStatus({
        found: false,
        message: "Unable to check On This Day",
        date: null,
        folder: null,
        preview: null,
      });
    } finally {
      setIsCheckingOnThisDay(false);
    }
  };

  const loadGitSyncStatus = async () => {
    try {
      const status = await invoke<GitSyncStatus>("git_get_sync_status");
      setGitSyncStatus(status);
    } catch (error) {
      console.error("Failed to load git sync status:", error);
      setGitSyncStatus(null);
    }
  };

  const prepareGitRepository = async () => {
    if (!settings) return;

    flushSync(() => setIsPreparingGitRepo(true));
    await waitForPaint();
    try {
      const status = await invoke<GitSyncStatus>("git_prepare_repository", {
        folder: settings.git_sharing.shared_folder,
        remoteUrl: settings.git_sharing.remote_url,
        branch: settings.git_sharing.branch,
        repositoryLayout: settings.git_sharing.repository_layout,
      });
      setGitSyncStatus(status);
    } catch (error) {
      console.error("Failed to prepare git repository:", error);
      await loadGitSyncStatus();
    } finally {
      setIsPreparingGitRepo(false);
    }
  };

  const syncGitNow = async () => {
    if (!settings) return;

    flushSync(() => setIsSyncingGitNow(true));
    await waitForPaint();
    try {
      const status = await invoke<GitSyncStatus>("git_sync_now", {
        folder: settings.git_sharing.shared_folder,
        remoteUrl: settings.git_sharing.remote_url,
        branch: settings.git_sharing.branch,
        repositoryLayout: settings.git_sharing.repository_layout,
      });
      setGitSyncStatus(status);
    } catch (error) {
      console.error("Failed to sync notes with git:", error);
      await loadGitSyncStatus();
    } finally {
      setIsSyncingGitNow(false);
    }
  };

  const openGitRemote = async () => {
    if (!settings?.git_sharing.remote_url.trim()) return;

    setIsOpeningGitRemote(true);
    try {
      await invoke("git_open_remote_url", {
        remoteUrl: settings.git_sharing.remote_url,
      });
    } catch (error) {
      console.error("Failed to open remote URL:", error);
    } finally {
      setIsOpeningGitRemote(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      invoke<StikSettings>("get_settings").then(setSettings);
      invoke<string[]>("list_folders").then(setFolders);
      loadCaptureStreak();
      checkOnThisDay();
      loadGitSyncStatus();
      getVersion().then(setAppVersion).catch(() => {});
    }
  }, [isOpen]);

  // Resume shortcuts when settings closes/unmounts
  useEffect(() => {
    return () => {
      invoke("resume_shortcuts").catch(() => {});
    };
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      await invoke("save_settings", { settings });
      await invoke("reload_shortcuts");
      if (!isWindow) {
        onClose();
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !settings) return null;

  const saveButton = (
    <button
      onClick={async () => {
        await handleSave();
        if (isWindow) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().close();
        }
      }}
      disabled={isSaving}
      className="px-5 py-2 text-[13px] text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      {isSaving ? (
        <>
          <span className="animate-spin">↻</span>
          <span>Saving...</span>
        </>
      ) : (
        <>
          <span>✓</span>
          <span>Save</span>
        </>
      )}
    </button>
  );

  const cancelButton = (
    <button
      onClick={async () => {
        if (isWindow) {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().close();
        } else {
          onClose();
        }
      }}
      className="px-5 py-2 text-[13px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
    >
      Cancel
    </button>
  );

  const tabBar = (
    <div className="flex items-center gap-1 px-5 pb-3">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
              isActive
                ? "text-coral bg-coral/10"
                : "text-stone hover:text-ink hover:bg-line/50"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  const settingsContent = (
    <SettingsContent
      activeTab={activeTab}
      settings={settings}
      folders={folders}
      onSettingsChange={setSettings}
      captureStreakLabel={captureStreak?.label ?? "Streak unavailable"}
      captureStreakDays={captureStreak?.days ?? null}
      isRefreshingStreak={isRefreshingStreak}
      onRefreshCaptureStreak={loadCaptureStreak}
      onThisDayMessage={onThisDayStatus?.message ?? "No On This Day check yet"}
      onThisDayPreview={onThisDayStatus?.preview ?? null}
      onThisDayDate={onThisDayStatus?.date ?? null}
      onThisDayFolder={onThisDayStatus?.folder ?? null}
      isCheckingOnThisDay={isCheckingOnThisDay}
      onCheckOnThisDay={checkOnThisDay}
      gitSyncStatus={gitSyncStatus}
      isPreparingGitRepo={isPreparingGitRepo}
      isSyncingGitNow={isSyncingGitNow}
      isOpeningGitRemote={isOpeningGitRemote}
      onPrepareGitRepository={prepareGitRepository}
      onSyncGitNow={syncGitNow}
      onOpenGitRemote={openGitRemote}
    />
  );

  if (isWindow) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
        <div data-tauri-drag-region className="border-b border-line bg-line/20">
          <div className="flex items-center px-5 pt-4 pb-3" data-tauri-drag-region>
            <div className="flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-coral">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
            </div>
          </div>
          {tabBar}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {settingsContent}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-line bg-line/10">
          {appVersion && <span className="text-[11px] text-stone">v{appVersion}</span>}
          <div className="flex items-center gap-3">
            {cancelButton}
            {saveButton}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-bg rounded-[14px] w-[min(96vw,620px)] max-h-[85vh] flex flex-col shadow-stik overflow-hidden border border-line/50">
        <div className="border-b border-line bg-line/20">
          <div className="flex items-center px-5 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-coral">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
            </div>
          </div>
          {tabBar}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {settingsContent}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-line bg-line/10">
          {appVersion && <span className="text-[11px] text-stone">v{appVersion}</span>}
          <div className="flex items-center gap-3">
            {cancelButton}
            {saveButton}
          </div>
        </div>
      </div>
    </div>
  );
}
