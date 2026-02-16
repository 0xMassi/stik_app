import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import PostIt from "./components/PostIt";
import SettingsModal from "./components/SettingsModal";
import CommandPalette from "./components/CommandPalette";
import AnalyticsNotice from "./components/AnalyticsNotice";
import AppleNotesPicker from "./components/AppleNotesPicker";
import { useTheme } from "./hooks/useTheme";
import type { StickedNote, StikSettings } from "@/types";
import { isMarkdownEffectivelyEmpty } from "@/utils/normalizeMarkdownForCopy";
import { shouldHideCaptureOnBlur } from "@/utils/blurAutoHide";
import { resolveCaptureFolder } from "@/utils/folderSelection";

type WindowType = "postit" | "sticked" | "settings" | "command-palette" | "apple-notes-picker";

function getWindowInfo(): { type: WindowType; id?: string; viewing?: boolean } {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");

  if (windowType === "sticked") {
    return {
      type: "sticked",
      id: params.get("id") || undefined,
      viewing: params.get("viewing") === "true"
    };
  }

  if (windowType === "settings") {
    return { type: "settings" };
  }

  if (windowType === "search" || windowType === "manager" || windowType === "command-palette") {
    return { type: "command-palette" };
  }

  if (windowType === "apple-notes-picker") {
    return { type: "apple-notes-picker" };
  }

  return { type: "postit" };
}

