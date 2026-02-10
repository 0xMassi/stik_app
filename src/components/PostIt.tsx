import { useState, useEffect, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import Editor, { type EditorRef } from "./Editor";
import FolderPicker from "./FolderPicker";
import type { StickedNote, StikSettings } from "@/types";
import type { VimMode } from "@/extensions/vim-mode";
import {
  isMarkdownEffectivelyEmpty,
  normalizeMarkdownForCopy,
  normalizeMarkdownForState,
} from "@/utils/normalizeMarkdownForCopy";
import {
  resolveImagePaths,
  unresolveImagePaths,
} from "@/utils/imageMarkdownPaths";
import { normalizeImageLinksForMarkdown } from "@/utils/isImageUrl";
import { resolveCaptureFolder } from "@/utils/folderSelection";
import { getFolderColor } from "@/utils/folderColors";

interface PostItProps {
  folder: string;
  onSave: (content: string, preferredFolder?: string) => Promise<void>;
  onClose: () => void;
  onFolderChange: (folder: string) => void;
  onOpenSettings?: () => void;
  onContentChange?: (content: string) => void;
  isSticked?: boolean;
  stickedId?: string;
  initialContent?: string;
  isViewing?: boolean;
  originalPath?: string; // For viewing notes - the original file path to update
}

function fallbackHtmlFromPlainText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<pre>${escaped}</pre>`;
}

type CopyMode = "markdown" | "rich" | "image";

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDone, 200);
    }, 1800);
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

export default function PostIt({
  folder,
  onSave,
  onClose,
  onFolderChange,
  onOpenSettings,
  onContentChange,
  isSticked = false,
  stickedId,
  initialContent = "",
  isViewing = false,
  originalPath,
}: PostItProps) {
  const [content, setContent] = useState(() => normalizeMarkdownForState(initialContent));
  const [showPicker, setShowPicker] = useState(false);
  const [suggestedFolder, setSuggestedFolder] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyMode, setCopyMode] = useState<CopyMode | null>(null);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Viewing mode starts unpinned, regular sticked notes start pinned
  const [isPinned, setIsPinned] = useState(isSticked && !isViewing);
  // Track the actual sticked note ID (can change when pinning a viewing note)
  const [currentStickedId, setCurrentStickedId] = useState(stickedId);
  const [vimEnabled, setVimEnabled] = useState<boolean | null>(null); // null = loading
  const [folderColors, setFolderColors] = useState<Record<string, string>>({});
  const [vimMode, setVimMode] = useState<VimMode>("normal");
  const [vimCommand, setVimCommand] = useState("");
  const [vimCommandError, setVimCommandError] = useState("");
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<EditorRef | null>(null);
  const copyMenuRef = useRef<HTMLDivElement | null>(null);

  // Resolve the notes directory path for image path resolution
  const [notesDir, setNotesDir] = useState<string | null>(null);
  useEffect(() => {
    invoke<string>("get_notes_directory").then(setNotesDir).catch(() => {});
  }, []);

  const resolveFolderForAction = useCallback(async (): Promise<string> => {
    const folders = await invoke<string[]>("list_folders");
    const settings = await invoke<StikSettings>("get_settings");
    const resolved = resolveCaptureFolder({
      requestedFolder: folder.trim(),
      defaultFolder: settings.default_folder?.trim(),
      availableFolders: folders,
    });

    if (resolved && resolved !== folder) {
      onFolderChange(resolved);
    }

    return resolved;
  }, [folder, onFolderChange]);

  // Resolve image paths for display when loading content with existing images
  const baseInitialContent = normalizeMarkdownForState(
    normalizeImageLinksForMarkdown(initialContent)
  );
  const resolvedInitialContent = notesDir && baseInitialContent
    ? resolveImagePaths(baseInitialContent, `${notesDir}/${folder}`, convertFileSrc)
    : baseInitialContent;
  const hasResolvableAssetImages =
    /(?:\]\(\.assets\/|src=["']\.assets\/|asset:\/\/localhost\/|asset\.localhost\/|file:\/\/\/)/.test(
      baseInitialContent
    );
  const shouldWaitForNotesDir = hasResolvableAssetImages && !notesDir;

  // Sync content state with initialContent (for sticked notes)
  useEffect(() => {
    if (baseInitialContent && !content) {
      setContent(baseInitialContent);
    }
  }, [baseInitialContent]);

  // Fetch vim mode + folder colors on mount + listen for changes
  useEffect(() => {
    invoke<StikSettings>("get_settings")
      .then((s) => {
        setVimEnabled(s.vim_mode_enabled);
        setFolderColors(s.folder_colors ?? {});
      })
      .catch(() => {});

    const unlisten = listen<StikSettings>("settings-changed", (event) => {
      setVimEnabled(event.payload.vim_mode_enabled);
      setFolderColors(event.payload.folder_colors ?? {});
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Close viewing window when its note is deleted from another window (e.g. search)
  useEffect(() => {
    if (!isViewing || !originalPath) return;

    const unlisten = listen<string>("note-deleted", (event) => {
      if (event.payload === originalPath) {
        const idToClose = currentStickedId || stickedId;
        if (idToClose) {
          invoke("close_sticked_window", { id: idToClose });
        }
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [isViewing, originalPath, currentStickedId, stickedId]);

  // Focus editor on mount, when folder changes, or when editor becomes available after settings load
  useEffect(() => {
    if (vimEnabled === null) return; // editor not mounted yet
    setTimeout(() => editorRef.current?.focus(), 100);
  }, [folder, vimEnabled]);

  // Re-focus editor when window regains focus (e.g. after hide/show cycle)
  useEffect(() => {
    const handleWindowFocus = () => {
      if (showPicker || isSaving || vimMode === "command") return;
      setTimeout(() => editorRef.current?.focus(), 50);
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => window.removeEventListener("focus", handleWindowFocus);
  }, [showPicker, isSaving, vimMode]);

  // Listen for content transfer from unpinned sticked notes (only in capture mode)
  useEffect(() => {
    if (isSticked) return; // Only main capture window listens

    const unlisten = listen<{ content: string; folder: string }>("transfer-content", (event) => {
      const normalizedContent = normalizeMarkdownForState(event.payload.content);
      setContent(normalizedContent);
      onFolderChange(event.payload.folder);
      const resolvedContent = notesDir
        ? resolveImagePaths(normalizedContent, `${notesDir}/${event.payload.folder}`, convertFileSrc)
        : normalizedContent;
      // Focus editor and move cursor to end
      setTimeout(() => {
        editorRef.current?.setContent(resolvedContent);
        editorRef.current?.focus();
        editorRef.current?.moveToEnd?.();
      }, 100);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isSticked, notesDir, onFolderChange]);

  const handleSaveAndClose = useCallback(async () => {
    if (!isMarkdownEffectivelyEmpty(content)) {
      try {
        const targetFolder = await resolveFolderForAction();
        if (!targetFolder) {
          setToast("Create a folder first");
          setShowPicker(true);
          return;
        }

        setIsSaving(true);
        await onSave(content, targetFolder);
        setTimeout(async () => {
          setIsSaving(false);
          setContent("");
          onContentChange?.("");
          editorRef.current?.clear();
          await onClose();
        }, 600);
      } catch (error) {
        console.error("Failed to save note:", error);
        setIsSaving(false);
        setToast("Failed to save note");
      }
    } else {
      await onClose();
    }
  }, [content, onSave, onClose, onContentChange, resolveFolderForAction]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  // Handle escape to save and close (for capture mode and unpinned sticked notes)
  // When vim mode is enabled, Escape is handled entirely by the vim plugin — close is via :q/:wq
  useEffect(() => {
    if (isSticked && isPinned) return;
    if (vimEnabled) return; // Vim mode uses command bar (:q, :wq) instead of Escape

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      const target = e.target as Element | null;
      if (target?.closest(".link-popover")) return;

      if (isCopyMenuOpen) {
        e.preventDefault();
        setIsCopyMenuOpen(false);
        return;
      }

      if (!showPicker && !isSaving && !isPinning) {
        if (isSticked && !isPinned) {
          handleSaveAndCloseSticked();
        } else {
          handleSaveAndClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPicker, isSaving, isPinning, isSticked, isPinned, isCopyMenuOpen, vimEnabled, handleSaveAndClose]);

  useEffect(() => {
    if (!isCopyMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(event.target as Node)) {
        setIsCopyMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isCopyMenuOpen]);

  useEffect(() => {
    if (isMarkdownEffectivelyEmpty(content)) {
      setIsCopyMenuOpen(false);
    }
  }, [content]);

  const copyViaExecCommand = useCallback((plainText: string, htmlText: string): boolean => {
    const listener = (event: ClipboardEvent) => {
      if (!event.clipboardData) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", plainText);
      event.clipboardData.setData("text/html", htmlText);
    };

    document.addEventListener("copy", listener);
    try {
      return document.execCommand("copy");
    } finally {
      document.removeEventListener("copy", listener);
    }
  }, []);

  const copyPlainTextViaTextarea = useCallback((plainText: string): boolean => {
    const textarea = document.createElement("textarea");
    textarea.value = plainText;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }, []);

  const copyPlainText = useCallback(async (plainText: string): Promise<boolean> => {
    if (copyPlainTextViaTextarea(plainText)) {
      return true;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(plainText);
      return true;
    }
    return false;
  }, [copyPlainTextViaTextarea]);

  const handleCopy = useCallback(async (mode: CopyMode) => {
    if (isMarkdownEffectivelyEmpty(content) || isCopying) return;

    flushSync(() => {
      setIsCopying(true);
      setCopyMode(mode);
      setIsCopyMenuOpen(false);
    });

    try {
      if (mode === "rich") {
        const htmlText = editorRef.current?.getHTML()?.trim() || fallbackHtmlFromPlainText(content);
        const plainText =
          editorRef.current?.getText()?.trim() || normalizeMarkdownForCopy(content);

        // Keep the first attempt synchronous to preserve user gesture permissions.
        let copied = copyViaExecCommand(plainText, htmlText);

        if (!copied && navigator.clipboard && typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
          try {
            const item = new ClipboardItem({
              "text/plain": new Blob([plainText], { type: "text/plain" }),
              "text/html": new Blob([htmlText], { type: "text/html" }),
            });
            await navigator.clipboard.write([item]);
            copied = true;
          } catch (error) {
            console.warn("Clipboard.write failed, falling back to plain text copy:", error);
          }
        }

        if (!copied) {
          copied = await copyPlainText(plainText);
        }

        if (!copied) {
          throw new Error("Clipboard copy failed in all available methods");
        }

        showToast("Copied as rich text");
      } else if (mode === "markdown") {
        const markdownText = normalizeMarkdownForCopy(content);
        const copied = await copyPlainText(markdownText);
        if (!copied) {
          throw new Error("Markdown copy failed in all available methods");
        }
        showToast("Copied as markdown");
      } else {
        const activeElement = document.activeElement as HTMLElement | null;
        const shouldRestoreEditorFocus = !!activeElement?.closest(".stik-editor");

        if (shouldRestoreEditorFocus) {
          editorRef.current?.blur();
        }

        try {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
          await invoke("copy_visible_note_image_to_clipboard");
          showToast("Copied as image");
        } finally {
          if (shouldRestoreEditorFocus) {
            editorRef.current?.focus();
          }
        }
      }
    } catch (error) {
      console.error("Failed to copy note:", error);
      if (mode === "image" && error instanceof Error && error.message.includes("not supported")) {
        showToast("Image copy is not supported here");
      } else {
        showToast("Copy failed");
      }
    } finally {
      setIsCopying(false);
      setCopyMode(null);
    }
  }, [content, folder, isCopying, copyViaExecCommand, copyPlainText, showToast]);

  const copyButtonLabel =
    isCopying && copyMode === "markdown"
      ? "Copying markdown..."
      : isCopying && copyMode === "rich"
      ? "Copying rich text..."
      : "Copy";
  const hasMeaningfulContent = !isMarkdownEffectivelyEmpty(content);
  const hasValidFolder = folder.trim().length > 0;

  // Pin from capture mode
  const handlePin = useCallback(async () => {
    if (isPinning || isMarkdownEffectivelyEmpty(content)) return;

    try {
      const targetFolder = await resolveFolderForAction();
      if (!targetFolder) {
        setToast("Create a folder first");
        setShowPicker(true);
        return;
      }

      setIsPinning(true);
      await invoke("pin_capture_note", {
        content,
        folder: targetFolder,
      });
      setContent("");
      editorRef.current?.clear();
    } catch (error) {
      console.error("Failed to pin note:", error);
    } finally {
      setIsPinning(false);
    }
  }, [content, isPinning, resolveFolderForAction]);

  // Toggle pin state for sticked notes
  const handleTogglePin = useCallback(async () => {
    if (!currentStickedId && !isViewing) return;

    if (isPinned) {
      // Unpin: transfer content to main capture window and close this one
      try {
        const idToClose = currentStickedId || stickedId;

        // Remove from persistence
        if (currentStickedId) {
          await invoke("close_sticked_note", {
            id: currentStickedId,
            saveToFolder: false,
          });
        }

        // Transfer content to main postit window
        await invoke("transfer_to_capture", { content, folder });

        // Close this sticked window
        if (idToClose) {
          await invoke("close_sticked_window", { id: idToClose });
        }
      } catch (error) {
        console.error("Failed to unpin note:", error);
        // Fallback: just keep window open as unpinned
        setIsPinned(false);
      }
    } else {
      // Pin: create new sticked note entry and proper window
      try {
        const window = getCurrentWindow();
        const position = await window.outerPosition();
        const oldId = currentStickedId || stickedId;

        // Create the sticked note with position and size
        const newNote = await invoke<StickedNote>("create_sticked_note", {
          content,
          folder,
          position: [position.x, position.y],
        });

        // If this is a viewing note, close current window and create proper one
        if (isViewing && oldId) {
          // Create the proper sticked window
          await invoke("create_sticked_window", { note: newNote });
          // Close this viewing window
          await invoke("close_sticked_window", { id: oldId });
        } else {
          // Update the tracked ID to the newly created note
          setCurrentStickedId(newNote.id);
          setIsPinned(true);
        }
      } catch (error) {
        console.error("Failed to pin note:", error);
      }
    }
  }, [currentStickedId, stickedId, isPinned, content, folder, isViewing]);

  // Save & Close sticked note (saves content to folder file)
  const handleSaveAndCloseSticked = useCallback(async () => {
    const idToClose = currentStickedId || stickedId;
    if (!idToClose) return;

    // Only show save animation if there's content
    if (!isMarkdownEffectivelyEmpty(content)) {
      setIsSaving(true);
      try {
        // If still pinned, close from sticked notes
        if (isPinned && currentStickedId) {
          await invoke("close_sticked_note", {
            id: currentStickedId,
            saveToFolder: true,
          });
        } else if (isViewing && originalPath) {
          // Viewing note - update the existing file
          await invoke("update_note", {
            path: originalPath,
            content,
          });
        } else {
          // If unpinned (not viewing), save as new file
          await invoke("save_note", {
            folder,
            content,
          });
        }
        // Wait for save animation before closing
        setTimeout(async () => {
          await invoke("close_sticked_window", { id: idToClose });
        }, 600);
      } catch (error) {
        console.error("Failed to save and close sticked note:", error);
        setIsSaving(false);
      }
    } else {
      // No content, just close without animation
      try {
        if (isPinned && currentStickedId) {
          await invoke("close_sticked_note", {
            id: currentStickedId,
            saveToFolder: false,
          });
        }
        await invoke("close_sticked_window", { id: idToClose });
      } catch (error) {
        console.error("Failed to close sticked note:", error);
      }
    }
  }, [stickedId, currentStickedId, isPinned, content, folder]);

  // Close without saving
  const handleCloseWithoutSaving = useCallback(async () => {
    const idToClose = currentStickedId || stickedId;
    if (!idToClose) return;

    try {
      if (isPinned && currentStickedId) {
        await invoke("close_sticked_note", {
          id: currentStickedId,
          saveToFolder: false,
        });
      }
      await invoke("close_sticked_window", { id: idToClose });
    } catch (error) {
      console.error("Failed to close sticked note:", error);
    }
  }, [stickedId, currentStickedId, isPinned]);

  const handleContentChange = useCallback((newContent: string) => {
    const withImageLinksPromoted = normalizeImageLinksForMarkdown(newContent);
    const stored = normalizeMarkdownForState(unresolveImagePaths(withImageLinksPromoted));
    setContent(stored);
    onContentChange?.(stored);

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

  // --- Vim command bar ---
  const dismissCommandBar = useCallback(() => {
    setVimCommand("");
    setVimCommandError("");
    editorRef.current?.setVimMode("normal");
    editorRef.current?.focus();
  }, []);

  const executeVimCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();

    switch (trimmed) {
      case "wq":
      case "x": // save and close
        if (!isMarkdownEffectivelyEmpty(content)) {
          if (isSticked) {
            handleSaveAndCloseSticked();
          } else {
            handleSaveAndClose();
          }
        } else {
          // Nothing to save — just close
          if (isSticked) {
            handleCloseWithoutSaving();
          } else {
            onClose();
          }
        }
        break;
      case "q!": // discard and close (no save)
        setContent("");
        onContentChange?.("");
        editorRef.current?.clear();
        editorRef.current?.setVimMode("normal");
        setVimCommand("");
        if (isSticked) {
          handleCloseWithoutSaving();
        } else {
          onClose();
        }
        break;
      default:
        setVimCommandError(`Not a command: ${trimmed}`);
        return; // don't dismiss
    }

    setVimCommand("");
    setVimCommandError("");
  }, [content, isSticked, handleSaveAndClose, handleSaveAndCloseSticked, handleCloseWithoutSaving, onClose]);

  // Focus command input when command mode opens
  useEffect(() => {
    if (vimMode === "command") {
      setVimCommand("");
      setVimCommandError("");
      // Small delay so the input renders first
      requestAnimationFrame(() => commandInputRef.current?.focus());
    }
  }, [vimMode]);

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
    if (!isSticked || !currentStickedId || !isPinned) return;

    const savePosition = async () => {
      try {
        const window = getCurrentWindow();
        const position = await window.outerPosition();
        const size = await window.outerSize();
        await invoke("update_sticked_note", {
          id: currentStickedId,
          content: null,
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
  }, [isSticked, currentStickedId, isPinned]);

  // Autosave content for pinned sticked notes (prevents content loss on quit)
  useEffect(() => {
    if (!isSticked || !currentStickedId || !isPinned) return;

    const timer = setTimeout(async () => {
      try {
        await invoke("update_sticked_note", {
          id: currentStickedId,
          content,
          folder: null,
          position: null,
          size: null,
        });
      } catch (error) {
        console.error("Failed to autosave content:", error);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isSticked, currentStickedId, isPinned, content]);

  // Folder suggestion (capture mode only, debounced 1.5s)
  useEffect(() => {
    if (isSticked || content.length < 30) {
      setSuggestedFolder(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const suggestion = await invoke<string | null>("suggest_folder", {
          content,
          currentFolder: folder,
        });
        setSuggestedFolder(suggestion);
      } catch {
        setSuggestedFolder(null);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [content, folder, isSticked]);

  // Clear suggestion when folder changes
  useEffect(() => {
    setSuggestedFolder(null);
  }, [folder]);

  // Handle wiki-link click: open the referenced note for viewing
  const handleWikiLinkClick = useCallback(async (_slug: string, path: string) => {
    if (!path) return;
    try {
      const noteContent = await invoke<string>("get_note_content", { path });
      // Extract folder from path: ~/Documents/Stik/<folder>/<file>.md
      const parts = path.split("/");
      const noteFolder = parts[parts.length - 2] || folder;
      await invoke("open_note_for_viewing", {
        content: noteContent,
        folder: noteFolder,
        path,
      });
    } catch (error) {
      console.error("Failed to open wiki-linked note:", error);
    }
  }, [folder]);

  // Handle image paste/drop: save to disk and return asset URL for the editor
  const handleImagePaste = useCallback(async (file: File): Promise<string | null> => {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const [absPath] = await invoke<[string, string]>("save_note_image", {
        folder,
        imageData: base64,
      });

      return convertFileSrc(absPath);
    } catch (err) {
      console.error("Failed to save image:", err);
      return null;
    }
  }, [folder]);

  const handleImageDropPath = useCallback(async (path: string): Promise<string | null> => {
    try {
      const [absPath] = await invoke<[string, string]>("save_note_image_from_path", {
        folder,
        filePath: path,
      });

      return convertFileSrc(absPath);
    } catch (err) {
      console.error("Failed to import dropped image:", err);
      return null;
    }
  }, [folder]);

  // Show save animation
  if (isSaving) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg rounded-[14px]">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="save-checkmark text-coral"
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
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="save-check"
              fill="none"
              stroke="currentColor"
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
    <>
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
              disabled={!hasMeaningfulContent || isPinning}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
                hasMeaningfulContent
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
              hasValidFolder
                ? `${getFolderColor(folder, folderColors).badgeBg} ${getFolderColor(folder, folderColors).badgeText}`
                : "bg-line text-stone"
            }`}
          >
            <span className="text-[8px]" style={{ color: getFolderColor(folder, folderColors).dot }}>●</span>
            <span>{folder || "No folder"}</span>
            <span className="text-[8px] opacity-50">▼</span>
          </button>

          {suggestedFolder && (
            <button
              onClick={() => {
                onFolderChange(suggestedFolder);
                setSuggestedFolder(null);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-medium bg-coral/10 text-coral hover:bg-coral/20 transition-colors"
            >
              <span>→</span>
              <span>{suggestedFolder}?</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-stone">
          <div className="relative" ref={copyMenuRef}>
            {!(isCopying && copyMode === "image") && (
            <button
              onClick={() => setIsCopyMenuOpen((open) => !open)}
              disabled={!hasMeaningfulContent || isCopying}
              className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                hasMeaningfulContent
                  ? "hover:bg-coral-light text-coral"
                  : "text-stone/50 cursor-not-allowed"
              }`}
              title="Copy options"
            >
              {copyButtonLabel}
              {!isCopying && (
                <span className={`text-[8px] transition-transform ${isCopyMenuOpen ? "rotate-180" : ""}`}>
                  ▼
                </span>
              )}
            </button>
            )}

            {isCopyMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-40 rounded-lg border border-line bg-bg shadow-stik overflow-hidden z-[240]">
                <button
                  onClick={() => void handleCopy("rich")}
                  className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors"
                >
                  Copy as rich text
                </button>
                <button
                  onClick={() => void handleCopy("markdown")}
                  className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors"
                >
                  Copy as markdown
                </button>
                <button
                  onClick={() => void handleCopy("image")}
                  className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors"
                >
                  Copy as image
                </button>
              </div>
            )}
          </div>

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
                disabled={!hasMeaningfulContent}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  hasMeaningfulContent
                    ? "bg-coral text-white hover:bg-coral/90"
                    : "bg-line text-stone cursor-not-allowed"
                }`}
                title={hasMeaningfulContent ? "Save to folder and close" : "Nothing to save"}
              >
                Save
              </button>
            </div>
          ) : isSticked ? (
            <button
              onClick={handleSaveAndCloseSticked}
              className="px-2.5 py-1.5 bg-coral-light text-coral rounded-lg text-[10px] font-semibold hover:bg-coral hover:text-white transition-colors cursor-pointer"
              title="Save and close (Esc)"
            >
              esc
            </button>
          ) : (
            <button
              onClick={handleSaveAndClose}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors bg-coral-light text-coral hover:bg-coral hover:text-white cursor-pointer"
              title="Save and close (Esc)"
            >
              esc
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {vimEnabled === null ? (
          <div className="h-full" /> // placeholder while settings load
        ) : shouldWaitForNotesDir ? (
          <div className="h-full" /> // wait for notes dir to resolve .assets image paths
        ) : (
          <Editor
            key={vimEnabled ? "vim" : "novim"}
            ref={editorRef}
            onChange={handleContentChange}
            placeholder={isSticked ? "Sticked note..." : "Type a thought..."}
            initialContent={resolvedInitialContent || initialContent}
            vimEnabled={vimEnabled}
            onVimModeChange={setVimMode}
            onImagePaste={handleImagePaste}
            onImageDropPath={handleImageDropPath}
            onWikiLinkClick={handleWikiLinkClick}
          />
        )}

        {/* Folder Picker */}
        {showPicker && (
          <FolderPicker
            query={content.startsWith("/") ? content.slice(1) : ""}
            onSelect={handleFolderSelect}
            onClose={() => {
              setShowPicker(false);
              editorRef.current?.focus();
            }}
            folderColors={folderColors}
          />
        )}
      </div>

      {/* Footer - draggable (or command bar when vim command mode) */}
      {vimEnabled && vimMode === "command" ? (
        <div className="flex flex-col border-t border-line">
          {vimCommandError && (
            <div className="px-4 py-1 text-[11px] text-coral bg-coral-light/30">
              {vimCommandError}
            </div>
          )}
          <div className="flex items-center px-4 py-1.5 bg-ink/5">
            <span className="text-[13px] font-mono text-coral font-bold mr-0.5">:</span>
            <input
              ref={commandInputRef}
              type="text"
              value={vimCommand}
              onChange={(e) => {
                setVimCommand(e.target.value);
                setVimCommandError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  executeVimCommand(vimCommand);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  dismissCommandBar();
                } else if (e.key === "Backspace" && !vimCommand) {
                  e.preventDefault();
                  dismissCommandBar();
                }
              }}
              className="flex-1 bg-transparent text-[13px] font-mono text-ink outline-none placeholder:text-stone/50"
              placeholder="wq  q!"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      ) : (
        <div
          onMouseDown={startDrag}
          className="flex items-center justify-between px-4 py-2 border-t border-line text-[10px] drag-handle"
        >
          <span className="font-mono text-stone">
            <span className="text-coral">~</span>/Stik/
            <span className="text-coral">{folder || "No folder"}</span>/
          </span>
          <div className="flex items-center gap-2">
            {vimEnabled ? (
              <span className="vim-mode-indicator text-stone">
                {vimMode === "normal" ? (
                  <span className="text-coral">-- NORMAL --</span>
                ) : vimMode === "visual" ? (
                  <span className="text-amber-500">-- VISUAL --</span>
                ) : vimMode === "visual-line" ? (
                  <span className="text-amber-500">-- VISUAL LINE --</span>
                ) : (
                  <span className="text-green-600">-- INSERT --</span>
                )}
              </span>
            ) : isSticked && !isPinned && !isViewing ? (
              <span className="text-stone">
                <span className="text-amber-500">○</span> unpinned
              </span>
            ) : (
              <span className="text-stone">
                <span className="text-coral">✦</span> markdown supported
              </span>
            )}
            {(onOpenSettings || isSticked) && (
              <button
                onClick={() => isSticked ? invoke("open_settings") : onOpenSettings?.()}
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
      )}
    </div>
    {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
