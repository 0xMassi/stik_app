import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  reservedShortcuts?: string[];
  existingShortcuts?: string[];
}

// Convert shortcut string to display format
export function formatShortcutDisplay(shortcut: string): string {
  return shortcut
    .replace(/Cmd\+/g, "⌘")
    .replace(/CommandOrControl\+/g, "⌘")
    .replace(/Ctrl\+/g, "⌃")
    .replace(/Control\+/g, "⌃")
    .replace(/Shift\+/g, "⇧")
    .replace(/Alt\+/g, "⌥")
    .replace(/Option\+/g, "⌥");
}

// Convert key event to shortcut string
function keyEventToShortcut(e: KeyboardEvent): string | null {
  // Ignore modifier-only presses
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];

  // Add modifiers — distinguish Cmd (⌘) from Ctrl (⌃) on macOS
  if (e.metaKey) {
    parts.push("Cmd");
  }
  if (e.ctrlKey) {
    parts.push("Ctrl");
  }
  if (e.shiftKey) {
    parts.push("Shift");
  }
  if (e.altKey) {
    parts.push("Alt");
  }

  // Must have at least one modifier for global shortcuts
  if (parts.length === 0) {
    return null;
  }

  // Convert key to code format
  let keyCode = e.code;

  // Map common keys
  if (keyCode.startsWith("Key")) {
    keyCode = keyCode.replace("Key", "");
  } else if (keyCode.startsWith("Digit")) {
    keyCode = keyCode.replace("Digit", "");
  } else {
    // Handle special keys
    const specialKeys: Record<string, string> = {
      "Space": "Space",
      "Enter": "Enter",
      "Backspace": "Backspace",
      "Tab": "Tab",
      "Escape": "Escape",
      "ArrowUp": "Up",
      "ArrowDown": "Down",
      "ArrowLeft": "Left",
      "ArrowRight": "Right",
      "Comma": "Comma",
      "Period": "Period",
      "Slash": "Slash",
      "Backslash": "Backslash",
      "BracketLeft": "BracketLeft",
      "BracketRight": "BracketRight",
      "Semicolon": "Semicolon",
      "Quote": "Quote",
      "Backquote": "Backquote",
      "Minus": "Minus",
      "Equal": "Equal",
    };

    if (specialKeys[keyCode]) {
      keyCode = specialKeys[keyCode];
    } else if (keyCode.startsWith("F") && /^F\d+$/.test(keyCode)) {
      // Function keys F1-F12
      keyCode = keyCode;
    } else {
      // Unknown key, use the key value
      keyCode = e.key.toUpperCase();
    }
  }

  parts.push(keyCode);
  return parts.join("+");
}

// Reserved system shortcuts that cannot be overridden
const SYSTEM_RESERVED = [
  "Cmd+Shift+P", // Search
  "Cmd+Shift+M", // Manager
  "Cmd+Shift+Comma", // Settings
];

// Toast component
function Toast({
  message,
  type,
  onDone
}: {
  message: string;
  type: "info" | "error" | "success";
  onDone: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    // Remove after delay
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDone, 200);
    }, 2000);

    return () => clearTimeout(timer);
  }, [onDone]);

  const styles = {
    info: "bg-ink text-white",
    error: "bg-red-500 text-white",
    success: "bg-coral text-white",
  }[type];

  return (
    <div
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]
        px-4 py-2.5 rounded-xl shadow-stik
        text-[13px] font-medium
        transition-all duration-200 ease-out
        ${styles}
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {message}
    </div>
  );
}

