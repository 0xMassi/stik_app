import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { FolderStats, NoteInfo } from "@/types";

type SelectedItem =
  | { type: "folder"; name: string }
  | { type: "note"; folder: string; note: NoteInfo };

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDone, 200);
    }, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]
        px-4 py-2.5 rounded-xl shadow-stik
        text-[13px] font-medium bg-ink text-white
        transition-all duration-200 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {message}
    </div>
  );
}

export default function ManagerModal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderNotes, setFolderNotes] = useState<Map<string, NoteInfo[]>>(new Map());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SelectedItem | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

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
        setSelectedItem(null);
      } else {
        await invoke("delete_note", { path: item.note.path });
        setSelectedItem({ type: "folder", name: item.folder });
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
      const content = await invoke<string>("get_note_content", { path: note.path });
      await invoke("open_note_for_viewing", {
        content,
        folder: note.folder,
        path: note.path,
      });
    } catch (error) {
      console.error("Failed to open note:", error);
    }
    closeManager();
  };

  const handleCreateFolder = async (name: string) => {
    if (!name.trim()) {
      setIsCreating(false);
      setNewFolderName("");
      return;
    }

    try {
      await invoke("create_folder", { name: name.trim() });
      setIsCreating(false);
      setNewFolderName("");
      await loadFolderStats();
      // Select the new folder
      setSelectedItem({ type: "folder", name: name.trim() });
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert(error);
    }
  };

  // Focus container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Close the manager window
  const closeManager = useCallback(async () => {
    try {
      // Try closing via Tauri API
      await getCurrentWindow().close();
    } catch {
      // Fallback: hide the window
      await invoke("hide_window");
    }
  }, []);


  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Handle ESC key
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmDelete) {
          setConfirmDelete(null);
        } else if (isRenaming) {
          setIsRenaming(false);
          setRenameValue("");
        } else if (isCreating) {
          setIsCreating(false);
          setNewFolderName("");
        } else {
          closeManager();
        }
        return;
      }

      // Handle confirmation dialog
      if (confirmDelete) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleDelete(confirmDelete);
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
        }
        return;
      }

      // Handle create mode
      if (isCreating) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleCreateFolder(newFolderName);
        }
        return;
      }

      const visibleItems = getVisibleItems();
      const currentIndex = findItemIndex(visibleItems, selectedItem);

      switch (e.key) {
        case "n":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setIsCreating(true);
            setNewFolderName("");
          }
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
            if (selectedItem.type === "folder" && selectedItem.name === "Inbox") {
              setToast("Inbox is the default folder and can't be deleted");
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
  }, [selectedItem, expandedFolders, folderStats, folderNotes, confirmDelete, isRenaming, renameValue, isCreating, newFolderName, closeManager]);

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
          <div className="w-10 h-10 mb-3 text-coral">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
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
    <div
      ref={containerRef}
      className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden outline-none"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (confirmDelete) {
            setConfirmDelete(null);
          } else if (isRenaming) {
            setIsRenaming(false);
            setRenameValue("");
          } else if (isCreating) {
            setIsCreating(false);
            setNewFolderName("");
          } else {
            closeManager();
          }
        }
      }}
    >
      {/* Header */}
      <div
        onMouseDown={startDrag}
        className="px-4 py-3 border-b border-line drag-handle flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-coral" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <h2 className="text-sm font-semibold text-ink">Manage Notes</h2>
        </div>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => closeManager()}
          className="px-2.5 py-1.5 bg-coral-light text-coral rounded-lg text-[10px] font-semibold hover:bg-coral hover:text-white transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          esc
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Create new folder input */}
        {isCreating && (
          <div className="px-4 py-2.5 flex items-center gap-3 bg-coral/10 border-b border-coral/20">
            <svg className="w-4 h-4 text-coral" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name..."
              autoFocus
              className="flex-1 text-[13px] font-medium bg-transparent text-ink placeholder:text-stone outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateFolder(newFolderName);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setIsCreating(false);
                  setNewFolderName("");
                }
                e.stopPropagation();
              }}
            />
            <span className="text-[10px] text-stone">enter to create</span>
          </div>
        )}

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
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRename(folder.name, renameValue);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setIsRenaming(false);
                        setRenameValue("");
                      }
                    }}
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
                          <svg
                            className={`w-3 h-3 ${
                              isNoteSelected ? "text-white/70" : "text-stone"
                            }`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
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
        className="px-4 py-2 border-t border-line flex items-center justify-center text-[10px] text-stone drag-handle"
      >
        <div className="flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">↵</kbd>{" "}
            expand
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">⌘N</kbd>{" "}
            new
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">⌫</kbd>{" "}
            delete
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">⌘R</kbd>{" "}
            rename
          </span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <Toast message={toast} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
