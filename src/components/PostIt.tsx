import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import Editor, { type EditorRef } from "./Editor";
import FolderPicker from "./FolderPicker";

interface PostItProps {
  folder: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
  onFolderChange: (folder: string) => void;
  onOpenSettings?: () => void;
  isSticked?: boolean;
  stickedId?: string;
  initialContent?: string;
}

export default function PostIt({
  folder,
  onSave,
  onClose,
  onFolderChange,
  onOpenSettings,
  isSticked = false,
  stickedId,
  initialContent = "",
}: PostItProps) {
  const [content, setContent] = useState(initialContent);
  const [showPicker, setShowPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isPinned, setIsPinned] = useState(isSticked);
  const editorRef = useRef<EditorRef | null>(null);

  // Sync content state with initialContent (for sticked notes)
  useEffect(() => {
    if (initialContent && !content) {
      setContent(initialContent);
    }
  }, [initialContent]);

  // Focus editor on mount and when folder changes
  useEffect(() => {
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [folder]);

  // Handle escape to save and close (for capture mode and unpinned sticked notes)
  useEffect(() => {
    // Allow escape for capture mode OR unpinned sticked notes
    if (isSticked && isPinned) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showPicker && !isSaving && !isPinning) {
        if (isSticked && !isPinned) {
          // Unpinned sticked note - save and close
          handleSaveAndCloseSticked();
        } else {
          // Normal capture mode
          handleSaveAndClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, showPicker, isSaving, isPinning, isSticked, isPinned]);

  const handleSaveAndClose = useCallback(async () => {
    if (content.trim()) {
      setIsSaving(true);
      await onSave(content);
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

  // Pin from capture mode
  const handlePin = useCallback(async () => {
    if (isPinning || !content.trim()) return;

    setIsPinning(true);
    try {
      await invoke("pin_capture_note", {
        content,
        folder,
      });
      setContent("");
      editorRef.current?.clear();
    } catch (error) {
      console.error("Failed to pin note:", error);
    } finally {
      setIsPinning(false);
    }
  }, [content, folder, isPinning]);

  // Toggle pin state for sticked notes
  const handleTogglePin = useCallback(async () => {
    if (!stickedId) return;

    if (isPinned) {
      // Unpin: remove from persistence but keep window open
      try {
        await invoke("close_sticked_note", {
          id: stickedId,
          saveToFolder: false,
        });
        setIsPinned(false);
      } catch (error) {
        console.error("Failed to unpin note:", error);
      }
    } else {
      // Re-pin: create new sticked note entry
      try {
        const window = getCurrentWindow();
        const position = await window.outerPosition();

        await invoke("create_sticked_note", {
          content,
          folder,
          position: [position.x, position.y],
        });
        setIsPinned(true);
      } catch (error) {
        console.error("Failed to re-pin note:", error);
      }
    }
  }, [stickedId, isPinned, content, folder]);

  // Save & Close sticked note (saves content to folder file)
  const handleSaveAndCloseSticked = useCallback(async () => {
    if (!stickedId) return;

    // Only show save animation if there's content
    if (content.trim()) {
      setIsSaving(true);
      try {
        // If still pinned, close from sticked notes
        if (isPinned) {
          await invoke("close_sticked_note", {
            id: stickedId,
            saveToFolder: true,
          });
        } else {
          // If unpinned, just save to folder directly
          await invoke("save_note", {
            folder,
            content,
          });
        }
        // Wait for save animation before closing
        setTimeout(async () => {
          await invoke("close_sticked_window", { id: stickedId });
        }, 600);
      } catch (error) {
        console.error("Failed to save and close sticked note:", error);
        setIsSaving(false);
      }
    } else {
      // No content, just close without animation
      try {
        if (isPinned) {
          await invoke("close_sticked_note", {
            id: stickedId,
            saveToFolder: false,
          });
        }
        await invoke("close_sticked_window", { id: stickedId });
      } catch (error) {
        console.error("Failed to close sticked note:", error);
      }
    }
  }, [stickedId, isPinned, content, folder]);

  // Close without saving
  const handleCloseWithoutSaving = useCallback(async () => {
    if (!stickedId) return;

    try {
      if (isPinned) {
        await invoke("close_sticked_note", {
          id: stickedId,
          saveToFolder: false,
        });
      }
      await invoke("close_sticked_window", { id: stickedId });
    } catch (error) {
      console.error("Failed to close sticked note:", error);
    }
  }, [stickedId, isPinned]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);

    // Check for folder picker trigger (only in capture mode)
    if (!isSticked) {
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
    }
  }, [isSticked]);

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
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start drag:", err);
    }
  }, []);

  // Save position when dragging ends (for sticked notes that are pinned)
  useEffect(() => {
    if (!isSticked || !stickedId || !isPinned) return;

    const savePosition = async () => {
      try {
        const window = getCurrentWindow();
        const position = await window.outerPosition();
        const size = await window.outerSize();
        await invoke("update_sticked_note", {
          id: stickedId,
          content,
          folder: null,
          position: [position.x, position.y],
          size: [size.width, size.height],
        });
      } catch (error) {
        console.error("Failed to save position:", error);
      }
    };

    let timeout: ReturnType<typeof setTimeout>;
    const handleMove = () => {
      clearTimeout(timeout);
      timeout = setTimeout(savePosition, 500);
    };

    window.addEventListener("mouseup", handleMove);
    return () => {
      window.removeEventListener("mouseup", handleMove);
      clearTimeout(timeout);
    };
  }, [isSticked, stickedId, isPinned, content]);

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
    <div
      className={`w-full h-full bg-bg rounded-[14px] overflow-hidden flex flex-col ${
        isSticked && isPinned ? "sticked-note" : ""
      }`}
    >
      {/* Header - draggable */}
      <div
        onMouseDown={startDrag}
        className={`flex items-center justify-between px-4 py-2.5 border-b border-line drag-handle ${
          isSticked && isPinned ? "sticked-header" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Pin button */}
          {!isSticked ? (
            // Capture mode: pin to create sticked note
            <button
              onClick={handlePin}
              disabled={!content.trim() || isPinning}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                content.trim()
                  ? "hover:bg-coral-light text-coral hover:text-coral"
                  : "text-stone/50 cursor-not-allowed"
              }`}
              title="Pin to screen"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
            </button>
          ) : (
            // Sticked mode: toggle pin state
            <button
              onClick={handleTogglePin}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                isPinned
                  ? "text-coral hover:bg-coral-light"
                  : "text-stone hover:bg-line hover:text-coral"
              }`}
              title={isPinned ? "Unpin (won't restore on restart)" : "Pin (will restore on restart)"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isPinned ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="17" x2="12" y2="22" />
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
              </svg>
            </button>
          )}

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
        </div>

        <div className="flex items-center gap-3 text-[10px] text-stone">
          {isSticked && isPinned ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCloseWithoutSaving}
                className="px-2 py-1 rounded-md hover:bg-line text-stone hover:text-ink transition-colors text-[10px]"
                title="Close without saving"
              >
                Close
              </button>
              <button
                onClick={handleSaveAndCloseSticked}
                className="px-2.5 py-1 rounded-md bg-coral text-white hover:bg-coral/90 transition-colors text-[10px] font-medium"
                title="Save to folder and close"
              >
                Save
              </button>
            </div>
          ) : (
            <kbd className="px-2 py-1 bg-coral-light text-coral rounded text-[10px] font-semibold">
              esc
            </kbd>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <Editor
          ref={editorRef}
          content={content}
          onChange={handleContentChange}
          placeholder={isSticked ? "Sticked note..." : "Type a thought..."}
          initialContent={initialContent}
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
          <span className="text-coral">~</span>/Stik/
          <span className="text-coral">{folder}</span>/
        </span>
        <div className="flex items-center gap-2">
          {isSticked && !isPinned ? (
            <span className="text-stone">
              <span className="text-amber-500">○</span> unpinned
            </span>
          ) : (
            <span className="text-stone">
              <span className="text-coral">✦</span> markdown supported
            </span>
          )}
          {onOpenSettings && !isSticked && (
            <button
              onClick={onOpenSettings}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-line text-stone hover:text-ink transition-colors"
              title="Settings (⌘⇧,)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
