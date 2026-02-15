import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  NoteInfo,
  SearchResult,
  SemanticResult,
  FolderStats,
  StikSettings,
} from "@/types";
import { extractNoteTitle, normalizeNoteSnippet } from "@/utils/notePresentation";
import ConfirmDialog from "./ConfirmDialog";
import FolderSidebar from "./command-palette/FolderSidebar";
import NoteList from "./command-palette/NoteList";
import MovePicker from "./command-palette/MovePicker";

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
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[250]
        px-4 py-2.5 rounded-xl shadow-stik
        text-[13px] font-medium bg-ink text-bg
        transition-all duration-200 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {message}
    </div>
  );
}

export default function CommandPalette() {
  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(0);
  const [recentNotes, setRecentNotes] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Folder state
  const [folderStats, setFolderStats] = useState<FolderStats[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderColors, setFolderColors] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolderIndex, setSelectedFolderIndex] = useState(0);
  const [totalNoteCount, setTotalNoteCount] = useState(0);

  // Pane focus: "left" = folder sidebar, "right" = note list
  const [focusPane, setFocusPane] = useState<"left" | "right">("right");

  // Folder management
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("coral");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamingFolderName, setRenamingFolderName] = useState<string | null>(null);

  // New note creation
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");

  // Overlays
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "note" | "folder";
    note?: SearchResult;
    folderName?: string;
  } | null>(null);
  const [showMoveModal, setShowMoveModal] = useState<SearchResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Sidebar position (persisted in settings)
  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">("left");
  const settingsRef = useRef<StikSettings | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Load folder stats with accurate note counts from the NoteIndex
  const loadFolderStats = useCallback(async () => {
    try {
      const [stats, allNotes] = await Promise.all([
        invoke<FolderStats[]>("get_folder_stats"),
        invoke<NoteInfo[]>("list_notes", { folder: null }),
      ]);

      // Recount from NoteIndex so root-level notes are included
      const countByFolder = new Map<string, number>();
      for (const note of allNotes) {
        const f = note.folder || "";
        countByFolder.set(f, (countByFolder.get(f) || 0) + 1);
      }

      const corrected = stats.map((s) => ({
        ...s,
        note_count: countByFolder.get(s.name) || 0,
      }));

      setFolderStats(corrected);
      setTotalNoteCount(allNotes.length);
    } catch (error) {
      console.error("Failed to load folder stats:", error);
    }
  }, []);

  useEffect(() => {
    loadFolderStats();
    invoke<string[]>("list_folders").then(setFolders);
    invoke<StikSettings>("get_settings").then((s) => {
      settingsRef.current = s;
      setFolderColors(s.folder_colors ?? {});
      if (s.sidebar_position === "right") setSidebarPosition("right");
    });

    const unlisten = listen<StikSettings>("settings-changed", (event) => {
      settingsRef.current = event.payload;
      setFolderColors(event.payload.folder_colors ?? {});
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadFolderStats]);

  // Load recent notes when folder filter changes
  useEffect(() => {
    invoke<NoteInfo[]>("list_notes", { folder: selectedFolder }).then(
      (notes) => {
        setRecentNotes(
          notes.slice(0, 15).map((n) => ({
            path: n.path,
            filename: n.filename,
            folder: n.folder,
            title: extractNoteTitle(n.content),
            snippet: normalizeNoteSnippet(n.content),
            created: n.created,
          }))
        );
      }
    );
  }, [selectedFolder]);

  // Search: text + semantic in parallel (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setResults(recentNotes);
      setSemanticResults([]);
      setSelectedNoteIndex(0);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const trimmed = query.trim();

      const [textResult, semanticResult] = await Promise.allSettled([
        invoke<SearchResult[]>("search_notes", {
          query: trimmed,
          folder: selectedFolder,
        }),
        invoke<SemanticResult[]>("semantic_search", {
          query: trimmed,
          folder: selectedFolder,
        }),
      ]);

      const textResults =
        textResult.status === "fulfilled" ? textResult.value : [];
      setResults(textResults);

      if (semanticResult.status === "fulfilled") {
        const textPaths = new Set(textResults.map((r) => r.path));
        setSemanticResults(
          semanticResult.value.filter((r) => !textPaths.has(r.path))
        );
      } else {
        setSemanticResults([]);
      }

      setSelectedNoteIndex(0);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, recentNotes, selectedFolder]);

  // Keep selectedFolderIndex in sync with selectedFolder
  useEffect(() => {
    if (selectedFolder === null) {
      setSelectedFolderIndex(0);
    } else {
      const idx = folderStats.findIndex((f) => f.name === selectedFolder);
      setSelectedFolderIndex(idx >= 0 ? idx + 1 : 0); // +1 because "All" is index 0
    }
  }, [selectedFolder, folderStats]);

  // Scroll selected note into view
  useEffect(() => {
    if (resultsRef.current) {
      const items =
        resultsRef.current.querySelectorAll<HTMLElement>("button");
      if (items[selectedNoteIndex]) {
        items[selectedNoteIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedNoteIndex]);

  const closePalette = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      await invoke("hide_window");
    }
  }, []);

  const handleSelectResult = useCallback(
    async (result: SearchResult) => {
      try {
        const content = await invoke<string>("get_note_content", {
          path: result.path,
        });
        await invoke("open_note_for_viewing", {
          content,
          folder: result.folder,
          path: result.path,
        });
      } catch (error) {
        console.error("Failed to open note:", error);
      }
      closePalette();
    },
    [closePalette]
  );

  const refreshAfterChange = useCallback(async () => {
    await loadFolderStats();
    const updatedFolders = await invoke<string[]>("list_folders");
    setFolders(updatedFolders);

    const notes = await invoke<NoteInfo[]>("list_notes", {
      folder: selectedFolder,
    });
    const recent = notes.slice(0, 15).map((n) => ({
      path: n.path,
      filename: n.filename,
      folder: n.folder,
      title: extractNoteTitle(n.content),
      snippet: normalizeNoteSnippet(n.content),
      created: n.created,
    }));
    setRecentNotes(recent);

    if (query.trim()) {
      const searchResults = await invoke<SearchResult[]>("search_notes", {
        query: query.trim(),
        folder: selectedFolder,
      });
      setResults(searchResults);
      setSelectedNoteIndex((i) => Math.min(i, searchResults.length - 1));
    } else {
      setResults(recent);
      setSelectedNoteIndex((i) => Math.min(i, recent.length - 1));
    }
  }, [loadFolderStats, query, selectedFolder]);

  // Delete note
  const handleDeleteNote = useCallback(
    async (note: SearchResult) => {
      try {
        await invoke("delete_note", { path: note.path });
        // Notify viewing windows about deletion
        await emit("note-deleted", note.path);
        setConfirmDelete(null);
        await refreshAfterChange();
      } catch (error) {
        console.error("Failed to delete note:", error);
        setToast(String(error));
      }
    },
    [refreshAfterChange]
  );

  // Delete folder
  const handleDeleteFolder = useCallback(
    async (folderName: string) => {
      try {
        await invoke("delete_folder", { name: folderName });
        setConfirmDelete(null);
        if (selectedFolder === folderName) {
          setSelectedFolder(null);
        }
        // Re-fetch settings (folder deletion may affect them) and notify other windows
        const fresh = await invoke<StikSettings>("get_settings");
        settingsRef.current = fresh;
        await emit("settings-changed", fresh);
        await refreshAfterChange();
      } catch (error) {
        console.error("Failed to delete folder:", error);
        setToast(String(error));
      }
    },
    [selectedFolder, refreshAfterChange]
  );

  // Move note
  const handleMoveNote = useCallback(
    async (note: SearchResult, targetFolder: string) => {
      if (targetFolder === note.folder) {
        setShowMoveModal(null);
        return;
      }
      try {
        await invoke("move_note", { path: note.path, targetFolder });
        setShowMoveModal(null);
        await refreshAfterChange();
      } catch (error) {
        console.error("Failed to move note:", error);
        setToast(String(error));
      }
    },
    [refreshAfterChange]
  );

  // Save settings helper — keeps settingsRef in sync and notifies other windows
  const saveAndEmitSettings = useCallback(async (patch: Partial<StikSettings>) => {
    const current = settingsRef.current ?? await invoke<StikSettings>("get_settings");
    const updated = { ...current, ...patch };
    settingsRef.current = updated;
    await invoke("save_settings", { settings: updated });
    await emit("settings-changed", updated);
  }, []);

  // Create folder
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      setNewFolderName("");
      return;
    }
    try {
      await invoke("create_folder", { name: newFolderName.trim() });
      if (newFolderColor !== "coral") {
        const updatedColors = { ...folderColors, [newFolderName.trim()]: newFolderColor };
        setFolderColors(updatedColors);
        await saveAndEmitSettings({ folder_colors: updatedColors });
      }
      setIsCreatingFolder(false);
      setNewFolderName("");
      setNewFolderColor("coral");
      await refreshAfterChange();
      setSelectedFolder(newFolderName.trim());
    } catch (error) {
      console.error("Failed to create folder:", error);
      setToast(String(error));
    }
  }, [newFolderName, newFolderColor, folderColors, refreshAfterChange, saveAndEmitSettings]);

  // Rename folder
  const handleRenameFolder = useCallback(async () => {
    if (
      !renameValue.trim() ||
      !renamingFolderName ||
      renameValue === renamingFolderName
    ) {
      setIsRenamingFolder(false);
      setRenameValue("");
      setRenamingFolderName(null);
      return;
    }
    try {
      await invoke("rename_folder", {
        oldName: renamingFolderName,
        newName: renameValue.trim(),
      });
      setIsRenamingFolder(false);
      setRenameValue("");
      const oldName = renamingFolderName;
      setRenamingFolderName(null);
      await refreshAfterChange();
      if (selectedFolder === oldName) {
        setSelectedFolder(renameValue.trim());
      }
    } catch (error) {
      console.error("Failed to rename folder:", error);
      setToast(String(error));
    }
  }, [renameValue, renamingFolderName, selectedFolder, refreshAfterChange]);

  // Set folder color (during rename)
  const handleSetFolderColor = useCallback(
    async (colorKey: string) => {
      if (!renamingFolderName) return;
      const updatedColors = { ...folderColors, [renamingFolderName]: colorKey };
      setFolderColors(updatedColors);
      try {
        await saveAndEmitSettings({ folder_colors: updatedColors });
      } catch (error) {
        console.error("Failed to save folder color:", error);
      }
    },
    [renamingFolderName, folderColors, saveAndEmitSettings]
  );

  // Create new note in selected folder
  const handleCreateNote = useCallback(async () => {
    const title = newNoteTitle.trim();
    if (!title) {
      setIsCreatingNote(false);
      setNewNoteTitle("");
      return;
    }

    // Default to first available folder if "All" is selected
    const targetFolder = selectedFolder || folders[0];
    if (!targetFolder) {
      setToast("Create a folder first");
      return;
    }

    try {
      const content = `# ${title}\n\n`;
      await invoke("save_note", { folder: targetFolder, content });
      setIsCreatingNote(false);
      setNewNoteTitle("");
      await refreshAfterChange();

      // Open the newly created note (it's the most recent one)
      const notes = await invoke<NoteInfo[]>("list_notes", {
        folder: targetFolder,
      });
      if (notes.length > 0) {
        const newest = notes[0];
        const noteContent = await invoke<string>("get_note_content", {
          path: newest.path,
        });
        await invoke("open_note_for_viewing", {
          content: noteContent,
          folder: newest.folder,
          path: newest.path,
        });
        closePalette();
      }
    } catch (error) {
      console.error("Failed to create note:", error);
      setToast(String(error));
    }
  }, [newNoteTitle, selectedFolder, folders, refreshAfterChange, closePalette]);

  // Select folder from sidebar
  const handleSelectFolder = useCallback((folder: string | null) => {
    setSelectedFolder(folder);
    setFocusPane("right");
    setSelectedNoteIndex(0);
  }, []);

  // Keyboard handler
  useEffect(() => {
    // Skip keyboard when overlays are active (they handle their own keys)
    if (confirmDelete || showMoveModal) return;
    // Skip when inline editing (create/rename handle their own keys via stopPropagation)
    if (isCreatingFolder || isRenamingFolder || isCreatingNote) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab: toggle pane focus
      if (e.key === "Tab" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setFocusPane((p) => (p === "left" ? "right" : "left"));
        return;
      }

      // Escape: close palette
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        return;
      }

      // Any printable character: focus search input + right pane
      if (
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement !== inputRef.current
      ) {
        inputRef.current?.focus();
        setFocusPane("right");
        return; // Let the key propagate to the input
      }

      if (focusPane === "right") {
        const totalItems = results.length + semanticResults.length;

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedNoteIndex((i) => Math.min(i + 1, totalItems - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedNoteIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && totalItems > 0) {
          e.preventDefault();
          const item =
            selectedNoteIndex < results.length
              ? results[selectedNoteIndex]
              : semanticResults[selectedNoteIndex - results.length];
          if (item) handleSelectResult(item);
        } else if (
          e.key === "Backspace" &&
          !query.trim() &&
          results.length > 0
        ) {
          e.preventDefault();
          if (selectedNoteIndex < results.length) {
            const note = results[selectedNoteIndex];
            setConfirmDelete({ type: "note", note });
          }
        } else if (
          e.key === "m" &&
          (e.metaKey || e.ctrlKey) &&
          totalItems > 0
        ) {
          e.preventDefault();
          const note =
            selectedNoteIndex < results.length
              ? results[selectedNoteIndex]
              : semanticResults[selectedNoteIndex - results.length];
          setShowMoveModal(note);
        } else if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          setIsCreatingNote(true);
          setNewNoteTitle("");
        }
      } else {
        // Left pane (folder sidebar)
        const totalFolderItems = folderStats.length + 1; // +1 for "All"

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedFolderIndex((i) =>
            Math.min(i + 1, totalFolderItems - 1)
          );
          // Apply folder selection
          const newIdx = Math.min(
            selectedFolderIndex + 1,
            totalFolderItems - 1
          );
          if (newIdx === 0) {
            setSelectedFolder(null);
          } else {
            setSelectedFolder(folderStats[newIdx - 1]?.name ?? null);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedFolderIndex((i) => Math.max(i - 1, 0));
          const newIdx = Math.max(selectedFolderIndex - 1, 0);
          if (newIdx === 0) {
            setSelectedFolder(null);
          } else {
            setSelectedFolder(folderStats[newIdx - 1]?.name ?? null);
          }
        } else if (e.key === "Enter") {
          e.preventDefault();
          // Switch to right pane to browse notes in selected folder
          setFocusPane("right");
          setSelectedNoteIndex(0);
        } else if (
          e.key === "Backspace" &&
          selectedFolder
        ) {
          e.preventDefault();
          setConfirmDelete({ type: "folder", folderName: selectedFolder });
        } else if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          setIsCreatingFolder(true);
          setNewFolderName("");
        } else if (
          e.key === "r" &&
          (e.metaKey || e.ctrlKey) &&
          selectedFolder
        ) {
          e.preventDefault();
          setIsRenamingFolder(true);
          setRenameValue(selectedFolder);
          setRenamingFolderName(selectedFolder);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusPane,
    results,
    semanticResults,
    selectedNoteIndex,
    selectedFolderIndex,
    selectedFolder,
    query,
    folderStats,
    confirmDelete,
    showMoveModal,
    isCreatingFolder,
    isRenamingFolder,
    isCreatingNote,
    handleSelectResult,
    closePalette,
  ]);

  const toggleSidebarPosition = useCallback(async () => {
    const next = sidebarPosition === "left" ? "right" : "left";
    setSidebarPosition(next);
    try {
      await saveAndEmitSettings({ sidebar_position: next });
    } catch (err) {
      console.error("Failed to save sidebar position:", err);
    }
  }, [sidebarPosition, saveAndEmitSettings]);

  const startDrag = useCallback(async (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest("input") ||
      (e.target as HTMLElement).closest("button")
    ) {
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start drag:", err);
    }
  }, []);

  return (
    <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
      {/* Search bar */}
      <div
        onMouseDown={startDrag}
        className="px-4 py-3 border-b border-line drag-handle"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-coral shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocusPane("right");
            }}
            placeholder={
              selectedFolder
                ? `Search in ${selectedFolder}...`
                : "Search across all notes..."
            }
            className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-stone outline-none"
          />
          {isSearching && (
            <span className="text-stone text-sm animate-pulse">...</span>
          )}
        </div>
      </div>

      {/* Two-pane layout */}
      <div className={`flex-1 flex overflow-hidden min-h-0 ${sidebarPosition === "right" ? "flex-row-reverse" : ""}`}>
        <FolderSidebar
          folderStats={folderStats}
          totalNoteCount={totalNoteCount}
          selectedFolder={selectedFolder}
          folderColors={folderColors}
          focused={focusPane === "left"}
          isCreating={isCreatingFolder}
          newFolderName={newFolderName}
          newFolderColor={newFolderColor}
          isRenaming={isRenamingFolder}
          renameValue={renameValue}
          renamingFolder={renamingFolderName}
          onSelectFolder={handleSelectFolder}
          onSetNewFolderName={(name) => {
            if (!isCreatingFolder) setIsCreatingFolder(true);
            setNewFolderName(name);
          }}
          onSetNewFolderColor={(color) => {
            if (isRenamingFolder) {
              handleSetFolderColor(color);
            } else {
              setNewFolderColor(color);
            }
          }}
          onCreateFolder={handleCreateFolder}
          onCancelCreate={() => {
            setIsCreatingFolder(false);
            setNewFolderName("");
            setNewFolderColor("coral");
          }}
          onSetRenameValue={setRenameValue}
          onRenameFolder={handleRenameFolder}
          onCancelRename={() => {
            setIsRenamingFolder(false);
            setRenameValue("");
            setRenamingFolderName(null);
          }}
          position={sidebarPosition}
        />

        <NoteList
          results={results}
          semanticResults={semanticResults}
          selectedIndex={selectedNoteIndex}
          query={query}
          isSearching={isSearching}
          folderColors={folderColors}
          focused={focusPane === "right"}
          resultsRef={resultsRef}
          onSelectResult={handleSelectResult}
          onSetSelectedIndex={setSelectedNoteIndex}
          isCreatingNote={isCreatingNote}
          newNoteTitle={newNoteTitle}
          onSetNewNoteTitle={setNewNoteTitle}
          onCreateNote={handleCreateNote}
          onCancelCreateNote={() => {
            setIsCreatingNote(false);
            setNewNoteTitle("");
          }}
          selectedFolder={selectedFolder}
          folders={folders}
        />
      </div>

      {/* Footer */}
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between px-4 py-2 border-t border-line text-[10px] text-stone drag-handle"
      >
        <div className="flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              tab
            </kbd>{" "}
            switch pane
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">↵</kbd>{" "}
            open
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">⌫</kbd>{" "}
            delete
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              ⌘M
            </kbd>{" "}
            move
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              ⌘N
            </kbd>{" "}
            new
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebarPosition}
            className="flex items-center gap-1 hover:text-coral transition-colors"
            title={`Move sidebar to ${sidebarPosition === "left" ? "right" : "left"}`}
          >
            <svg
              className={`w-3 h-3 ${sidebarPosition === "right" ? "scale-x-[-1]" : ""}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M0 2a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V2zm5.5 0H2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h3.5V2zM7 2v12h7a.5.5 0 00.5-.5v-11A.5.5 0 0014 2H7z" />
            </svg>
          </button>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">esc</kbd>{" "}
            close
          </span>
        </div>
      </div>

      {/* Overlays */}
      {confirmDelete && (
        <ConfirmDialog
          title={
            confirmDelete.type === "folder"
              ? `Delete folder "${confirmDelete.folderName}"?`
              : "Delete note?"
          }
          description={
            confirmDelete.type === "folder"
              ? "This will delete the folder and all its notes."
              : confirmDelete.note
                ? `From: ${confirmDelete.note.folder}`
                : undefined
          }
          onConfirm={() => {
            if (confirmDelete.type === "folder" && confirmDelete.folderName) {
              handleDeleteFolder(confirmDelete.folderName);
            } else if (confirmDelete.note) {
              handleDeleteNote(confirmDelete.note);
            }
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {showMoveModal && (
        <MovePicker
          note={showMoveModal}
          folders={folders}
          folderColors={folderColors}
          onMove={(targetFolder) => handleMoveNote(showMoveModal, targetFolder)}
          onCancel={() => setShowMoveModal(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
