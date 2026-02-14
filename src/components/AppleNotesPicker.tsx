import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppleNoteEntry, StikSettings } from "@/types";
import { formatRelativeDate } from "@/utils/formatRelativeDate";

export default function AppleNotesPicker() {
  const [notes, setNotes] = useState<AppleNoteEntry[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<AppleNoteEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [targetFolder, setTargetFolder] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Load notes + resolve target folder on mount
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const [result, settings] = await Promise.all([
          invoke<AppleNoteEntry[]>("list_apple_notes"),
          invoke<StikSettings>("get_settings"),
        ]);
        setNotes(result);
        setFilteredNotes(result);
        setTargetFolder(settings.default_folder || "");
      } catch (err) {
        const msg = String(err);
        if (msg.startsWith("FULL_DISK_ACCESS_REQUIRED")) {
          setNeedsPermission(true);
        } else {
          setError(msg);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Filter notes when query changes
  useEffect(() => {
    if (!query.trim()) {
      setFilteredNotes(notes);
      setSelectedIndex(0);
      return;
    }

    const lower = query.toLowerCase();
    const filtered = notes.filter(
      (n) =>
        n.title.toLowerCase().includes(lower) ||
        n.folder_name.toLowerCase().includes(lower) ||
        n.snippet.toLowerCase().includes(lower)
    );
    setFilteredNotes(filtered);
    setSelectedIndex(0);
  }, [query, notes]);

  // Import selected note (convert to markdown + save as Stik note)
  const handleImport = useCallback(
    async (note: AppleNoteEntry) => {
      if (isImporting) return;

      setIsImporting(true);
      try {
        const markdown = await invoke<string>(
          "import_apple_note",
          { noteId: note.note_id }
        );

        const result = await invoke<{ path: string; folder: string; filename: string }>(
          "save_note",
          { folder: targetFolder, content: markdown }
        );

        // Hide the PostIt capture window before opening the viewing window,
        // because open_note_for_viewing steals focus and the picker's
        // blur handler will kill our JS context before we can emit events.
        await invoke("hide_postit");

        // Open the saved note for viewing
        await invoke("open_note_for_viewing", {
          content: markdown,
          folder: result.folder,
          path: result.path,
        });

        await getCurrentWindow().close();
      } catch (err) {
        setError(String(err));
        setIsImporting(false);
      }
    },
    [isImporting, targetFolder]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        await getCurrentWindow().close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredNotes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filteredNotes.length > 0) {
        e.preventDefault();
        handleImport(filteredNotes[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredNotes, selectedIndex, handleImport]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const items =
        resultsRef.current.querySelectorAll<HTMLElement>("button");
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

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

  // Permission guidance UI
  if (needsPermission) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col items-center justify-center p-8">
        <div className="text-4xl mb-4">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-coral mx-auto">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-ink mb-2">
          Full Disk Access Required
        </h2>
        <p className="text-[12px] text-stone text-center mb-4 max-w-[340px] leading-relaxed">
          Stik needs Full Disk Access to read your Apple Notes database.
          Click below to open System Settings, then press <strong className="text-ink">+</strong> and add Stik from your Applications folder.
        </p>
        <button
          onClick={() => invoke("open_full_disk_access_settings")}
          className="px-4 py-2.5 bg-coral text-white text-[12px] font-semibold rounded-lg hover:bg-coral/90 transition-colors mb-3"
        >
          Open System Settings
        </button>
        <p className="text-[10px] text-stone text-center max-w-[300px] leading-relaxed">
          After adding Stik and enabling the toggle, restart the app
        </p>
        <button
          onClick={async () => await getCurrentWindow().close()}
          className="mt-4 px-3 py-1.5 text-[11px] text-stone hover:text-ink transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col items-center justify-center p-6">
        <div className="text-coral text-sm font-medium mb-2">
          Failed to load Apple Notes
        </div>
        <div className="text-stone text-xs text-center max-w-[280px] mb-4">
          {error}
        </div>
        <button
          onClick={async () => await getCurrentWindow().close()}
          className="px-4 py-2 text-xs bg-line hover:bg-line/70 text-ink rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
      {/* Header with search */}
      <div
        onMouseDown={startDrag}
        className="px-4 py-3 border-b border-line drag-handle"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-coral flex-shrink-0"
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
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Apple Notes..."
            className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-stone outline-none"
          />
          {isLoading && (
            <span className="text-stone text-sm animate-pulse">...</span>
          )}
        </div>
      </div>

      {/* Results */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-stone text-sm">
            Loading Apple Notes...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="p-4 text-center text-stone text-sm">
            {query.trim()
              ? `No notes matching "${query}"`
              : "No notes found in Apple Notes"}
          </div>
        ) : (
          filteredNotes.map((note, index) => (
            <button
              key={note.note_id}
              onClick={() => handleImport(note)}
              onMouseEnter={() => setSelectedIndex(index)}
              disabled={isImporting}
              className={`w-full px-4 py-3 text-left border-b border-line/50 transition-colors ${
                index === selectedIndex
                  ? "bg-coral/10"
                  : "hover:bg-line/30"
              } ${isImporting ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-coral-light text-coral">
                  {note.folder_name}
                </span>
                <span className="text-[10px] text-stone font-mono">
                  {formatRelativeDate(note.modified_date)}
                </span>
                {note.account_name !== "Local" && (
                  <span className="text-[9px] text-stone/60">
                    {note.account_name}
                  </span>
                )}
              </div>
              <p className="text-[14px] font-medium text-ink leading-relaxed truncate">
                {note.title || "Untitled"}
              </p>
              {note.snippet && (
                <p className="text-[12px] text-stone leading-relaxed mt-0.5 truncate">
                  {note.snippet}
                </p>
              )}
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
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              ↵
            </kbd>{" "}
            import
          </span>
        </div>
        <span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">esc</kbd>{" "}
          close
        </span>
      </div>
    </div>
  );
}
