import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface FolderStats {
  name: string;
  note_count: number;
}

interface NoteInfo {
  path: string;
  filename: string;
  folder: string;
  content: string;
  created: string;
}

type SelectedItem =
  | { type: "folder"; name: string }
  | { type: "note"; folder: string; note: NoteInfo };

export default function ManagerModal() {
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderNotes, setFolderNotes] = useState<Map<string, NoteInfo[]>>(new Map());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SelectedItem | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadFolderStats = useCallback(async () => {
    try {
      const stats = await invoke<FolderStats[]>("get_folder_stats");
      setFolderStats(stats);
      if (stats.length > 0 && !selectedItem) {
        setSelectedItem({ type: "folder", name: stats[0].name });
      }
    } catch (error) {
      console.error("Failed to load folder stats:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolderStats();
  }, []);

  const loadFolderNotes = async (folderName: string) => {
    if (folderNotes.has(folderName)) return;

    setLoadingFolders((prev) => new Set(prev).add(folderName));
    try {
      const notes = await invoke<NoteInfo[]>("list_notes", { folder: folderName });
      setFolderNotes((prev) => new Map(prev).set(folderName, notes));
    } catch (error) {
      console.error("Failed to load notes:", error);
    } finally {
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(folderName);
        return next;
      });
    }
  };

  const toggleFolder = async (folderName: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderName)) {
      newExpanded.delete(folderName);
    } else {
      newExpanded.add(folderName);
      await loadFolderNotes(folderName);
    }
    setExpandedFolders(newExpanded);
  };

  // Build flat list of visible items for navigation
  const getVisibleItems = (): SelectedItem[] => {
    const items: SelectedItem[] = [];
    for (const folder of folderStats) {
      items.push({ type: "folder", name: folder.name });
      if (expandedFolders.has(folder.name)) {
        const notes = folderNotes.get(folder.name) || [];
        for (const note of notes) {
          items.push({ type: "note", folder: folder.name, note });
        }
      }
    }
    return items;
  };

  const findItemIndex = (items: SelectedItem[], item: SelectedItem | null): number => {
    if (!item) return -1;
    return items.findIndex((i) => {
      if (i.type === "folder" && item.type === "folder") {
        return i.name === item.name;
      }
      if (i.type === "note" && item.type === "note") {
        return i.note.path === item.note.path;
      }
      return false;
    });
  };

  const handleDelete = async (item: SelectedItem) => {
    try {
      if (item.type === "folder") {
        await invoke("delete_folder", { name: item.name });
      } else {
        await invoke("delete_note", { path: item.note.path });
        // Reload notes for this folder
        const notes = await invoke<NoteInfo[]>("list_notes", { folder: item.folder });
        setFolderNotes((prev) => new Map(prev).set(item.folder, notes));
      }
      setConfirmDelete(null);
      await loadFolderStats();
    } catch (error) {
      console.error("Failed to delete:", error);
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
      await loadFolderStats();
      // Update selection to new name
      setSelectedItem({ type: "folder", name: newName.trim() });
    } catch (error) {
      console.error("Failed to rename:", error);
      alert(error);
    }
  };

  const openNote = async (note: NoteInfo) => {
    try {
      await invoke("open_note_for_viewing", {
        content: note.content,
        folder: note.folder,
        path: note.path,
      });
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to open note:", error);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
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
          if (selectedItem?.type === "folder") {
            handleRename(selectedItem.name, renameValue);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          setIsRenaming(false);
          setRenameValue("");
        }
        return;
      }

      const visibleItems = getVisibleItems();
      const currentIndex = findItemIndex(visibleItems, selectedItem);

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          await getCurrentWindow().close();
          break;

        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < visibleItems.length - 1) {
            setSelectedItem(visibleItems[currentIndex + 1]);
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setSelectedItem(visibleItems[currentIndex - 1]);
          }
          break;

        case "Enter":
          e.preventDefault();
          if (selectedItem?.type === "folder") {
            toggleFolder(selectedItem.name);
          } else if (selectedItem?.type === "note") {
            openNote(selectedItem.note);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (selectedItem?.type === "folder" && !expandedFolders.has(selectedItem.name)) {
            toggleFolder(selectedItem.name);
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (selectedItem?.type === "folder" && expandedFolders.has(selectedItem.name)) {
            toggleFolder(selectedItem.name);
          } else if (selectedItem?.type === "note") {
            // Select parent folder
            setSelectedItem({ type: "folder", name: selectedItem.folder });
          }
          break;

        case "Backspace":
          e.preventDefault();
          if (selectedItem) {
            // Can't delete Inbox folder
            if (selectedItem.type === "folder" && selectedItem.name === "Inbox") {
              return;
            }
            setConfirmDelete(selectedItem);
          }
          break;

        case "r":
          if ((e.metaKey || e.ctrlKey) && selectedItem?.type === "folder" && selectedItem.name !== "Inbox") {
            e.preventDefault();
            setIsRenaming(true);
            setRenameValue(selectedItem.name);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem, expandedFolders, folderStats, folderNotes, confirmDelete, isRenaming, renameValue]);

  const startDrag = useCallback(async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("input") || (e.target as HTMLElement).closest("button")) {
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start drag:", err);
    }
  }, []);

  // Get note preview (first line)
  const getNotePreview = (note: NoteInfo): string => {
    const firstLine = note.content.split("\n")[0].trim();
    return firstLine.length > 40 ? firstLine.slice(0, 40) + "..." : firstLine;
  };

  // Render delete confirmation
  if (confirmDelete) {
    const isFolder = confirmDelete.type === "folder";
    const title = isFolder ? confirmDelete.name : getNotePreview(confirmDelete.note);
    const folder = isFolder ? null : confirmDelete.folder;

    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-2xl mb-3">🗑️</div>
          <h2 className="text-sm font-semibold text-ink mb-2">
            Delete {isFolder ? "folder" : "note"}?
          </h2>
          {folder && (
            <p className="text-[11px] text-stone mb-1">From: {folder}</p>
          )}
          <p className="text-[12px] text-stone text-center mb-4 max-w-[280px]">
            {isFolder ? (
              <>Delete "{title}" and all its notes?</>
            ) : (
              <>"{title}"</>
            )}
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
    <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
      {/* Header */}
      <div
        onMouseDown={startDrag}
        className="px-4 py-3 border-b border-line drag-handle"
      >
        <div className="flex items-center gap-2">
          <span className="text-coral">📁</span>
          <h2 className="text-sm font-semibold text-ink">Manage Notes</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {folderStats.map((folder) => {
          const isExpanded = expandedFolders.has(folder.name);
          const isFolderSelected =
            selectedItem?.type === "folder" && selectedItem.name === folder.name;
          const isCurrentlyRenaming = isRenaming && isFolderSelected;
          const notes = folderNotes.get(folder.name) || [];

          return (
            <div key={folder.name}>
              {/* Folder row */}
              <button
                onClick={() => {
                  if (!isCurrentlyRenaming) {
                    setSelectedItem({ type: "folder", name: folder.name });
                    toggleFolder(folder.name);
                  }
                }}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${
                  isFolderSelected
                    ? "bg-coral text-white"
                    : "hover:bg-line/50 text-ink"
                }`}
              >
                <span
                  className={`text-[10px] transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  } ${isFolderSelected ? "text-white/80" : "text-coral"}`}
                >
                  ▶
                </span>
                {isCurrentlyRenaming ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    className="flex-1 text-[13px] font-medium bg-white/20 rounded px-2 py-0.5 outline-none"
                  />
                ) : (
                  <span className="flex-1 text-[13px] font-medium">{folder.name}</span>
                )}
                {!isCurrentlyRenaming && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      isFolderSelected
                        ? "bg-white/20 text-white/90"
                        : "bg-line text-stone"
                    }`}
                  >
                    {folder.note_count} {folder.note_count === 1 ? "note" : "notes"}
                  </span>
                )}
              </button>

              {/* Notes inside expanded folder */}
              {isExpanded && (
                <div className="ml-4 border-l border-line/50">
                  {loadingFolders.has(folder.name) ? (
                    <div className="px-4 py-2 text-[11px] text-stone animate-pulse">
                      Loading notes...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="px-4 py-2 text-[11px] text-stone">
                      No notes in this folder
                    </div>
                  ) : (
                    notes.map((note) => {
                      const isNoteSelected =
                        selectedItem?.type === "note" &&
                        selectedItem.note.path === note.path;

                      return (
                        <button
                          key={note.path}
                          onClick={() => {
                            setSelectedItem({ type: "note", folder: folder.name, note });
                          }}
                          onDoubleClick={() => openNote(note)}
                          className={`w-full px-4 py-2 flex items-center gap-2 text-left transition-all ${
                            isNoteSelected
                              ? "bg-coral/80 text-white"
                              : "hover:bg-line/30 text-ink"
                          }`}
                        >
                          <span
                            className={`text-[10px] ${
                              isNoteSelected ? "text-white/70" : "text-stone"
                            }`}
                          >
                            📝
                          </span>
                          <span className="flex-1 text-[12px] truncate">
                            {getNotePreview(note)}
                          </span>
                          <span
                            className={`text-[9px] font-mono ${
                              isNoteSelected ? "text-white/60" : "text-stone/60"
                            }`}
                          >
                            {note.created}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="px-4 py-6 text-center text-[12px] text-stone">
            Loading folders...
          </div>
        )}

        {!isLoading && folderStats.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px] text-stone">
            No folders found
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        onMouseDown={startDrag}
        className="px-4 py-2 border-t border-line flex items-center justify-between text-[10px] text-stone drag-handle"
      >
        <div className="flex items-center gap-2">
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">↵</kbd>{" "}
            expand
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">⌫</kbd>{" "}
            delete
          </span>
        </div>
        <span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">esc</kbd>{" "}
          close
        </span>
      </div>
    </div>
  );
}
