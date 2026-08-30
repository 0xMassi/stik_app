import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "@/hooks/useTranslation";
import Dialog from "./ui/Dialog";

interface LockPromptProps {
  onAuthenticated: () => void;
  onCancel: () => void;
}

export default function LockPrompt({
  onAuthenticated,
  onCancel,
}: LockPromptProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "authenticating" | "failed">(
    "idle",
  );
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleAuth = async () => {
    setStatus("authenticating");
    try {
      const success = await invoke<boolean>("authenticate");
      if (success) {
        onAuthenticated();
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  };

  return (
    <Dialog
      title={
        <>
          <svg
            aria-hidden="true"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-3 text-coral"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>{t("lock.lockedNote")}</span>
        </>
      }
      description={
        <span role="status" aria-live="polite" aria-atomic="true">
          {status === "failed" ? t("lock.authFailed") : t("lock.authPrompt")}
        </span>
      }
      onClose={onCancel}
      initialFocusRef={cancelRef}
      backdropClassName="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      panelClassName="w-72 rounded-2xl bg-bg border border-line shadow-stik p-6 text-center"
      titleClassName="flex flex-col text-[14px] font-medium text-ink"
      descriptionClassName="mt-1 text-[12px] leading-relaxed text-stone"
    >
        <div className="flex items-center gap-2 mt-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-8 flex-1 px-3 py-2 text-[12px] text-stone border border-line rounded-lg hover:bg-line transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
          >
            {t("common.cancelAction")}
          </button>
          <button
            type="button"
            onClick={handleAuth}
            disabled={status === "authenticating"}
            aria-busy={status === "authenticating"}
            className="min-h-8 flex-1 px-3 py-2 text-[12px] text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            {status === "authenticating" ? t("common.waiting") : t("common.unlock")}
          </button>
        </div>
    </Dialog>
  );
}
