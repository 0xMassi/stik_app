import { useState, useEffect } from "react";
import type { SearchResult } from "@/types";
import { getFolderColor } from "@/utils/folderColors";

interface MovePickerProps {
  note: SearchResult;
  folders: string[];
  folderColors: Record<string, string>;
  onMove: (targetFolder: string) => void;
  onCancel: () => void;
}

export default function MovePicker({
  note,
  folders,
  folderColors,
  onMove,
  onCancel,
}: MovePickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = folders.findIndex((f) => f !== note.folder);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, folders.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onMove(folders[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [folders, selectedIndex, onMove, onCancel]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-bg rounded-xl border border-line shadow-stik w-[min(90vw,320px)] flex flex-col overflow-hidden max-h-[70vh]">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">
            Move note to folder
          </h2>
          <p className="text-[11px] text-stone mt-1 truncate">
            {note.snippet?.slice(0, 50)}...
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {folders.map((folder, i) => {
            const isCurrent = folder === note.folder;
            const isSelected = i === selectedIndex;

            return (
              <button
                key={folder}
                onClick={() => onMove(folder)}
                onMouseEnter={() => setSelectedIndex(i)}
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
                  className="text-[10px]"
                  style={{
                    color:
                      isSelected && !isCurrent
                        ? "rgba(255,255,255,0.8)"
                        : isCurrent
                          ? undefined
                          : getFolderColor(folder, folderColors).dot,
                  }}
                >
                  {isCurrent ? (
                    <span className="text-stone/50">●</span>
                  ) : (
                    "○"
                  )}
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
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              esc
            </kbd>{" "}
            cancel
          </span>
        </div>
      </div>
    </div>
  );
}
