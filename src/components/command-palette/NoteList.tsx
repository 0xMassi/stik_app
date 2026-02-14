import type { SearchResult, SemanticResult } from "@/types";
import { formatRelativeDate } from "@/utils/formatRelativeDate";
import { normalizeNoteTitle, normalizeNoteSnippet } from "@/utils/notePresentation";
import { getFolderColor } from "@/utils/folderColors";

interface NoteListProps {
  results: SearchResult[];
  semanticResults: SemanticResult[];
  selectedIndex: number;
  query: string;
  isSearching: boolean;
  folderColors: Record<string, string>;
  focused: boolean;
  resultsRef: React.RefObject<HTMLDivElement | null>;
  onSelectResult: (result: SearchResult) => void;
  onSetSelectedIndex: (index: number) => void;
  isCreatingNote: boolean;
  newNoteTitle: string;
  onSetNewNoteTitle: (title: string) => void;
  onCreateNote: () => void;
  onCancelCreateNote: () => void;
  selectedFolder: string | null;
  folders: string[];
}

function highlightSnippet(snippet: string, searchQuery: string) {
  if (!searchQuery.trim()) return snippet;
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = snippet.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="bg-coral/30 text-coral font-medium">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function NoteList({
  results,
  semanticResults,
  selectedIndex,
  query,
  isSearching,
  folderColors,
  focused,
  resultsRef,
  onSelectResult,
  onSetSelectedIndex,
  isCreatingNote,
  newNoteTitle,
  onSetNewNoteTitle,
  onCreateNote,
  onCancelCreateNote,
  selectedFolder,
  folders,
}: NoteListProps) {
  const hasQuery = query.trim().length > 0;

  if (
    results.length === 0 &&
    semanticResults.length === 0 &&
    hasQuery &&
    !isSearching
  ) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <span className="text-stone text-sm">No notes found for "{query}"</span>
      </div>
    );
  }

  const targetFolder = selectedFolder || folders[0] || "";

  return (
    <div ref={resultsRef} className="flex-1 overflow-y-auto">
      {/* Inline create-note input */}
      {isCreatingNote && (
        <div className="px-4 py-3 border-b border-coral/30 bg-coral/5">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-coral shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            <input
              type="text"
              value={newNoteTitle}
              onChange={(e) => onSetNewNoteTitle(e.target.value)}
              placeholder="Note title..."
              autoFocus
              className="flex-1 text-[14px] font-medium bg-transparent text-ink placeholder:text-stone outline-none"
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCreateNote();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelCreateNote();
                }
              }}
            />
          </div>
          <div className="mt-1 ml-6 text-[10px] text-stone">
            in <span className="text-coral font-medium">{targetFolder}</span> — enter to create, esc to cancel
          </div>
        </div>
      )}

      {/* Section header */}
      {!hasQuery && results.length > 0 && (
        <div className="px-4 py-2 border-b border-line/50 bg-line/20">
          <span className="text-[10px] font-semibold text-stone uppercase tracking-wider">
            Recent
          </span>
        </div>
      )}

      {results.map((result, index) => {
        const displayTitle = normalizeNoteTitle(
          result.title || result.filename || "Untitled"
        );
        const displaySnippet = normalizeNoteSnippet(result.snippet);
        const shouldShowSnippet =
          hasQuery &&
          displaySnippet.length > 0 &&
          displaySnippet !== displayTitle;
        const color = getFolderColor(result.folder, folderColors);
        const isSelected = index === selectedIndex && focused;

        return (
          <button
            key={result.path}
            onClick={() => onSelectResult(result)}
            onMouseEnter={() => onSetSelectedIndex(index)}
            className={`w-full px-4 py-3 text-left border-b border-line/50 transition-colors ${
              isSelected ? "bg-coral/10" : "hover:bg-line/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[14px] font-medium text-ink leading-relaxed truncate">
                {displayTitle}
              </p>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${color.badgeBg} ${color.badgeText}`}
              >
                {result.folder}
              </span>
            </div>
            <span className="text-[10px] text-stone font-mono">
              {formatRelativeDate(result.created)}
            </span>
            {shouldShowSnippet && (
              <p className="text-[12px] text-stone leading-relaxed mt-0.5">
                {highlightSnippet(displaySnippet, query)}
              </p>
            )}
          </button>
        );
      })}

      {/* Semantic "Related" section */}
      {semanticResults.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-line/50 bg-line/20">
            <span className="text-[10px] font-semibold text-stone uppercase tracking-wider">
              Related
            </span>
          </div>
          {semanticResults.map((result, index) => {
            const globalIndex = results.length + index;
            const displayTitle = normalizeNoteTitle(
              result.title || result.filename || "Untitled"
            );
            const displaySnippet = normalizeNoteSnippet(result.snippet);
            const shouldShowSnippet =
              hasQuery &&
              displaySnippet.length > 0 &&
              displaySnippet !== displayTitle;
            const color = getFolderColor(result.folder, folderColors);
            const isSelected = globalIndex === selectedIndex && focused;

            return (
              <button
                key={result.path}
                onClick={() => onSelectResult(result)}
                onMouseEnter={() => onSetSelectedIndex(globalIndex)}
                className={`w-full px-4 py-3 text-left border-b border-line/50 transition-colors ${
                  isSelected ? "bg-coral/10" : "hover:bg-line/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[14px] font-medium text-ink leading-relaxed truncate">
                    {displayTitle}
                  </p>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${color.badgeBg} ${color.badgeText}`}
                  >
                    {result.folder}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-stone font-mono">
                    {formatRelativeDate(result.created)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-coral/10 text-coral">
                    {Math.round(result.similarity * 100)}% match
                  </span>
                </div>
                {shouldShowSnippet && (
                  <p className="text-[12px] text-stone leading-relaxed mt-0.5">
                    {displaySnippet.length > 100
                      ? `${displaySnippet.slice(0, 100)}...`
                      : displaySnippet}
                  </p>
                )}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
