import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "@/hooks/useTranslation";

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
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-72 rounded-2xl bg-bg border border-line shadow-stik p-6 text-center">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto text-coral mb-3"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <p className="text-[14px] font-medium text-ink">{t("lock.lockedNote")}</p>
        <p className="text-[12px] text-stone mt-1 leading-relaxed">
          {status === "failed"
            ? t("lock.authFailed")
            : t("lock.authPrompt")}
        </p>

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-[12px] text-stone border border-line rounded-lg hover:bg-line transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAuth}
            disabled={status === "authenticating"}
            className="flex-1 px-3 py-2 text-[12px] text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50"
          >
            {status === "authenticating" ? t("common.waiting") : t("common.unlock")}
          </button>
        </div>
      </div>
    </div>
  );
}
