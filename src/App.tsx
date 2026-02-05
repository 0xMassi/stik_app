import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import PostIt from "./components/PostIt";
import FolderSelectorModal from "./components/FolderSelectorModal";
import SettingsModal from "./components/SettingsModal";
import SearchModal from "./components/SearchModal";
import ManagerModal from "./components/ManagerModal";

interface StickedNote {
  id: string;
  content: string;
  folder: string;
  position: [number, number] | null;
  size: [number, number] | null;
  created_at: string;
  updated_at: string;
}

type WindowType = "postit" | "folder-selector" | "sticked" | "settings" | "search" | "manager";

function getWindowInfo(): { type: WindowType; id?: string; viewing?: boolean } {
  const params = new URLSearchParams(window.location.search);
  const windowType = params.get("window");

  if (windowType === "folder-selector") {
    return { type: "folder-selector" };
  }

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

  if (windowType === "search") {
    return { type: "search" };
  }

  if (windowType === "manager") {
    return { type: "manager" };
  }

  return { type: "postit" };
}

export default function App() {
  const [currentFolder, setCurrentFolder] = useState("Inbox");
  const [stickedNote, setStickedNote] = useState<StickedNote | null>(null);
  const windowInfo = getWindowInfo();

  // Load sticked note data if this is a sticked window
  useEffect(() => {
    if (windowInfo.type !== "sticked" || !windowInfo.id) return;

    // If viewing mode, fetch content via command
    if (windowInfo.viewing) {
      const fetchViewingContent = async () => {
        try {
          const data = await invoke<{ id: string; content: string; folder: string }>(
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
          });
          setCurrentFolder(data.folder);
        } catch (error) {
          console.error("Failed to load viewing note content:", error);
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
      });
  }, [windowInfo.type, windowInfo.id, windowInfo.viewing]);

  // Listen for shortcut triggers from Rust backend
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    const unlisten = listen<string>("shortcut-triggered", (event) => {
      setCurrentFolder(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [windowInfo.type]);

  // Listen for folder selection from folder selector window
  useEffect(() => {
    if (windowInfo.type !== "postit") return;

    const unlisten = listen<string>("folder-selected", async (event) => {
      setCurrentFolder(event.payload);
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const window = getCurrentWindow();
        await window.show();
        await window.setFocus();
      } catch (error) {
        console.error("Failed to show window:", error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [windowInfo.type]);

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

  const handleSave = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      try {
        await invoke("save_note", {
          folder: currentFolder,
          content,
        });
      } catch (error) {
        console.error("Failed to save note:", error);
      }
    },
    [currentFolder]
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

  // Render folder selector if this is that window type
  if (windowInfo.type === "folder-selector") {
    return <FolderSelectorModal />;
  }

  // Render settings if this is that window type
  if (windowInfo.type === "settings") {
    return <SettingsModal isOpen={true} onClose={() => {}} isWindow={true} />;
  }

  // Render search if this is that window type
  if (windowInfo.type === "search") {
    return <SearchModal />;
  }

  // Render manager if this is that window type
  if (windowInfo.type === "manager") {
    return <ManagerModal />;
  }

  // Render sticked note if this is a sticked window
  if (windowInfo.type === "sticked") {
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
    <PostIt
      folder={currentFolder}
      onSave={handleSave}
      onClose={handleClose}
      onFolderChange={handleFolderChange}
      onOpenSettings={handleOpenSettings}
    />
  );
}
