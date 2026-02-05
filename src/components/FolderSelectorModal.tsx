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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadFolders = () => {
    invoke<string[]>("list_folders").then(setFolders);
  };

  // Load folders and settings on mount
  useEffect(() => {
    loadFolders();
    invoke<StikSettings>("get_settings").then(setSettings);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

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
    await emit("folder-selected", folder);
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

  const handleDelete = async (folder: string) => {
    try {
      await invoke("delete_folder", { name: folder });
      setConfirmDelete(null);
      loadFolders();
    } catch (error) {
      console.error("Failed to delete folder:", error);
      alert(error);
    }
  };

  const handleRename = async (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) {
      setIsRenaming(false);
      setRenameValue("");
      return;
    }

    try {
      await invoke("rename_folder", { oldName, newName: newName.trim() });
      setIsRenaming(false);
      setRenameValue("");
      loadFolders();
    } catch (error) {
      console.error("Failed to rename folder:", error);
      alert(error);
    }
  };

  const startRename = (folder: string) => {
    if (folder === "Inbox") return;
    setIsRenaming(true);
    setRenameValue(folder);
  };

  // Get currently selected folder
  const selectedFolder = filteredFolders[selectedIndex];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle confirmation dialog
      if (confirmDelete) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleDelete(confirmDelete);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setConfirmDelete(null);
        }
        return;
      }

      // Handle rename mode
      if (isRenaming) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleRename(selectedFolder, renameValue);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setIsRenaming(false);
          setRenameValue("");
        }
        return;
      }

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
        case "Backspace":
          // Delete selected folder (if not in input and not Inbox)
          if (
            document.activeElement !== inputRef.current &&
            selectedFolder &&
            selectedFolder !== "Inbox"
          ) {
            e.preventDefault();
            setConfirmDelete(selectedFolder);
          }
          break;
        case "r":
          // Cmd+R to rename
          if ((e.metaKey || e.ctrlKey) && selectedFolder && selectedFolder !== "Inbox") {
            e.preventDefault();
            startRename(selectedFolder);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFolders, selectedIndex, isNewFolder, query, confirmDelete, isRenaming, renameValue, selectedFolder]);

  // Render delete confirmation overlay
  if (confirmDelete) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] overflow-hidden flex flex-col shadow-stik">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-2xl mb-3">🗑️</div>
          <h2 className="text-sm font-semibold text-ink mb-2">Delete folder?</h2>
          <p className="text-[12px] text-stone text-center mb-4">
            Delete "{confirmDelete}" and all its notes?<br />
            This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 text-[12px] bg-line hover:bg-line/70 text-ink rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(confirmDelete)}
              className="px-4 py-2 text-[12px] bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-t border-line flex items-center justify-center text-[10px] text-stone">
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">esc</kbd>
          <span className="ml-1">cancel</span>
          <span className="mx-2">·</span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">enter</kbd>
          <span className="ml-1">confirm</span>
        </div>
      </div>
    );
  }

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
          const isSelected = i === selectedIndex;
          const isCurrentlyRenaming = isRenaming && isSelected;

          return (
            <button
              key={folder}
              onClick={() => !isCurrentlyRenaming && handleSelect(folder)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${
                isSelected
                  ? "bg-coral text-white"
                  : "hover:bg-line/50 text-ink"
              }`}
            >
              <span
                className={`text-[10px] ${
                  isSelected ? "text-white/80" : "text-coral"
                }`}
              >
                ●
              </span>
              {isCurrentlyRenaming ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1 text-[13px] font-medium bg-white/20 rounded px-2 py-0.5 outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 text-[13px] font-medium">{folder}</span>
              )}
              {!isCurrentlyRenaming && isDefault && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    isSelected
                      ? "bg-white/20 text-white/90"
                      : "bg-line text-stone"
                  }`}
                >
                  default
                </span>
              )}
              {!isCurrentlyRenaming && shortcut && (
                <kbd
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isSelected
                      ? "bg-white/20 text-white/90"
                      : "bg-coral-light text-coral"
                  }`}
                >
                  {shortcut}
                </kbd>
              )}
              {!isCurrentlyRenaming && isSelected && (
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
        <div className="flex items-center gap-2">
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">↑↓</kbd>{" "}
            navigate
          </span>
          {selectedFolder && selectedFolder !== "Inbox" && (
            <>
              <span>
                <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">⌫</kbd>{" "}
                delete
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">⌘R</kbd>{" "}
                rename
              </span>
            </>
          )}
        </div>
        <span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">esc</kbd>{" "}
          close
        </span>
      </div>
    </div>
  );
}
