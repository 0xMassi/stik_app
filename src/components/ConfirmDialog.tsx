import { useEffect } from "react";

interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onConfirm, onCancel]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-bg rounded-xl border border-line shadow-stik w-[min(90vw,320px)] flex flex-col items-center p-6">
        <div className="w-10 h-10 mb-3 text-coral">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-ink mb-1">{title}</h2>
        {description && (
          <p className="text-[12px] text-stone text-center mb-4 max-w-[280px]">
            {description}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[12px] bg-line hover:bg-line/70 text-ink rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[12px] bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
        <div className="flex items-center justify-center mt-4 text-[10px] text-stone">
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">esc</kbd>
          <span className="ml-1">cancel</span>
          <span className="mx-2">&middot;</span>
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">enter</kbd>
          <span className="ml-1">confirm</span>
        </div>
      </div>
    </div>
  );
}
