/**
 * SpeechButton — voice-to-text dictation toggle for the note editor.
 *
 * Backed by WhisperKit via the `dictation_*` Tauri commands. On first
 * use, prompts to download a model. Streams partial transcription into
 * the editor as the user speaks, commits the final text on stop.
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DictationStatus } from "@/types";
import DictationSetupModal from "./DictationSetupModal";
import "@/styles/speech-button.css";
import { useTranslation } from "@/hooks/useTranslation";

interface SpeechButtonProps {
  onPartialText: (text: string, replaceFrom: number) => void;
  onTranscription: (text: string, replaceFrom: number) => void;
  getInsertOrigin: () => number;
  /** ISO language code (e.g. "en", "it"). null = auto-detect. */
  language?: string | null;
  /** Persisted Whisper variant id the user picked in Settings. */
  activeModel?: string | null;
  /**
   * Called when the first-run modal finishes and the user has
   * explicitly picked a language + model. Parent is expected to
   * persist this choice into settings.json so it sticks.
   */
  onActiveModelSelected?: (
    modelId: string,
    language: string | null,
  ) => Promise<void> | void;
  className?: string;
}

export interface SpeechButtonRef {
  toggle: () => void;
}

type DictationState = "idle" | "starting" | "recording" | "processing";

const SpeechButton = forwardRef<SpeechButtonRef, SpeechButtonProps>(
  function SpeechButton(
    {
      onPartialText,
      onTranscription,
      getInsertOrigin,
      language,
      activeModel,
      onActiveModelSelected,
      className,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const [state, setState] = useState<DictationState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);
    // Tracked only for the initial mount effect; the click handler
    // always re-checks authoritatively via refreshStatus() instead of
    // relying on this cached value, to avoid stale-state races with
    // the sidecar's startup.
    const [, setHasModel] = useState<boolean | null>(null);

    // Whenever dictation is active or the setup modal is mounted, pin a
    // global flag that tells App.tsx's postit blur-hide logic to stay
    // its hand. Without this, the mic TCC prompt steals focus on first
    // click and the postit auto-hides before we can even start.
    useEffect(() => {
      const holdOpen =
        setupOpen ||
        state === "starting" ||
        state === "recording" ||
        state === "processing";
      (
        window as unknown as { __stikDictationHoldOpen?: boolean }
      ).__stikDictationHoldOpen = holdOpen;
      return () => {
        (
          window as unknown as { __stikDictationHoldOpen?: boolean }
        ).__stikDictationHoldOpen = false;
      };
    }, [setupOpen, state]);

    const mountedRef = useRef(true);
    const onPartialRef = useRef(onPartialText);
    onPartialRef.current = onPartialText;
    const onTranscriptionRef = useRef(onTranscription);
    onTranscriptionRef.current = onTranscription;

    const insertOriginRef = useRef(0);
    // Prevents partials that arrive after the user clicked stop from
    // overwriting the already-committed final text.
    const activelyRecordingRef = useRef(false);

    // ── Check whether a dictation model is installed ──
    //
    // The sidecar can take a few hundred ms after app launch to finish
    // spawning + emit its "ready" notification. If our first call races
    // that window, Rust returns "DarwinKit sidecar not running" and we'd
    // wrongly conclude there are no models installed. Retry with backoff.
    const refreshStatus = useCallback(async (): Promise<boolean> => {
      const attempts = [0, 300, 600, 1000, 1500];
      for (const delay of attempts) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        try {
          const status = await invoke<DictationStatus>("dictation_get_status");
          if (!mountedRef.current) return false;
          const installed = status.installed_models.length > 0;
          setHasModel(installed);
          return installed;
        } catch {
          // sidecar probably not ready yet; fall through to retry
        }
      }
      if (mountedRef.current) setHasModel(false);
      return false;
    }, []);

    useEffect(() => {
      refreshStatus();
    }, [refreshStatus]);

    // ── Subscribe to dictation events (once on mount) ──
    useEffect(() => {
      const unlistenPartial = listen<{ text: string }>(
        "dictation:partial",
        (event) => {
          if (
            !mountedRef.current ||
            !activelyRecordingRef.current ||
            !event.payload.text
          ) {
            return;
          }
          onPartialRef.current(event.payload.text, insertOriginRef.current);
        },
      );

      const unlistenError = listen<{ message: string }>(
        "dictation:error",
        (event) => {
          if (!mountedRef.current) return;
          setState("idle");
          activelyRecordingRef.current = false;
          setError(event.payload.message || t("dictation.failed"));
        },
      );

      return () => {
        mountedRef.current = false;
        unlistenPartial.then((fn) => fn());
        unlistenError.then((fn) => fn());
      };
    }, []);

    // ── Auto-clear error after 3 seconds ──
    useEffect(() => {
      if (!error) return;
      const t = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(t);
    }, [error]);

    const startDictation = useCallback(async () => {
      setError(null);
      insertOriginRef.current = getInsertOrigin();
      setState("starting");
      try {
        const status = await invoke<DictationStatus>("dictation_get_status");
        if (status.installed_models.length === 0) {
          setState("idle");
          setSetupOpen(true);
          return;
        }

        // Prefer the model the user persisted in Settings; the Swift
        // handler will load it if it's not already the active one.
        // If the persisted id isn't installed anymore (user deleted it),
        // fall back to whatever is currently installed.
        let preferredModel: string | null = activeModel ?? null;
        if (
          preferredModel &&
          !status.installed_models.includes(preferredModel)
        ) {
          preferredModel = null;
        }

        await invoke("dictation_start", {
          language: language ?? null,
          modelId: preferredModel,
        });
        if (!mountedRef.current) return;
        activelyRecordingRef.current = true;
        setState("recording");
      } catch (e) {
        if (mountedRef.current) {
          setState("idle");
          setError(String(e));
        }
      }
    }, [language, activeModel, getInsertOrigin]);

    const stopDictation = useCallback(async () => {
      activelyRecordingRef.current = false;
      setState("processing");
      try {
        const result = await invoke<{ text: string }>("dictation_stop");
        if (!mountedRef.current) return;
        setState("idle");
        if (result?.text) {
          onTranscriptionRef.current(result.text, insertOriginRef.current);
        }
      } catch (e) {
        if (mountedRef.current) {
          setState("idle");
          setError(String(e));
        }
      }
    }, []);

    const handleToggle = useCallback(async () => {
      if (state === "processing" || state === "starting") return;

      if (state === "recording") {
        await stopDictation();
        return;
      }

      // Re-check status so cached hasModel=false from a startup race
      // with the sidecar doesn't wrongly pop the modal.
      const installed = await refreshStatus();
      if (!installed) {
        setSetupOpen(true);
        return;
      }

      // If the user has installed models but never explicitly picked
      // one (no `active_model` in settings yet), open the first-run
      // modal so they can choose a language + model once. Without
      // this we'd silently fall through to whatever the sidecar picks
      // as the default, which could be the slow 632 MB turbo model
      // and leave the user staring at a disabled "Loading…" button
      // for two minutes.
      if (!activeModel) {
        setSetupOpen(true);
        return;
      }

      await startDictation();
    }, [state, activeModel, refreshStatus, startDictation, stopDictation]);

    useImperativeHandle(ref, () => ({ toggle: handleToggle }), [handleToggle]);

    const isRecording = state === "recording";
    const isBusy = state === "processing" || state === "starting";

    return (
      <>
        <div className={`relative ${className ?? ""}`}>
          <button
            onClick={handleToggle}
            disabled={isBusy}
            className={[
              "fmt-btn",
              isRecording && "speech-recording",
              isBusy && "fmt-disabled",
            ]
              .filter(Boolean)
              .join(" ")}
            title={
              isRecording
                ? t("dictation.stop")
                : isBusy
                  ? state === "starting"
                    ? t("dictation.starting")
                    : t("dictation.processing")
                  : t("dictation.start")
            }
            aria-label={isRecording ? t("dictation.stop") : t("dictation.start")}
            aria-pressed={isRecording}
          >
            {isRecording ? <RecordingIcon /> : <MicrophoneIcon />}
          </button>

          {error && (
            <div className="speech-error">
              <p className="text-[11px] leading-snug text-coral break-words">
                {error}
              </p>
            </div>
          )}
        </div>

        {setupOpen && (
          <DictationSetupModal
            onClose={() => setSetupOpen(false)}
            onReady={async (modelId, language) => {
              setSetupOpen(false);
              // Persist the user's choice into settings.json so the
              // next launch (and every subsequent mic click) knows
              // which model to use — and so ⌘⇧V can actually work
              // without re-prompting.
              if (onActiveModelSelected) {
                await onActiveModelSelected(modelId, language);
              }
              await refreshStatus();
              await startDictation();
            }}
          />
        )}
      </>
    );
  },
);

export default SpeechButton;

// ── Inline SVG icons (no icon library) ──

function MicrophoneIcon() {
  return (
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
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function RecordingIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <circle cx="12" cy="12" r="6" className="text-red-500" />
    </svg>
  );
}