export default function ShortcutRecorder({
  value,
  onChange,
  reservedShortcuts = SYSTEM_RESERVED,
  existingShortcuts = [],
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [tempShortcut, setTempShortcut] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "info" | "error" | "success" } | null>(null);
  const inputRef = useRef<HTMLButtonElement>(null);

  // Use refs to track pending shortcut synchronously (avoids stale closure issue)
  const pendingShortcutRef = useRef<string | null>(null);
  const hasErrorRef = useRef<boolean>(false);
  const isRecordingRef = useRef(false);

  const showToast = useCallback((message: string, type: "info" | "error" | "success" = "info") => {
    setToast({ message, type });
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Pause/resume global shortcuts when recording state changes
  useEffect(() => {
    if (isRecording) {
      invoke("pause_shortcuts").catch(console.error);
    } else {
      invoke("resume_shortcuts").catch(console.error);
    }
  }, [isRecording]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isRecordingRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        pendingShortcutRef.current = null;
        hasErrorRef.current = false;
        setIsRecording(false);
        setTempShortcut(null);
        return;
      }

      const shortcut = keyEventToShortcut(e);
      if (!shortcut) {
        // Show hint if user pressed a key without modifiers
        if (!["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
          showToast("Hold ⌘, ⌃, ⇧, or ⌥ with a key", "info");
        }
        return;
      }

      // Check if reserved
      if (reservedShortcuts.includes(shortcut)) {
        pendingShortcutRef.current = shortcut;
        hasErrorRef.current = true;
        showToast("This shortcut is reserved by Stik", "error");
        setTempShortcut(shortcut);
        return;
      }

      // Check if already used
      if (existingShortcuts.includes(shortcut) && shortcut !== value) {
        pendingShortcutRef.current = shortcut;
        hasErrorRef.current = true;
        showToast("This shortcut is already in use", "error");
        setTempShortcut(shortcut);
        return;
      }

      // Valid shortcut - store in ref for immediate access in keyup
      pendingShortcutRef.current = shortcut;
      hasErrorRef.current = false;
      setTempShortcut(shortcut);
    };

    const handleKeyUp = () => {
      if (!isRecordingRef.current) return;

      // Commit the shortcut when all keys are released
      if (pendingShortcutRef.current && !hasErrorRef.current) {
        onChange(pendingShortcutRef.current);
        showToast(`Shortcut set to ${formatShortcutDisplay(pendingShortcutRef.current)}`, "success");
        pendingShortcutRef.current = null;
        setIsRecording(false);
        setTempShortcut(null);
      }
    };

    // Add listeners globally
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [value, onChange, reservedShortcuts, existingShortcuts, showToast]);

  // Click outside to cancel
  useEffect(() => {
    if (!isRecording) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        pendingShortcutRef.current = null;
        hasErrorRef.current = false;
        setIsRecording(false);
        setTempShortcut(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isRecording]);

  // Cleanup: always ensure shortcuts are resumed when component unmounts
  useEffect(() => {
    return () => {
      // Always resume - safer than checking state which might be stale
      invoke("resume_shortcuts").catch(() => {});
    };
  }, []);

  const displayValue = isRecording
    ? tempShortcut
      ? formatShortcutDisplay(tempShortcut)
      : "Press keys..."
    : formatShortcutDisplay(value);

  return (
    <>
      <div className="relative">
        <button
          ref={inputRef}
          onClick={() => {
            setIsRecording(true);
            setTempShortcut(null);
          }}
          className={`w-full px-3 py-2.5 rounded-lg text-[13px] text-left flex items-center justify-between transition-all ${
            isRecording
              ? "bg-coral/10 border-2 border-coral text-coral"
              : "bg-bg border border-line text-ink hover:border-coral/50"
          }`}
        >
          <span className={`font-mono ${isRecording && !tempShortcut ? "text-stone animate-pulse" : ""}`}>
            {displayValue}
          </span>
          {isRecording ? (
            <span
              className="text-[9px] text-stone hover:text-coral cursor-pointer transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                pendingShortcutRef.current = null;
                hasErrorRef.current = false;
                setIsRecording(false);
                setTempShortcut(null);
              }}
            >
              cancel
            </span>
          ) : (
            <span className="text-[9px] text-stone">Click to record</span>
          )}
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
