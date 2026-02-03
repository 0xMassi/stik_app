import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Editor, { type EditorRef } from "./Editor";
import FolderPicker from "./FolderPicker";

interface PostItProps {
  folder: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  onFolderChange: (folder: string) => void;
}

export default function PostIt({
  folder,
  onSave,
  onClose,
  onFolderChange,
}: PostItProps) {
  const [content, setContent] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<EditorRef | null>(null);

  // Focus editor on mount and when folder changes
  useEffect(() => {
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [folder]);

  // Handle escape to save and close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showPicker && !isSaving) {
        handleSaveAndClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, showPicker, isSaving]);

  const handleSaveAndClose = useCallback(async () => {
    if (content.trim()) {
      setIsSaving(true);
      await onSave(content);
      // Show save animation briefly, then hide window
      setTimeout(async () => {
        setIsSaving(false);
        setContent("");
        editorRef.current?.clear();
        await onClose();
      }, 600);
    } else {
      await onClose();
    }
  }, [content, onSave, onClose]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    // Check for folder picker trigger
    if (newContent === "/") {
      setShowPicker(true);
    } else if (
      newContent.startsWith("/") &&
      !newContent.includes(" ") &&
      newContent.length < 15
    ) {
      setShowPicker(true);
    } else {
      setShowPicker(false);
    }
  }, []);

  const handleFolderSelect = useCallback(
    (selectedFolder: string) => {
      onFolderChange(selectedFolder);
      setShowPicker(false);
      setContent("");
      editorRef.current?.clear();
      editorRef.current?.focus();
    },
    [onFolderChange]
  );

  const startDrag = useCallback(async (e: React.MouseEvent) => {
    // Only start drag if clicking directly on the drag handle (not on buttons)
    if ((e.target as HTMLElement).closest('button')) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error('Failed to start drag:', err);
    }
  }, []);

  // Show save animation
  if (isSaving) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg rounded-[14px]">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="save-checkmark"
            viewBox="0 0 52 52"
            width="40"
            height="40"
          >
            <circle
              className="save-circle"
              cx="26"
              cy="26"
              r="24"
              fill="none"
              stroke="#E8705F"
              strokeWidth="3"
            />
            <path
              className="save-check"
              fill="none"
              stroke="#E8705F"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 26l7 7 15-15"
            />
          </svg>
          <p className="save-text text-coral font-semibold text-sm">Saved</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-bg rounded-[14px] overflow-hidden flex flex-col">
      {/* Header - draggable */}
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between px-4 py-2.5 border-b border-line drag-handle"
      >
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold transition-colors hover:opacity-80 ${
            folder === "Inbox"
              ? "bg-line text-stone"
              : "bg-coral-light text-coral"
          }`}
        >
          <span className="text-[8px] text-coral">●</span>
          <span>{folder}</span>
          <span className="text-[8px] opacity-50">▼</span>
        </button>

        <div className="text-[10px] text-stone">
          <kbd className="px-1.5 py-0.5 bg-coral-light text-coral rounded text-[9px] font-semibold">esc</kbd>{" "}
          <span className="text-stone">{content.trim() ? "save" : "close"}</span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          ref={editorRef}
          content={content}
          onChange={handleContentChange}
          placeholder="Type a thought..."
        />

        {/* Folder Picker */}
        {showPicker && (
          <FolderPicker
            query={content.startsWith("/") ? content.slice(1) : ""}
            onSelect={handleFolderSelect}
            onClose={() => {
              setShowPicker(false);
              editorRef.current?.focus();
            }}
          />
        )}
      </div>

      {/* Footer - draggable */}
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between px-4 py-2 border-t border-line text-[10px] drag-handle"
      >
        <span className="font-mono text-stone">
          <span className="text-coral">~</span>/Stik/<span className="text-coral">{folder}</span>/
        </span>
        <span className="text-stone">
          <span className="text-coral">✦</span> markdown supported
        </span>
      </div>
    </div>
  );
}
