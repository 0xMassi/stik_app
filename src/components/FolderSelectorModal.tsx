import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ShortcutMapping {
  shortcut: string;
  folder: string;
  enabled: boolean;
}

interface StikSettings {
  shortcut_mappings: ShortcutMapping[];
  default_folder: string;
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace("CommandOrControl+Shift+", "⌘⇧")
    .replace("CommandOrControl+", "⌘")
    .replace("Shift+", "⇧");
}

export default function FolderSelectorModal() {
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settings, setSettings] = useState<StikSettings | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load folders and settings on mount
  useEffect(() => {
    invoke<string[]>("list_folders").then(setFolders);
    invoke<StikSettings>("get_settings").then(setSettings);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Filter folders based on query
  const filteredFolders = folders.filter((f) =>
    f.toLowerCase().includes(query.toLowerCase())
  );

  // Check if query could be a new folder
  const isNewFolder =
    query.trim() &&
    !folders.some((f) => f.toLowerCase() === query.toLowerCase());

  // Get shortcut for a folder
  const getShortcutForFolder = (folder: string): string | null => {
    if (!settings) return null;
    const mapping = settings.shortcut_mappings.find(
      (m) => m.folder === folder && m.enabled
    );
    return mapping ? formatShortcut(mapping.shortcut) : null;
  };

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = async (folder: string) => {
    // Emit event to postit window
    await emit("folder-selected", folder);
    // Close this window
    await getCurrentWindow().close();
  };

  const handleCreateAndSelect = async () => {
    if (!query.trim()) return;

    try {
      await invoke("create_folder", { name: query.trim() });
      await handleSelect(query.trim());
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const maxIndex = isNewFolder
        ? filteredFolders.length
        : filteredFolders.length - 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, maxIndex));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (isNewFolder && selectedIndex === filteredFolders.length) {
            handleCreateAndSelect();
          } else if (filteredFolders.length > 0 && selectedIndex < filteredFolders.length) {
            handleSelect(filteredFolders[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          getCurrentWindow().close();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFolders, selectedIndex, isNewFolder, query]);

  return (
    <div className="w-full h-full bg-bg rounded-[14px] overflow-hidden flex flex-col shadow-stik">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line">
        <h2 className="text-sm font-semibold text-ink mb-2">Select Folder</h2>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone text-sm">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search or create..."
            className="w-full pl-9 pr-3 py-2 bg-line/50 rounded-lg text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-1 focus:ring-coral/50"
          />
        </div>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredFolders.slice(0, 6).map((folder, i) => {
          const shortcut = getShortcutForFolder(folder);
          const isDefault = settings?.default_folder === folder;

          return (
            <button
              key={folder}
              onClick={() => handleSelect(folder)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${
                i === selectedIndex
                  ? "bg-coral text-white"
                  : "hover:bg-line/50 text-ink"
              }`}
            >
              <span
                className={`text-[10px] ${
                  i === selectedIndex ? "text-white/80" : "text-coral"
                }`}
              >
                ●
              </span>
              <span className="flex-1 text-[13px] font-medium">{folder}</span>
              {isDefault && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    i === selectedIndex
                      ? "bg-white/20 text-white/90"
                      : "bg-line text-stone"
                  }`}
                >
                  default
                </span>
              )}
              {shortcut && (
                <kbd
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    i === selectedIndex
                      ? "bg-white/20 text-white/90"
                      : "bg-coral-light text-coral"
                  }`}
                >
                  {shortcut}
                </kbd>
              )}
              {i === selectedIndex && (
                <kbd className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded text-white/90 font-mono">
                  enter
                </kbd>
              )}
            </button>
          );
        })}

        {/* Create new folder option */}
        {isNewFolder && (
          <button
            onClick={handleCreateAndSelect}
            onMouseEnter={() => setSelectedIndex(filteredFolders.length)}
            className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${
              selectedIndex === filteredFolders.length
                ? "bg-coral text-white"
                : "hover:bg-line/50 text-ink"
            }`}
          >
            <span
              className={`text-[10px] ${
                selectedIndex === filteredFolders.length
                  ? "text-white/80"
                  : "text-coral"
              }`}
            >
              +
            </span>
            <span className="flex-1 text-[13px] font-medium">
              Create "{query.trim()}"
            </span>
            {selectedIndex === filteredFolders.length && (
              <kbd className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded text-white/90 font-mono">
                enter
              </kbd>
            )}
          </button>
        )}

        {/* Empty state */}
        {filteredFolders.length === 0 && !isNewFolder && (
          <div className="px-4 py-6 text-center text-[12px] text-stone">
            No folders found
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-line flex items-center justify-between text-[10px] text-stone">
        <span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">
            ↑↓
          </kbd>{" "}
          navigate
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">
            esc
          </kbd>{" "}
          close
        </span>
      </div>
    </div>
  );
}
