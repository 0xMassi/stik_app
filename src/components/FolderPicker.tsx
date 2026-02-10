import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getFolderColor } from "@/utils/folderColors";

interface FolderPickerProps {
  query: string;
  onSelect: (folder: string) => void;
  onClose: () => void;
  folderColors?: Record<string, string>;
}

export default function FolderPicker({
  query,
  onSelect,
  onClose,
  folderColors = {},
}: FolderPickerProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load folders on mount
  useEffect(() => {
    invoke<string[]>("list_folders").then(setFolders);
  }, []);

  // Filter folders based on query
  const filteredFolders = folders.filter((f) =>
    f.toLowerCase().includes(query.toLowerCase())
  );

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredFolders.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFolders.length > 0) {
            onSelect(filteredFolders[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFolders, selectedIndex, onSelect, onClose]);

  return (
    <div className="absolute top-2 left-3 right-3 bg-bg rounded-[10px] shadow-stik border border-line/50 overflow-hidden z-10">
      {filteredFolders.length > 0 ? (
        <div className="py-1">
          {filteredFolders.slice(0, 5).map((folder, i) => (
            <button
              key={folder}
              onClick={() => onSelect(folder)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full px-3 py-2 flex items-center gap-2.5 text-left transition-all ${
                i === selectedIndex
                  ? "bg-coral text-white"
                  : "hover:bg-line/50 text-ink"
              }`}
            >
              <span
                className="text-[10px]"
                style={{ color: i === selectedIndex ? "rgba(255,255,255,0.8)" : getFolderColor(folder, folderColors).dot }}
              >
                ●
              </span>
              <span className="flex-1 text-[13px] font-medium">{folder}</span>
              {i === selectedIndex && (
                <kbd className="text-[9px] px-1.5 py-0.5 bg-white/20 rounded text-white/90 font-mono">
                  enter
                </kbd>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 text-center text-[12px] text-stone">
          No folders found
        </div>
      )}
    </div>
  );
}
