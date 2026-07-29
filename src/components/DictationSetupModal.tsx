/**
 * DictationSetupModal — first-run flow for downloading a Whisper model.
 *
 * Triggered when the user clicks the mic button and no model is yet
 * installed. Lets them pick a language + a model tier, downloads with
 * progress, loads it, persists the choice in settings.
 */
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DictationModelInfo, DictationDownloadProgress } from "@/types";
import { Dropdown } from "./SettingsContent";
import { useTranslation } from "@/hooks/useTranslation";
import type { TranslationKey } from "@/i18n";

interface Props {
  onClose: () => void;
  onReady: (modelId: string, language: string | null) => void;
}

const LANGUAGES: { code: string | null; labelKey: TranslationKey }[] = [
  { code: null, labelKey: "language.autoDetect" },
  { code: "en", labelKey: "language.english" },
  { code: "it", labelKey: "language.italian" },
  { code: "es", labelKey: "language.spanish" },
  { code: "fr", labelKey: "language.french" },
  { code: "de", labelKey: "language.german" },
  { code: "pt", labelKey: "language.portuguese" },
  { code: "nl", labelKey: "language.dutch" },
  { code: "ja", labelKey: "language.japanese" },
  { code: "zh", labelKey: "language.chinese" },
  { code: "ko", labelKey: "language.korean" },
  { code: "ru", labelKey: "language.russian" },
  { code: "ar", labelKey: "language.arabic" },
  { code: "hi", labelKey: "language.hindi" },
  { code: "tr", labelKey: "language.turkish" },
  { code: "pl", labelKey: "language.polish" },
  { code: "el", labelKey: "language.greek" },
  { code: "cs", labelKey: "language.czech" },
  { code: "sv", labelKey: "language.swedish" },
  { code: "ro", labelKey: "language.romanian" },
  { code: "uk", labelKey: "language.ukrainian" },
];

type Phase = "choose" | "downloading" | "loading" | "error";

