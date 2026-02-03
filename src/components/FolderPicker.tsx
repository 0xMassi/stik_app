import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FolderPickerProps {
  query: string;
  onSelect: (folder: string) => void;
  onClose: () => void;
}

export default function FolderPicker({
  query,
  onSelect,
  onClose,
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
    <div className="absolute top-2 left-3 right-3 bg-surface rounded-[10px] shadow-lg border border-line overflow-hidden z-10">
      <div className="px-3 py-2 border-b border-line">
        <span className="text-[10px] font-semibold text-stone uppercase tracking-wider">
          Select folder
        </span>
      </div>

      {filteredFolders.length > 0 ? (
        <div className="max-h-[160px] overflow-y-auto">
          {filteredFolders.slice(0, 6).map((folder, i) => (
            <button
              key={folder}
              onClick={() => onSelect(folder)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                i === selectedIndex ? "bg-coral-light" : "hover:bg-line/50"
              }`}
            >
              <span className="text-[11px]">📁</span>
              <span className="flex-1 text-[13px] text-ink">{folder}</span>
              {i === selectedIndex && (
                <span className="text-[10px] text-stone">↵</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="px-3 py-3 text-center text-[12px] text-stone">
          No matching folders
        </div>
      )}
    </div>
  );
}
