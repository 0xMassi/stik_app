import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AiMenuProps {
  content: string;
  folder: string;
  onApplyText: (text: string) => void;
  onShowToast: (message: string) => void;
  disabled: boolean;
}

type AiAction = "rephrase" | "summarize" | "organize" | null;
type RephraseStyle = "casual" | "formal" | "professional" | "concise";

interface OrganizeResult {
  suggested_folder: string | null;
  tags: string[];
  reasoning: string;
}

export default function AiMenu({
  content,
  folder,
  onApplyText,
  onShowToast,
  disabled,
}: AiMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAction, setCurrentAction] = useState<AiAction>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [organizeResult, setOrganizeResult] = useState<OrganizeResult | null>(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check availability on mount
  useEffect(() => {
    invoke<{ available: boolean }>("ai_available")
      .then((r) => setAvailable(r.available))
      .catch(() => setAvailable(false));
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setPreviewText(null);
    setOrganizeResult(null);
    setShowStylePicker(false);
    setCurrentAction(null);
  }, []);

  const handleRephrase = async (style: RephraseStyle) => {
    setIsProcessing(true);
    setCurrentAction("rephrase");
    setShowStylePicker(false);
    try {
      const result = await invoke<{ text: string; style: string }>("ai_rephrase", {
        content,
        style,
      });
      setPreviewText(result.text);
    } catch (e) {
      onShowToast(`Rephrase failed: ${e}`);
      handleClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSummarize = async () => {
    setIsProcessing(true);
    setCurrentAction("summarize");
    try {
      const result = await invoke<{ summary: string }>("ai_summarize", { content });
      setPreviewText(result.summary);
    } catch (e) {
      onShowToast(`Summarize failed: ${e}`);
      handleClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOrganize = async () => {
    setIsProcessing(true);
    setCurrentAction("organize");
    try {
      const result = await invoke<OrganizeResult>("ai_organize", {
        content,
        currentFolder: folder,
      });
      setOrganizeResult(result);
    } catch (e) {
      onShowToast(`Organize failed: ${e}`);
      handleClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (previewText) {
      onApplyText(previewText);
      onShowToast(currentAction === "summarize" ? "Summary applied" : "Text rephrased");
    }
    handleClose();
  };

  // Not available — hide the button entirely
  if (available === false) return null;
  // Still loading availability
  if (available === null) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        disabled={disabled}
        className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
          disabled
            ? "text-stone/50 cursor-not-allowed"
            : isOpen
              ? "bg-coral-light text-coral"
              : "hover:bg-coral-light text-coral/70 hover:text-coral"
        }`}
        title="AI Assistant"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a4 4 0 0 1 4 4v1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2V6a4 4 0 0 1 4-4z" />
          <path d="M9 18v-2" />
          <path d="M15 18v-2" />
          <path d="M12 18v-2" />
          <rect x="4" y="18" width="16" height="4" rx="1" />
        </svg>
        <span className="text-[10px]">AI</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 rounded-lg border border-line bg-bg shadow-stik overflow-hidden z-[240]">
          {/* Loading state */}
          {isProcessing && (
            <div className="px-4 py-3 flex items-center gap-2 text-[11px] text-stone min-w-[200px]">
              <span className="animate-spin text-coral">*</span>
              <span>
                {currentAction === "rephrase" && "Rephrasing..."}
                {currentAction === "summarize" && "Summarizing..."}
                {currentAction === "organize" && "Analyzing..."}
              </span>
            </div>
          )}

          {/* Preview result (rephrase or summarize) */}
          {!isProcessing && previewText && (
            <div className="min-w-[260px] max-w-[320px]">
              <div className="px-3 py-2 border-b border-line">
                <span className="text-[10px] font-semibold text-coral uppercase tracking-wider">
                  {currentAction === "summarize" ? "Summary" : "Rephrased"}
                </span>
              </div>
              <div className="px-3 py-2 text-[12px] text-ink leading-relaxed max-h-[200px] overflow-y-auto">
                {previewText}
              </div>
              <div className="px-3 py-2 border-t border-line flex justify-end gap-2">
                <button
                  onClick={handleClose}
                  className="px-2.5 py-1 rounded-md text-[10px] text-stone hover:bg-line transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleApply}
                  className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-coral text-white hover:bg-coral/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Organize result */}
          {!isProcessing && organizeResult && (
            <div className="min-w-[240px] max-w-[300px]">
              <div className="px-3 py-2 border-b border-line">
                <span className="text-[10px] font-semibold text-coral uppercase tracking-wider">
                  Organization suggestion
                </span>
              </div>
              <div className="px-3 py-2 space-y-2">
                {organizeResult.suggested_folder && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone">Folder:</span>
                    <span className="text-[11px] font-medium text-ink px-1.5 py-0.5 bg-coral/10 rounded">
                      {organizeResult.suggested_folder}
                    </span>
                  </div>
                )}
                {organizeResult.tags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-stone mt-0.5">Tags:</span>
                    <div className="flex flex-wrap gap-1">
                      {organizeResult.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 bg-line rounded text-ink"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {organizeResult.reasoning && (
                  <p className="text-[10px] text-stone italic">
                    {organizeResult.reasoning}
                  </p>
                )}
                {!organizeResult.suggested_folder && organizeResult.tags.length === 0 && (
                  <p className="text-[11px] text-stone">
                    Current organization looks good.
                  </p>
                )}
              </div>
              <div className="px-3 py-2 border-t border-line flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-2.5 py-1 rounded-md text-[10px] text-stone hover:bg-line transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Style picker for rephrase */}
          {!isProcessing && !previewText && !organizeResult && showStylePicker && (
            <div className="min-w-[160px]">
              <div className="px-3 py-1.5 border-b border-line">
                <span className="text-[10px] text-stone">Choose style</span>
              </div>
              {(["casual", "formal", "professional", "concise"] as RephraseStyle[]).map(
                (style) => (
                  <button
                    key={style}
                    onClick={() => handleRephrase(style)}
                    className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors capitalize"
                  >
                    {style}
                  </button>
                )
              )}
            </div>
          )}

          {/* Main menu */}
          {!isProcessing && !previewText && !organizeResult && !showStylePicker && (
            <div className="min-w-[160px]">
              <button
                onClick={() => setShowStylePicker(true)}
                className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors flex items-center gap-2"
              >
                <span className="text-coral w-4 text-center">A</span>
                Rephrase
              </button>
              <button
                onClick={handleSummarize}
                className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors flex items-center gap-2"
              >
                <span className="text-coral w-4 text-center">S</span>
                Summarize
              </button>
              <div className="border-t border-line" />
              <button
                onClick={handleOrganize}
                className="w-full px-3 py-2 text-left text-[11px] text-ink hover:bg-line/50 transition-colors flex items-center gap-2"
              >
                <span className="text-coral w-4 text-center">O</span>
                Organize
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
