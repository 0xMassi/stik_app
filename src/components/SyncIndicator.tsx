import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "@/hooks/useTranslation";

interface SyncIndicatorProps {
  enabled: boolean;
}

export default function SyncIndicator({ enabled }: SyncIndicatorProps) {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const unlisten = listen("icloud-files-changed", () => {
      setSyncing(true);
      const timer = setTimeout(() => setSyncing(false), 2000);
      return () => clearTimeout(timer);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-stone"
      title={syncing ? t("sync.syncingWithICloud") : t("sync.syncedWithICloud")}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={syncing ? "animate-pulse text-accent" : "text-stone"}
      >
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      </svg>
      {syncing && <span className="animate-pulse">{t("common.syncing")}</span>}
    </div>
  );
}
