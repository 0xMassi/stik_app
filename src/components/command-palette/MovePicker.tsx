import { useState, useEffect, useRef } from "react";
import type { SearchResult } from "@/types";
import { getFolderColor } from "@/utils/folderColors";
import { useTranslation } from "@/hooks/useTranslation";
import Dialog from "../ui/Dialog";

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
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = folders.findIndex((f) => f !== note.folder);
    return idx >= 0 ? idx : 0;
  });
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, folders.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const target = folders[selectedIndex];
        if (!target || target === note.folder) return;
        e.preventDefault();
        e.stopPropagation();
        onMove(target);
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [folders, selectedIndex, note.folder, onMove]);

  useEffect(() => {
    selectedRef.current?.focus();
  }, [selectedIndex]);

  return (
    <Dialog
      title={t("palette.moveNoteToFolder")}
      description={`${note.snippet?.slice(0, 50)}...`}
      onClose={onCancel}
      initialFocusRef={selectedRef}
      backdropClassName="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      panelClassName="bg-bg rounded-xl border border-line shadow-stik w-[min(90vw,320px)] flex flex-col overflow-hidden max-h-[70vh]"
      titleClassName="px-4 pt-3 text-sm font-semibold text-ink"
      descriptionClassName="truncate border-b border-line px-4 pb-3 pt-1 text-[11px] text-stone"
    >
        <div className="flex-1 overflow-y-auto py-1">
          {folders.map((folder, i) => {
            const isCurrent = folder === note.folder;
            const isSelected = i === selectedIndex;

            return (
              <button
                key={folder}
                ref={isSelected && !isCurrent ? selectedRef : undefined}
                type="button"
                onClick={() => onMove(folder)}
                onMouseEnter={() => setSelectedIndex(i)}
                disabled={isCurrent}
                aria-current={isCurrent ? "true" : undefined}
                className={`w-full min-h-8 px-4 py-2.5 flex items-center gap-3 text-left transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coral ${
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
                    {t("common.current")}
                  </span>
                )}
                {isSelected && !isCurrent && (
                  <kbd className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded text-white/90 font-mono">
                    {t("common.enter")}
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
            
            {t("palette.navigate")}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px]">
              {t("common.esc")}
            </kbd>{" "}
            
            {t("common.cancelLower")}
          </span>
        </div>
    </Dialog>
  );
}