export default function App() {
  useTheme();
  const [currentFolder, setCurrentFolder] = useState("");
  const [stickedNote, setStickedNote] = useState<StickedNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const contentRef = useRef("");
  const blurIgnoreUntilRef = useRef(0);
  const pendingBlurHideRef = useRef<number | null>(null);
  const skipNextBlurHideRef = useRef(false);
  const [showAnalyticsNotice, setShowAnalyticsNotice] = useState(false);
  const windowInfo = getWindowInfo();

  const resolveFolder = useCallback(
    async (requestedFolder?: string, settingsFromEvent?: StikSettings) => {
      const folders = await invoke<string[]>("list_folders");
      const settings = settingsFromEvent ?? (await invoke<StikSettings>("get_settings"));
      return resolveCaptureFolder({
        requestedFolder: requestedFolder?.trim(),
        defaultFolder: settings.default_folder?.trim(),
        availableFolders: folders,
      });
    },
    []
  );

  // Initialize capture window with a valid folder (requested/default/fallback).
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    let cancelled = false;

    const initialize = async () => {
      try {
        const folder = await resolveFolder();
        if (!cancelled) {
          setCurrentFolder(folder);
        }
      } catch {
        if (!cancelled) {
          setCurrentFolder("");
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [windowInfo.type, resolveFolder]);

  // Load sticked note data if this is a sticked window
  useEffect(() => {
    if (windowInfo.type !== "sticked" || !windowInfo.id) return;

    // If viewing mode, fetch content via command
    if (windowInfo.viewing) {
      const fetchViewingContent = async () => {
        try {
          const data = await invoke<{ id: string; content: string; folder: string; path: string }>(
            "get_viewing_note_content",
            { id: windowInfo.id }
          );
          setStickedNote({
            id: data.id,
            content: data.content,
            folder: data.folder,
            position: null,
            size: null,
            created_at: "",
            updated_at: "",
            originalPath: data.path,
          });
          setCurrentFolder(data.folder);
        } catch (error) {
          console.error("Failed to load viewing note content:", error);
          setLoadError(String(error));
        }
      };

      fetchViewingContent();
      return;
    }

    // Regular sticked note - load from storage
    invoke<StickedNote>("get_sticked_note", { id: windowInfo.id })
      .then((note) => {
        setStickedNote(note);
        setCurrentFolder(note.folder);
      })
      .catch((error) => {
        console.error("Failed to load sticked note:", error);
        setLoadError(String(error));
      });
  }, [windowInfo.type, windowInfo.id, windowInfo.viewing]);

  // Hide postit on blur only when editor is empty
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    const handleFocus = () => {
      // Use Math.max so a focus event arriving after shortcut-triggered
      // never shortens the 500ms grace period down to 300ms.
      blurIgnoreUntilRef.current = Math.max(
        blurIgnoreUntilRef.current,
        Date.now() + 300,
      );
      if (pendingBlurHideRef.current !== null) {
        window.clearTimeout(pendingBlurHideRef.current);
        pendingBlurHideRef.current = null;
      }
    };
    window.addEventListener("focus", handleFocus);

    const unlisten = listen("postit-blur", async () => {
      if (skipNextBlurHideRef.current) {
        skipNextBlurHideRef.current = false;
        return;
      }
      if (pendingBlurHideRef.current !== null) {
        window.clearTimeout(pendingBlurHideRef.current);
      }
      pendingBlurHideRef.current = window.setTimeout(async () => {
        pendingBlurHideRef.current = null;

        const nowMs = Date.now();
        if (nowMs < blurIgnoreUntilRef.current) return;

        const isFocused = await getCurrentWindow().isFocused().catch(() => false);
        if (isFocused) return;

        const shouldHide = shouldHideCaptureOnBlur({
          content: contentRef.current,
          nowMs,
          ignoreUntilMs: blurIgnoreUntilRef.current,
        });
        if (shouldHide) {
          await invoke("hide_window");
        }
      }, 140);
    });

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (pendingBlurHideRef.current !== null) {
        window.clearTimeout(pendingBlurHideRef.current);
        pendingBlurHideRef.current = null;
      }
      unlisten.then((fn) => fn());
    };
  }, [windowInfo.type]);

  // Listen for shortcut triggers from Rust backend
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    const unlisten = listen<string>("shortcut-triggered", (event) => {
      skipNextBlurHideRef.current = true;
      blurIgnoreUntilRef.current = Date.now() + 500;
      void resolveFolder(event.payload)
        .then(setCurrentFolder)
        .catch(() => {});
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [windowInfo.type, resolveFolder]);

  // Keep capture folder aligned with settings updates.
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    const unlisten = listen<StikSettings>("settings-changed", (event) => {
      void resolveFolder(undefined, event.payload)
        .then(setCurrentFolder)
        .catch(() => {});
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [windowInfo.type, resolveFolder]);

  // Listen for settings shortcut (Cmd+Shift+,)
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ",") {
        e.preventDefault();
        try {
          await invoke("open_settings");
        } catch (error) {
          console.error("Failed to open settings:", error);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [windowInfo.type]);

  // Silent auto-update on startup (postit window only, production builds)
  useEffect(() => {
    if (windowInfo.type !== "postit") return;
    // Skip in dev: downloadAndInstall() extracts to a temp dir and spawns
    // a second Stik process (the released build), causing version conflicts.
    if (window.location.port) return;

    invoke<StikSettings>("get_settings")
      .then((s) => {
        if (s.auto_update_enabled === false) return;
        return check();
      })
      .then(async (update) => {
        if (update) {
          console.log(`Stik update: v${update.currentVersion} → v${update.version}`);
          await update.downloadAndInstall();
          console.log("Update installed, will apply on next restart");
        }
      })
      .catch((e) => console.debug("Update check skipped:", e));
  }, [windowInfo.type]);

  // One-time analytics notice for existing users
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    invoke<StikSettings>("get_settings")
      .then((s) => {
        if (!s.analytics_notice_dismissed) {
          setShowAnalyticsNotice(true);
        }
      })
      .catch(() => {});
  }, [windowInfo.type]);

  const handleDismissAnalyticsNotice = useCallback(async () => {
    try {
      const settings = await invoke<StikSettings>("get_settings");
      settings.analytics_notice_dismissed = true;
      await invoke("save_settings", { settings });
    } catch (error) {
      console.error("Failed to dismiss analytics notice:", error);
    }
    setShowAnalyticsNotice(false);
  }, []);

  const handleSave = useCallback(
    async (content: string, preferredFolder?: string) => {
      if (isMarkdownEffectivelyEmpty(content)) return;

      const resolvedFolder = await resolveFolder(preferredFolder ?? currentFolder);

      if (resolvedFolder !== currentFolder) {
        setCurrentFolder(resolvedFolder);
      }

      await invoke("save_note", {
        folder: resolvedFolder,
        content,
      });
    },
    [currentFolder, resolveFolder]
  );

  const handleClose = useCallback(async () => {
    try {
      await invoke("hide_window");
    } catch (error) {
      console.error("Failed to hide window:", error);
    }
  }, []);

  const handleFolderChange = useCallback((folder: string) => {
    setCurrentFolder(folder);
  }, []);

  const handleContentChange = useCallback((content: string) => {
    contentRef.current = content;
  }, []);

  // Render settings if this is that window type
  if (windowInfo.type === "settings") {
    return <SettingsModal isOpen={true} onClose={() => {}} isWindow={true} />;
  }

  // Render command palette if this is that window type
  if (windowInfo.type === "command-palette") {
    return <CommandPalette />;
  }

  // Render Apple Notes picker if this is that window type
  if (windowInfo.type === "apple-notes-picker") {
    return <AppleNotesPicker />;
  }

  // Render sticked note if this is a sticked window
  if (windowInfo.type === "sticked") {
    if (loadError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-bg rounded-[14px] gap-3 p-6">
          <div className="text-coral text-sm font-medium">Failed to load note</div>
          <div className="text-stone text-xs text-center max-w-[280px]">{loadError}</div>
          <button
            onClick={async () => {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              await getCurrentWindow().close();
            }}
            className="mt-2 px-4 py-2 text-xs bg-line hover:bg-line/70 text-ink rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      );
    }

    if (!stickedNote) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-bg rounded-[14px]">
          <div className="text-stone text-sm">Loading...</div>
        </div>
      );
    }

    return (
      <PostIt
        folder={currentFolder}
        onSave={handleSave}
        onClose={handleClose}
        onFolderChange={handleFolderChange}
        isSticked={true}
        stickedId={stickedNote.id}
        initialContent={stickedNote.content}
        isViewing={windowInfo.viewing}
        originalPath={stickedNote.originalPath}
      />
    );
  }

  // Render postit (capture mode)
  const handleOpenSettings = useCallback(async () => {
    try {
      await invoke("open_settings");
    } catch (error) {
      console.error("Failed to open settings:", error);
    }
  }, []);

  return (
    <>
      <PostIt
        folder={currentFolder}
        onSave={handleSave}
        onClose={handleClose}
        onFolderChange={handleFolderChange}
        onOpenSettings={handleOpenSettings}
        onContentChange={handleContentChange}
      />
      {showAnalyticsNotice && <AnalyticsNotice onDismiss={handleDismissAnalyticsNotice} />}
    </>
  );
}
