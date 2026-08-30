import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "@/hooks/useTranslation";
import type { VaultHealthReport } from "@/types";
import { errorMessage } from "@/utils/appError";

type Action = "refresh" | "rebuild" | "export" | "open" | null;

const STATUS_STYLES: Record<VaultHealthReport["status"], string> = {
  healthy: "border-green-500/25 bg-green-500/10 text-green-700 dark:text-green-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
};

export default function VaultHealth() {
  const { t } = useTranslation();
  const [report, setReport] = useState<VaultHealthReport | null>(null);
  const [activeAction, setActiveAction] = useState<Action>("refresh");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await invoke<VaultHealthReport>("get_vault_health");
      setReport(next);
      return true;
    } catch (cause) {
      setError(errorMessage(cause, t("settings.health.checkFailed")));
      return false;
    }
  }, [t]);

  useEffect(() => {
    void refresh().finally(() => setActiveAction(null));
  }, [refresh]);

  const handleRefresh = async () => {
    setMessage(null);
    setActiveAction("refresh");
    await refresh();
    setActiveAction(null);
  };

  const handleRebuild = async () => {
    setMessage(null);
    setError(null);
    setActiveAction("rebuild");
    try {
      await invoke("rebuild_index");
      await refresh();
      setMessage(t("settings.health.rebuilt"));
    } catch (cause) {
      setError(errorMessage(cause, t("settings.health.rebuildFailed")));
    } finally {
      setActiveAction(null);
    }
  };

  const handleOpen = async () => {
    if (!report?.rootPath) return;
    setMessage(null);
    setError(null);
    setActiveAction("open");
    try {
      await open(report.rootPath);
    } catch (cause) {
      setError(errorMessage(cause, t("settings.health.openFailed")));
    } finally {
      setActiveAction(null);
    }
  };

  const handleExport = async () => {
    setMessage(null);
    setError(null);
    setActiveAction("export");
    try {
      const path = await save({
        defaultPath: "stik-vault-diagnostics.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("export_vault_diagnostics", { path });
      setMessage(t("settings.health.exported"));
    } catch (cause) {
      setError(errorMessage(cause, t("settings.health.exportFailed")));
    } finally {
      setActiveAction(null);
    }
  };

  const statusLabel = report ? t(`settings.health.${report.status}`) : t("settings.health.checking");
  const noteCount = report?.diskNoteCount === null
    ? t("settings.health.diskUnavailable", { indexed: report.indexedNoteCount })
    : report
      ? t("settings.health.noteCounts", {
          disk: report.diskNoteCount,
          indexed: report.indexedNoteCount,
        })
      : "—";

  return (
    <section aria-labelledby="vault-health-title" className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="vault-health-title" className="text-[15px] font-semibold text-ink">
              {t("settings.health.title")}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-stone">
              {t("settings.health.description")}
            </p>
          </div>
          <div
            role="status"
            aria-live="polite"
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
              report ? STATUS_STYLES[report.status] : "border-line bg-line/30 text-stone"
            }`}
          >
            {message ?? statusLabel}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-[12px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <dl className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70 bg-line/20">
        <div className="grid grid-cols-[7rem_1fr] gap-3 p-3 text-[12px]">
          <dt className="text-stone">{t("settings.health.storage")}</dt>
          <dd className="font-medium text-ink">{report?.storageMode ?? "—"}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3 p-3 text-[12px]">
          <dt className="text-stone">{t("settings.health.path")}</dt>
          <dd className="break-all font-mono text-[11px] text-ink">
            {report?.rootPath ?? t("settings.health.unavailable")}
          </dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3 p-3 text-[12px]">
          <dt className="text-stone">{t("settings.health.notes")}</dt>
          <dd className="font-medium text-ink">{noteCount}</dd>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3 p-3 text-[12px]">
          <dt className="text-stone">{t("settings.health.writable")}</dt>
          <dd className="font-medium text-ink">
            {report ? t(report.rootWritable ? "settings.health.yes" : "settings.health.no") : "—"}
          </dd>
        </div>
      </dl>

      {report && report.issues.length > 0 && (
        <ul aria-label="Vault health issues" className="space-y-2">
          {report.issues.map((issue) => (
            <li key={issue.code} className="rounded-xl border border-line/70 p-3">
              <p className="text-[12px] font-medium text-ink">{issue.message}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-stone">{issue.suggestion}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleRefresh} disabled={activeAction !== null} className="min-h-9 rounded-lg border border-line px-3 text-[12px] text-ink hover:border-coral/50 disabled:opacity-50">
          {t("settings.health.refresh")}
        </button>
        <button type="button" onClick={handleRebuild} disabled={activeAction !== null} className="min-h-9 rounded-lg border border-line px-3 text-[12px] text-ink hover:border-coral/50 disabled:opacity-50">
          {t("settings.health.rebuild")}
        </button>
        <button type="button" onClick={handleOpen} disabled={activeAction !== null || !report?.rootPath || !report.rootExists} className="min-h-9 rounded-lg border border-line px-3 text-[12px] text-ink hover:border-coral/50 disabled:opacity-50">
          {t("settings.health.openFolder")}
        </button>
        <button type="button" onClick={handleExport} disabled={activeAction !== null} className="min-h-9 rounded-lg bg-coral px-3 text-[12px] font-medium text-white hover:bg-coral-dark disabled:opacity-50">
          {t("settings.health.export")}
        </button>
      </div>
    </section>
  );
}
