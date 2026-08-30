import { useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import Dialog from "./ui/Dialog";

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
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      title={
        <>
          <svg
            aria-hidden="true"
            className="mb-3 h-10 w-10 text-coral"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          <span>{title}</span>
        </>
      }
      description={description}
      onClose={onCancel}
      initialFocusRef={cancelRef}
      backdropClassName="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      panelClassName="bg-bg rounded-xl border border-line shadow-stik w-[min(90vw,320px)] flex flex-col items-center p-6"
      titleClassName="mb-1 flex flex-col items-center text-sm font-semibold text-ink"
      descriptionClassName="text-[12px] text-stone text-center mb-4 max-w-[280px]"
    >
        <div className="flex gap-2 mt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-8 px-4 py-2 text-[12px] bg-line hover:bg-line/70 text-ink rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
          >
            {t("common.cancelAction")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-8 px-4 py-2 text-[12px] bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          >
            {confirmLabel ?? t("common.delete")}
          </button>
        </div>
        <div className="flex items-center justify-center mt-4 text-[10px] text-stone">
          <kbd className="px-1.5 py-0.5 bg-line rounded text-[9px] font-mono">{t("common.esc")}</kbd>
          <span className="ml-1">{t("common.cancel")}</span>
        </div>
    </Dialog>
  );
}