export default function DictationSetupModal({ onClose, onReady }: Props) {
  const { t } = useTranslation();
  const [models, setModels] = useState<DictationModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [progress, setProgress] = useState(0);
  const [bytesDone, setBytesDone] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadElapsed, setLoadElapsed] = useState(0);

  // Tick elapsed seconds while in loading phase so the user sees
  // progress (CoreML compile for turbo is 2+ min on first load).
  useEffect(() => {
    if (phase !== "loading") {
      setLoadElapsed(0);
      return;
    }
    const started = Date.now();
    const interval = window.setInterval(() => {
      setLoadElapsed(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [phase]);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  // Load model catalog on mount
  useEffect(() => {
    invoke<DictationModelInfo[]>("dictation_list_models")
      .then((list) => {
        setModels(list);
        // Default selection: first non-downloaded model with the
        // "Balanced" label, otherwise just the first one
        const balanced = list.find((m) => m.label === "Balanced");
        setSelectedModelId(balanced?.id ?? list[0]?.id ?? null);
      })
      .catch((e) => {
        setErrorMsg(t("dictation.modelListFailed", { error: String(e) }));
        setPhase("error");
      });
  }, []);

  // Subscribe to download lifecycle only. Model loading is now a
  // synchronous `invoke` that blocks until the sidecar finishes
  // compiling the model, so we no longer need model_loaded /
  // model_load_error event listeners here.
  useEffect(() => {
    const unlistenProgress = listen<DictationDownloadProgress>(
      "dictation:download_progress",
      (e) => {
        if (e.payload.model_id !== selectedModelId) return;
        setProgress(e.payload.progress);
        setBytesDone(e.payload.bytes_done);
        setBytesTotal(e.payload.bytes_total);
      },
    );
    const unlistenComplete = listen<{ model_id: string }>(
      "dictation:download_complete",
      async (e) => {
        if (e.payload.model_id !== selectedModelId) return;
        setPhase("loading");
        try {
          // This call blocks (up to 200 s in Rust) until the sidecar
          // finishes compiling the model for the Neural Engine.
          await invoke("dictation_set_active_model", {
            modelId: e.payload.model_id,
          });
          onReady(e.payload.model_id, selectedLanguage);
        } catch (err) {
          setErrorMsg(`Couldn't load model: ${String(err)}`);
          setPhase("error");
        }
      },
    );
    const unlistenError = listen<{ model_id: string; message: string }>(
      "dictation:download_error",
      (e) => {
        if (e.payload.model_id !== selectedModelId) return;
        setErrorMsg(e.payload.message);
        setPhase("error");
      },
    );
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, [selectedModelId, selectedLanguage, onReady]);

  const startDownload = useCallback(async () => {
    if (!selectedModelId) return;
    setErrorMsg(null);
    setProgress(0);
    setBytesDone(0);
    setBytesTotal(0);
    setPhase("downloading");
    try {
      await invoke("dictation_download_model", { modelId: selectedModelId });
    } catch (e) {
      setErrorMsg(String(e));
      setPhase("error");
    }
  }, [selectedModelId]);

  const cancelDownload = useCallback(async () => {
    try {
      await invoke("dictation_cancel_download");
    } catch {
      /* ignore */
    }
    onClose();
  }, [onClose]);

  // ── Render ──
  // Modal must adapt to the postit window size (400×300 by default).
  // max-h-[92vh] + overflow-y-auto keeps the whole flow accessible even
  // on a small sticky note. Outer padding scales with viewport.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-[440px] max-h-[92vh] overflow-y-auto rounded-2xl bg-bg p-4 shadow-2xl border border-line">
        <h2 className="text-[14px] font-semibold text-ink mb-1">
          {t("dictation.setupTitle")}
        </h2>
        <p className="text-[11px] text-stone leading-snug mb-3">
          {t("dictation.whisperIntro")}
        </p>

        {phase === "choose" && (
          <>
            <div className="mb-3">
              <label className="block text-[11px] text-stone mb-1">
                {t("settings.language.title")}
              </label>
              <Dropdown
                value={selectedLanguage ?? ""}
                options={LANGUAGES.map((l) => ({
                  value: l.code ?? "",
                  label: t(l.labelKey),
                }))}
                onChange={(value) => setSelectedLanguage(value || null)}
                placeholder={t("dictation.selectLanguage")}
              />
            </div>

            <div className="mb-3">
              <label className="block text-[11px] text-stone mb-1">Model</label>
              <div className="space-y-1.5">
                {models.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedModelId === m.id
                        ? "border-coral bg-coral-light/30"
                        : "border-line bg-line/10 hover:bg-line/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      checked={selectedModelId === m.id}
                      onChange={() => setSelectedModelId(m.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] text-ink font-medium truncate">
                          {m.label}
                        </span>
                        <span className="text-[10px] text-stone shrink-0">
                          {m.size_mb} MB
                        </span>
                      </div>
                      <p className="text-[10px] text-stone leading-snug mt-0.5">
                        {m.description}
                      </p>
                      {m.downloaded && (
                        <p className="text-[10px] text-coral mt-0.5">
                          {t("dictation.alreadyDownloaded")}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-[11px] text-stone hover:text-ink rounded-lg"
              >
                {t("common.cancelAction")}
              </button>
              <button
                type="button"
                onClick={startDownload}
                disabled={!selectedModelId}
                className="px-3 py-1.5 text-[11px] bg-coral text-white rounded-lg hover:bg-coral/90 disabled:opacity-50"
              >
                Download &amp; use
              </button>
            </div>
          </>
        )}

        {phase === "downloading" && (
          <div className="py-4">
            <p className="text-[13px] text-ink mb-2">Downloading model…</p>
            <div className="w-full h-2 bg-line/30 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-coral transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-stone">
              {(() => {
                // WhisperKit's Progress uses per-file units, not bytes, so
                // the raw bytes_done/bytes_total are tiny counts. Show the
                // percentage from `fraction`, and append byte counts only
                // if they're plausibly real bytes (> 1 MB total).
                const pct = Math.round(progress * 100);
                if (bytesTotal > 1_000_000) {
                  return `${pct}% — ${(bytesDone / 1_000_000).toFixed(1)} / ${(
                    bytesTotal / 1_000_000
                  ).toFixed(1)} MB`;
                }
                return progress > 0 ? `${pct}%` : t("dictation.connecting");
              })()}
            </p>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={cancelDownload}
                className="px-4 py-2 text-[12px] text-stone hover:text-coral rounded-lg"
              >
                {t("common.cancelAction")}
              </button>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <div className="py-6 text-center">
            <p className="text-[13px] text-ink">
              Compiling model for the Neural Engine… {loadElapsed}s
            </p>
            <p className="text-[11px] text-stone mt-2 leading-snug max-w-[360px] mx-auto">
              {selectedModel && selectedModel.size_mb >= 500
                ? t("dictation.firstLoadHigh")
                : t("dictation.firstLoadShort")}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="py-4">
            <p className="text-[13px] text-coral mb-2">Something went wrong</p>
            <p className="text-[11px] text-stone mb-4 break-words">
              {errorMsg ?? t("common.unknownError")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[12px] text-stone hover:text-ink rounded-lg"
              >
                {t("common.close")}
              </button>
              <button
                type="button"
                onClick={() => setPhase("choose")}
                className="px-4 py-2 text-[12px] bg-coral text-white rounded-lg hover:bg-coral/90"
              >
                {t("common.tryAgain")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
