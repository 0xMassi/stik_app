import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import PostIt from "./components/PostIt";

export default function App() {
  const [currentFolder, setCurrentFolder] = useState("Inbox");

  // Listen for shortcut triggers from Rust backend
  useEffect(() => {
    const unlisten = listen<string>("shortcut-triggered", (event) => {
      setCurrentFolder(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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

  return (
    <PostIt
      folder={currentFolder}
      onSave={handleSave}
      onClose={handleClose}
      onFolderChange={handleFolderChange}
    />
  );
}
