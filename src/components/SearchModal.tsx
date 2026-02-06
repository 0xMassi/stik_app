import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SearchResult } from "@/types";

export default function SearchModal() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SearchResult | null>(null);
  const [showMoveModal, setShowMoveModal] = useState<SearchResult | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [moveFolderIndex, setMoveFolderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Load folders for move modal
  useEffect(() => {
    invoke<string[]>("list_folders").then(setFolders);
  }, []);

  // Search when query changes (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchResults = await invoke<SearchResult[]>("search_notes", {
          query: query.trim(),
        });
        setResults(searchResults);
        setSelectedIndex(0);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Handle delete confirmation
      if (confirmDelete) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleDeleteNote(confirmDelete);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setConfirmDelete(null);
        }
        return;
      }

      // Handle move folder picker
      if (showMoveModal) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowMoveModal(null);
          setMoveFolderIndex(0);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setMoveFolderIndex((i) => Math.min(i + 1, folders.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setMoveFolderIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleMoveNote(showMoveModal, folders[moveFolderIndex]);
        }
        return;
      }

      // Normal search mode
      if (e.key === "Escape") {
        e.preventDefault();
        await getCurrentWindow().close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        handleSelectResult(results[selectedIndex]);
      } else if (e.key === "Backspace" && !query.trim() && results.length > 0) {
        // Delete note when backspace pressed with empty query
        e.preventDefault();
        setConfirmDelete(results[selectedIndex]);
      } else if (e.key === "m" && (e.metaKey || e.ctrlKey) && results.length > 0) {
        // Cmd+M to move note
        e.preventDefault();
        const note = results[selectedIndex];
        // Pre-select a different folder than the current one
        const otherFolderIndex = folders.findIndex((f) => f !== note.folder);
        setMoveFolderIndex(otherFolderIndex >= 0 ? otherFolderIndex : 0);
        setShowMoveModal(note);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [results, selectedIndex, query, confirmDelete, showMoveModal, folders, moveFolderIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedEl = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleSelectResult = useCallback(async (result: SearchResult) => {
    try {
      const content = await invoke<string>("get_note_content", { path: result.path });
      await invoke("open_note_for_viewing", {
        content,
        folder: result.folder,
        path: result.path,
      });
    } catch (error) {
      console.error("Failed to open note:", error);
    }
    try {
      await getCurrentWindow().close();
    } catch {
      await invoke("hide_window");
    }
  }, []);

  const handleDeleteNote = async (note: SearchResult) => {
    try {
      await invoke("delete_note", { path: note.path });
      setConfirmDelete(null);
      // Re-run search to refresh results
      if (query.trim()) {
        const searchResults = await invoke<SearchResult[]>("search_notes", {
          query: query.trim(),
        });
        setResults(searchResults);
        setSelectedIndex(Math.min(selectedIndex, searchResults.length - 1));
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
      alert(error);
    }
  };

  const handleMoveNote = async (note: SearchResult, targetFolder: string) => {
    if (targetFolder === note.folder) {
      setShowMoveModal(null);
      return;
    }

    try {
      await invoke("move_note", { path: note.path, targetFolder });
      setShowMoveModal(null);
      setMoveFolderIndex(0);
      // Re-run search to refresh results
      if (query.trim()) {
        const searchResults = await invoke<SearchResult[]>("search_notes", {
          query: query.trim(),
        });
        setResults(searchResults);
        setSelectedIndex(Math.min(selectedIndex, searchResults.length - 1));
      }
    } catch (error) {
      console.error("Failed to move note:", error);
      alert(error);
    }
  };

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

  // Highlight matching text in snippet
  const highlightSnippet = (snippet: string, searchQuery: string) => {
    if (!searchQuery.trim()) return snippet;

    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = snippet.split(new RegExp(`(${escaped})`, 'gi'));

    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="bg-coral/30 text-coral font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  // Render delete confirmation overlay
  if (confirmDelete) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-2xl mb-3">🗑️</div>
          <h2 className="text-sm font-semibold text-ink mb-2">Delete note?</h2>
          <p className="text-[12px] text-stone text-center mb-1">
            From: {confirmDelete.folder}
          </p>
          <p className="text-[11px] text-stone/70 text-center mb-4 max-w-[300px] truncate">
            {confirmDelete.snippet}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 text-[12px] bg-line hover:bg-line/70 text-ink rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDeleteNote(confirmDelete)}
              className="px-4 py-2 text-[12px] bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center px-4 py-2 border-t border-line text-[10px] text-stone">
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">esc</kbd>
          <span className="ml-1">cancel</span>
          <span className="mx-2">·</span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">enter</kbd>
          <span className="ml-1">confirm</span>
        </div>
      </div>
    );
  }

  // Render move folder picker overlay
  if (showMoveModal) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">Move note to folder</h2>
          <p className="text-[11px] text-stone mt-1 truncate">
            {showMoveModal.snippet.slice(0, 50)}...
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {folders.map((folder, i) => {
            const isCurrent = folder === showMoveModal.folder;
            const isSelected = i === moveFolderIndex;

            return (
              <button
                key={folder}
                onClick={() => handleMoveNote(showMoveModal, folder)}
                onMouseEnter={() => setMoveFolderIndex(i)}
                disabled={isCurrent}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-all ${
                  isSelected && !isCurrent
                    ? "bg-coral text-white"
                    : isCurrent
                    ? "bg-line/30 text-stone cursor-not-allowed"
                    : "hover:bg-line/50 text-ink"
                }`}
              >
                <span
                  className={`text-[10px] ${
                    isSelected && !isCurrent ? "text-white/80" : isCurrent ? "text-stone/50" : "text-coral"
                  }`}
                >
                  {isCurrent ? "●" : "○"}
                </span>
                <span className="flex-1 text-[13px] font-medium">{folder}</span>
                {isCurrent && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-line rounded text-stone">
                    current
                  </span>
                )}
                {isSelected && !isCurrent && (
                  <kbd className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded text-white/90 font-mono">
                    enter
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-line text-[10px] text-stone">
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">esc</kbd> cancel
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
      {/* Header with search input */}
      <div
        onMouseDown={startDrag}
        className="px-4 py-3 border-b border-line drag-handle"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-coral"
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all notes..."
            className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-stone outline-none"
          />
          {isSearching && (
            <span className="text-stone text-sm animate-pulse">...</span>
          )}
        </div>
      </div>

      {/* Results */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto">
        {results.length === 0 && query.trim() && !isSearching ? (
          <div className="p-4 text-center text-stone text-sm">
            No notes found for "{query}"
          </div>
        ) : (
          results.map((result, index) => (
            <button
              key={result.path}
              onClick={() => handleSelectResult(result)}
              className={`w-full px-4 py-3 text-left border-b border-line/50 transition-colors ${
                index === selectedIndex
                  ? "bg-coral/10"
                  : "hover:bg-line/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    result.folder === "Inbox"
                      ? "bg-line text-stone"
                      : "bg-coral-light text-coral"
                  }`}
                >
                  {result.folder}
                </span>
                <span className="text-[10px] text-stone font-mono">
                  {result.created}
                </span>
              </div>
              <p className="text-[13px] text-ink leading-relaxed">
                {highlightSnippet(result.snippet, query)}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between px-4 py-2 border-t border-line text-[10px] text-stone drag-handle"
      >
        <div className="flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">↵</kbd> open
          </span>
          {results.length > 0 && (
            <>
              <span>
                <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">⌫</kbd> delete
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">⌘M</kbd> move
              </span>
            </>
          )}
        </div>
        <span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">esc</kbd> close
        </span>
      </div>
    </div>
  );
}
