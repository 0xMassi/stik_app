import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import ShortcutRecorder from "./ShortcutRecorder";
import type {
  CustomFontEntry,
  CustomTemplate,
  CustomThemeDefinition,
  DictationDownloadProgress,
  DictationModelInfo,
  DictationStatus,
  GitSyncStatus,
  ShortcutMapping,
  StikSettings,
  ThemeColors,
} from "@/types";
import { listen } from "@tauri-apps/api/event";
import { BUILTIN_COMMAND_NAMES } from "@/extensions/cm-slash-commands";
import ConfirmDialog from "./ConfirmDialog";
import {
  SYSTEM_SHORTCUT_ACTIONS,
  SYSTEM_SHORTCUT_DEFAULTS,
  SYSTEM_SHORTCUT_LABEL_KEYS,
  type SystemAction,
} from "@/utils/systemShortcuts";
import { hexToRgb, rgbToHex } from "@/utils/color";
import { useTranslation } from "@/hooks/useTranslation";
import { LOCALES, t as tGlobal, type TranslationKey } from "@/i18n";
import { BUILTIN_THEMES, generateThemeId, type BuiltinTheme } from "@/themes";
import {
  FONTS,
  loadGoogleFont,
  loadCustomFont,
} from "@/utils/fonts";

function remoteToWebUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\.git$/i, "");
  }

  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const repoPath = sshMatch[2].replace(/\.git$/i, "");
    return `https://${host}/${repoPath}`;
  }

  return null;
}

interface DropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
}: DropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allOptions = options.some((o) => o.value === value)
    ? options
    : [{ value, label: value }, ...options];

  const selectedOption = allOptions.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink text-left flex items-center justify-between hover:border-coral/50 transition-colors"
      >
        <span className={selectedOption ? "text-ink" : "text-stone"}>
          {selectedOption?.label || placeholder || t("common.select")}
        </span>
        <span
          className={`text-[8px] text-stone transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg border border-line rounded-lg shadow-stik overflow-hidden max-h-[220px] overflow-y-auto">
          {allOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2.5 text-[13px] text-left transition-colors ${
                option.value === value
                  ? "bg-coral text-white"
                  : "text-ink hover:bg-line/50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type SettingsTab =
  | "appearance"
  | "shortcuts"
  | "folders"
  | "editor"
  | "templates"
  | "git"
  | "ai"
  | "dictation"
  | "insights"
  | "privacy";

interface SettingsContentProps {
  activeTab: SettingsTab;
  settings: StikSettings;
  folders: string[];
  onSettingsChange: (settings: StikSettings) => void;
  resolvedNotesDir: string;
  captureStreakLabel: string;
  captureStreakDays: number | null;
  isRefreshingStreak: boolean;
  onRefreshCaptureStreak: () => Promise<void>;
  onThisDayMessage: string;
  onThisDayPreview: string | null;
  onThisDayDate: string | null;
  onThisDayFolder: string | null;
  isCheckingOnThisDay: boolean;
  onCheckOnThisDay: () => Promise<void>;
  gitSyncStatus: GitSyncStatus | null;
  isPreparingGitRepo: boolean;
  isSyncingGitNow: boolean;
  isOpeningGitRemote: boolean;
  onPrepareGitRepository: () => Promise<void>;
  onSyncGitNow: () => Promise<void>;
  onOpenGitRemote: () => Promise<void>;
  onTabChange?: (tab: SettingsTab) => void;
}

function SettingsToast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDone, 200);
    }, 1800);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[250]
        px-4 py-2.5 rounded-xl shadow-stik
        text-[13px] font-medium bg-ink text-bg
        transition-all duration-200 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {message}
    </div>
  );
}

function PrivacySection({
  settings,
  onSettingsChange,
}: {
  settings: StikSettings;
  onSettingsChange: (settings: StikSettings) => void;
}) {
  const { t } = useTranslation();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [authAvailable, setAuthAvailable] = useState(false);
  const [isLockingAll, setIsLockingAll] = useState(false);

  const loadDeviceId = useCallback(async () => {
    try {
      const id = await invoke<string>("get_analytics_device_id");
      setDeviceId(id);
    } catch {
      setDeviceId(null);
    }
  }, []);

  useEffect(() => {
    loadDeviceId();
    invoke<boolean>("auth_available")
      .then(setAuthAvailable)
      .catch(() => {});
  }, [loadDeviceId]);

  const copyDeviceId = () => {
    if (!deviceId) return;
    navigator.clipboard.writeText(deviceId);
    setToast(t("settings.deviceIdCopied"));
  };

  const handleLockAllNow = async () => {
    setIsLockingAll(true);
    try {
      await invoke("lock_session");
      setToast(t("settings.lock.sessionLocked"));
    } catch (err) {
      setToast(String(err));
    } finally {
      setIsLockingAll(false);
    }
  };

  const handleExportRecoveryKey = async () => {
    try {
      const authed = await invoke<boolean>("is_authenticated").catch(
        () => false,
      );
      if (!authed) {
        const ok = await invoke<boolean>("authenticate");
        if (!ok) return;
      }
      const key = await invoke<string>("export_recovery_key");
      await navigator.clipboard.writeText(key);
      setToast(t("settings.lock.recoveryCopied"));
    } catch (err) {
      setToast(String(err));
    }
  };

  const noteLock = settings.note_lock ?? {
    enabled: false,
    timeout_minutes: 15,
    lock_on_sleep: true,
  };

  return (
    <>
      <div className="space-y-4">
        {/* Note Locking */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-stone uppercase tracking-wider">
            {t("settings.lock.title")}
          </p>

          {!authAvailable && (
            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
              <p className="text-[12px] text-stone leading-relaxed">
                {t("settings.lock.needPassword")}
              </p>
            </div>
          )}

          <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">
                {t("settings.lock.enable")}
              </p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.lock.describe")}
              </p>
            </div>
            <button
              type="button"
              disabled={!authAvailable}
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  note_lock: { ...noteLock, enabled: !noteLock.enabled },
                })
              }
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                noteLock.enabled ? "bg-coral" : "bg-line"
              } ${!authAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  noteLock.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          {noteLock.enabled && (
            <>
              <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-ink font-medium">
                      {t("settings.lock.timeout")}
                    </p>
                    <p className="text-[12px] text-stone">
                      {t("settings.lock.timeoutDescribe")}
                    </p>
                  </div>
                  <div className="w-[140px]">
                    <Dropdown
                      value={String(noteLock.timeout_minutes)}
                      options={[
                        { value: "1", label: t("duration.1minute") },
                        { value: "5", label: t("duration.5minutes") },
                        { value: "15", label: t("duration.15minutes") },
                        { value: "30", label: t("duration.30minutes") },
                        { value: "60", label: t("duration.1hour") },
                      ]}
                      onChange={(v) =>
                        onSettingsChange({
                          ...settings,
                          note_lock: {
                            ...noteLock,
                            timeout_minutes: Number(v),
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-ink font-medium">
                      {t("settings.lock.onSleep")}
                    </p>
                    <p className="text-[12px] text-stone">
                      {t("settings.lock.onSleepDescribe")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onSettingsChange({
                        ...settings,
                        note_lock: {
                          ...noteLock,
                          lock_on_sleep: !noteLock.lock_on_sleep,
                        },
                      })
                    }
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                      noteLock.lock_on_sleep ? "bg-coral" : "bg-line"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                        noteLock.lock_on_sleep
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleLockAllNow}
                  disabled={isLockingAll}
                  className="flex-1 px-3 py-2.5 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
                >
                  {isLockingAll ? t("settings.lock.locking") : t("settings.lock.lockNow")}
                </button>
                <button
                  type="button"
                  onClick={handleExportRecoveryKey}
                  className="flex-1 px-3 py-2.5 text-[12px] text-stone border border-line rounded-lg hover:bg-line/50 transition-colors"
                >
                  {t("settings.lock.exportKey")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Analytics */}
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-stone uppercase tracking-wider mb-3">
            {t("settings.analytics.title")}
          </p>
        </div>

        <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
          <div>
            <p className="text-[13px] text-ink font-medium">
              {t("settings.analytics.share")}
            </p>
            <p className="mt-1 text-[12px] text-stone leading-relaxed">
              {t("settings.analytics.shareDescribe")}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onSettingsChange({
                ...settings,
                analytics_enabled: !settings.analytics_enabled,
              })
            }
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              settings.analytics_enabled ? "bg-coral" : "bg-line"
            }`}
            title={t("settings.analytics.toggle")}
          >
            <span
              className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                settings.analytics_enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </label>

        <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
          <div>
            <p className="text-[13px] text-ink font-medium">
              {t("settings.autoUpdate.title")}
            </p>
            <p className="mt-1 text-[12px] text-stone leading-relaxed">
              {t("settings.autoUpdate.describe")}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onSettingsChange({
                ...settings,
                auto_update_enabled: !settings.auto_update_enabled,
              })
            }
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              settings.auto_update_enabled ? "bg-coral" : "bg-line"
            }`}
            title={t("settings.autoUpdate.toggle")}
          >
            <span
              className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                settings.auto_update_enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </label>

        <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-3">
          <div>
            <p className="text-[13px] text-ink font-medium mb-2">
              {t("settings.analytics.weCollect")}
            </p>
            <ul className="text-[12px] text-stone leading-relaxed space-y-1">
              <li>{t("settings.analytics.collectAppOpens")}</li>
              <li>{t("settings.analytics.collectDevice")}</li>
              <li>{t("settings.analytics.collectScreen")}</li>
              <li>{t("settings.analytics.collectId")}</li>
            </ul>
          </div>
          <div>
            <p className="text-[13px] text-ink font-medium mb-2">
              {t("settings.analytics.neverCollect")}
            </p>
            <ul className="text-[12px] text-stone leading-relaxed space-y-1">
              <li>{t("settings.analytics.neverNotes")}</li>
              <li>{t("settings.analytics.neverPaths")}</li>
              <li>{t("settings.analytics.neverIdentify")}</li>
            </ul>
          </div>
        </div>

        {deviceId && (
          <div className="p-4 bg-line/30 rounded-xl border border-line/50">
            <p className="text-[12px] text-stone mb-2">{t("settings.analytics.yourDeviceId")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2.5 py-2 text-[11px] rounded-lg bg-bg border border-line text-ink font-mono truncate">
                {deviceId}
              </code>
              <button
                type="button"
                onClick={copyDeviceId}
                className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors whitespace-nowrap"
              >
                {t("common.copy")}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-stone">
              {t("settings.analytics.idNotLinked")}
            </p>
          </div>
        )}

        <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
          <p className="text-[12px] text-stone leading-relaxed">
            {t("settings.analytics.posthog")}
          </p>
        </div>
      </div>
      {toast && <SettingsToast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}

const COLOR_TOKEN_LABELS: {
  key: keyof ThemeColors;
  labelKey: TranslationKey;
  optional?: boolean;
  default?: string;
}[] = [
  { key: "bg", labelKey: "settings.color.background" },
  { key: "surface", labelKey: "settings.color.surface" },
  { key: "ink", labelKey: "settings.color.text" },
  { key: "stone", labelKey: "settings.color.mutedText" },
  { key: "line", labelKey: "settings.color.borders" },
  { key: "accent", labelKey: "settings.color.accent" },
  { key: "accent_light", labelKey: "settings.color.accentLight" },
  { key: "accent_dark", labelKey: "settings.color.accentDark" },
  {
    key: "highlight",
    labelKey: "settings.color.highlight",
    optional: true,
    default: "253 224 71",
  },
];

function ThemePreviewCard({
  name,
  colors,
  isDark,
  isActive,
  isSystem,
  onClick,
}: {
  name: string;
  colors: ThemeColors;
  isDark: boolean;
  isActive: boolean;
  isSystem?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all ${
        isActive
          ? "border-coral ring-2 ring-coral/20"
          : "border-line/50 hover:border-coral/40"
      }`}
    >
      <div
        className="relative rounded-t-xl p-3 h-[72px] flex flex-col justify-between overflow-hidden"
        style={{ backgroundColor: `rgb(${colors.bg})` }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: `rgb(${colors.accent})` }}
          />
          <div
            className="h-1.5 rounded-full w-10"
            style={{ backgroundColor: `rgb(${colors.ink})`, opacity: 0.6 }}
          />
        </div>
        <div className="space-y-1">
          <div
            className="h-1.5 rounded-full w-full"
            style={{ backgroundColor: `rgb(${colors.ink})`, opacity: 0.15 }}
          />
          <div
            className="h-1.5 rounded-full w-3/4"
            style={{ backgroundColor: `rgb(${colors.stone})`, opacity: 0.25 }}
          />
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ backgroundColor: `rgb(${colors.line})` }}
        />
      </div>
      <div className="px-3 py-2 bg-line/20 rounded-b-xl flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink truncate">
          {name}
        </span>
        {isSystem && (
          <span className="text-[9px] text-stone uppercase tracking-wider">
            {t("common.auto")}
          </span>
        )}
        {isDark && !isSystem && (
          <span className="text-[9px] text-stone uppercase tracking-wider">
            {t("theme.dark")}
          </span>
        )}
      </div>
    </button>
  );
}

function CustomThemeEditor({
  theme,
  onChange,
  onSave,
  onCancel,
  onDelete,
  isNew,
}: {
  theme: CustomThemeDefinition;
  onChange: (theme: CustomThemeDefinition) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isNew: boolean;
}) {
  const { t } = useTranslation();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, []);

  const updateColor = (key: keyof ThemeColors, hex: string) => {
    onChange({
      ...theme,
      colors: { ...theme.colors, [key]: hexToRgb(hex) },
    });
  };

  return (
    <div className="space-y-4 p-4 bg-line/30 rounded-xl border border-line/50">
      <div>
        <label
          className="block text-[12px] text-stone mb-1.5"
          htmlFor="theme-name-input"
        >
          {t("settings.theme.name")}
        </label>
        <input
          ref={nameInputRef}
          id="theme-name-input"
          type="text"
          value={theme.name}
          onChange={(e) => onChange({ ...theme, name: e.target.value })}
          placeholder={t("settings.theme.namePlaceholder")}
          maxLength={30}
          className="w-full px-3 py-2 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
        />
      </div>

      <label className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-stone">{t("settings.theme.dark")}</span>
        <button
          type="button"
          onClick={() => onChange({ ...theme, is_dark: !theme.is_dark })}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            theme.is_dark ? "bg-coral" : "bg-line"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
              theme.is_dark ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      <div>
        <p className="text-[12px] text-stone mb-2">{t("settings.theme.colors")}</p>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_TOKEN_LABELS.map(
            ({ key, labelKey, optional, default: defaultRgb }) => {
              const rgbValue = theme.colors[key] ?? defaultRgb ?? "0 0 0";
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-2.5 py-2 bg-bg rounded-lg border border-line/50"
                >
                  <label className="relative w-6 h-6 shrink-0">
                    <input
                      type="color"
                      value={rgbToHex(rgbValue)}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div
                      className="w-6 h-6 rounded-md border border-line cursor-pointer"
                      style={{ backgroundColor: `rgb(${rgbValue})` }}
                    />
                  </label>
                  <span className="text-[11px] text-ink truncate">
                    {t(labelKey)}
                    {optional && (
                      <span className="ml-1 text-stone/60">opt</span>
                    )}
                  </span>
                </div>
              );
            },
          )}
        </div>
      </div>

      <div
        className="rounded-lg overflow-hidden border border-line/50"
        style={{ backgroundColor: `rgb(${theme.colors.bg})` }}
      >
        <div className="px-3 py-2.5">
          <p
            className="text-[13px] font-medium mb-1"
            style={{ color: `rgb(${theme.colors.ink})` }}
          >
            {t("settings.theme.preview")}
          </p>
          <p
            className="text-[11px] leading-relaxed"
            style={{ color: `rgb(${theme.colors.stone})` }}
          >
            
            {t("settings.theme.previewHint")}{" "}
            <span style={{ color: `rgb(${theme.colors.accent})` }}>
              {t("settings.theme.accentColor")}
            </span>{" "}
            {t("settings.theme.accentColorDesc")}
          </p>
        </div>
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{
            backgroundColor: `rgb(${theme.colors.surface})`,
            borderTop: `1px solid rgb(${theme.colors.line})`,
          }}
        >
          <div
            className="px-2.5 py-1 rounded-md text-[10px] font-medium"
            style={{
              backgroundColor: `rgb(${theme.colors.accent})`,
              color: theme.is_dark ? `rgb(${theme.colors.bg})` : "#fff",
            }}
          >
            {t("settings.theme.button")}
          </div>
          <div
            className="px-2.5 py-1 rounded-md text-[10px]"
            style={{
              border: `1px solid rgb(${theme.colors.line})`,
              color: `rgb(${theme.colors.stone})`,
            }}
          >
            {t("settings.theme.secondary")}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!theme.name.trim()}
          className="px-3 py-2 text-[12px] font-medium text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50"
        >
          {isNew ? t("common.create") : t("common.update")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-[12px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
        >
          {t("common.cancelAction")}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto px-3 py-2 text-[12px] text-coral hover:bg-coral-light rounded-lg transition-colors"
          >
            {t("common.delete")}
          </button>
        )}
      </div>
    </div>
  );
}

function AppearanceSection({
  settings,
  onSettingsChange,
}: {
  settings: StikSettings;
  onSettingsChange: (settings: StikSettings) => void;
}) {
  const { t } = useTranslation();
  const [editingTheme, setEditingTheme] =
    useState<CustomThemeDefinition | null>(null);
  const [isNewTheme, setIsNewTheme] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const selectedFont = settings.font_family ?? null;
  const windowOpacity = settings.window_opacity ?? 1.0;
  const customFonts: CustomFontEntry[] = settings.custom_fonts ?? [];

  // Lazily load all built-in Google Fonts and any saved custom fonts when the tab opens.
  useEffect(() => {
    for (const font of FONTS) {
      loadGoogleFont(font.id);
    }
    for (const cf of customFonts) {
      void loadCustomFont(cf.name, cf.path);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImportFont = async () => {
    const selected = await open({
      multiple: false,
      title: t("settings.font.importFile"),
      filters: [
        { name: t("settings.font.files"), extensions: ["ttf", "otf", "woff", "woff2"] },
      ],
    });
    if (!selected) return;

    // Copy into ~/.stik/fonts first: the picked file may sit anywhere, and a
    // font referenced in place stops working the moment the user moves it.
    let entry: CustomFontEntry;
    try {
      entry = await invoke<CustomFontEntry>("import_font_file", { path: selected });
    } catch (error) {
      setToast(typeof error === "string" ? error : t("settings.font.loadFailed"));
      return;
    }

    const { name } = entry;
    if (customFonts.some((f) => f.path === entry.path)) {
      setToast(`Font "${name}" is already imported`);
      return;
    }

    const ok = await loadCustomFont(name, entry.path);
    if (!ok) {
      setToast(t("settings.font.loadFailed"));
      return;
    }

    const updated = [...customFonts, entry];
    onSettingsChange({ ...settings, custom_fonts: updated });
    setToast(`Font "${name}" imported`);
  };

  const removeCustomFont = (path: string) => {
    const entry = customFonts.find((f) => f.path === path);
    const updated = customFonts.filter((f) => f.path !== path);
    const patch: Partial<StikSettings> = { custom_fonts: updated };
    // Clear font_family if it was using the removed font
    if (entry && settings.font_family === entry.name) {
      patch.font_family = null;
    }
    onSettingsChange({ ...settings, ...patch });
    if (entry) setToast(`Font "${entry.name}" removed`);
  };

  const activeTheme = settings.active_theme || settings.theme_mode || "system";
  const customThemes = settings.custom_themes ?? [];

  const selectTheme = (id: string) => {
    onSettingsChange({ ...settings, active_theme: id, theme_mode: id });
  };

  const startNewTheme = () => {
    const defaultLight = BUILTIN_THEMES[0];
    setEditingTheme({
      id: generateThemeId(),
      name: "",
      is_dark: false,
      colors: { ...defaultLight.colors },
    });
    setIsNewTheme(true);
  };

  const startEditTheme = (theme: CustomThemeDefinition) => {
    setEditingTheme({ ...theme, colors: { ...theme.colors } });
    setIsNewTheme(false);
  };

  const saveTheme = () => {
    if (!editingTheme || !editingTheme.name.trim()) return;

    let updated: CustomThemeDefinition[];
    if (isNewTheme) {
      updated = [...customThemes, editingTheme];
    } else {
      updated = customThemes.map((t) =>
        t.id === editingTheme.id ? editingTheme : t,
      );
    }

    onSettingsChange({
      ...settings,
      custom_themes: updated,
      active_theme: editingTheme.id,
      theme_mode: editingTheme.id,
    });
    setEditingTheme(null);
    setToast(
      isNewTheme
        ? `Theme "${editingTheme.name}" created`
        : `Theme "${editingTheme.name}" updated`,
    );
  };

  const deleteTheme = (id: string) => {
    const theme = customThemes.find((t) => t.id === id);
    const updated = customThemes.filter((t) => t.id !== id);
    const newSettings: Partial<StikSettings> = { custom_themes: updated };

    if (activeTheme === id) {
      newSettings.active_theme = "system";
      newSettings.theme_mode = "";
    }

    onSettingsChange({ ...settings, ...newSettings });
    if (editingTheme?.id === id) setEditingTheme(null);
    setConfirmingDelete(null);
    if (theme) setToast(`Theme "${theme.name}" deleted`);
  };

  const handleImport = async () => {
    const selected = await open({
      multiple: false,
      title: t("settings.theme.importFile"),
      filters: [{ name: t("settings.theme.files"), extensions: ["json", "toml"] }],
    });
    if (!selected) return;

    try {
      const imported = await invoke<CustomThemeDefinition>(
        "import_theme_file",
        {
          path: selected,
        },
      );
      const updated = [...customThemes, imported];
      onSettingsChange({
        ...settings,
        custom_themes: updated,
        active_theme: imported.id,
        theme_mode: imported.id,
      });
      setToast(`Theme "${imported.name}" imported`);
    } catch (error) {
      setToast(`Import failed: ${error}`);
    }
  };

  const handleExport = async (theme: {
    name: string;
    is_dark: boolean;
    colors: ThemeColors;
  }) => {
    const selected = await save({
      title: t("settings.theme.export"),
      defaultPath: `${theme.name.toLowerCase().replace(/\s+/g, "-")}.json`,
      filters: [
        { name: "JSON", extensions: ["json"] },
        { name: "TOML", extensions: ["toml"] },
      ],
    });
    if (!selected) return;

    try {
      await invoke("export_theme_file", {
        path: selected,
        name: theme.name,
        is_dark: theme.is_dark,
        colors: theme.colors,
      });
      setToast(`Theme "${theme.name}" exported`);
    } catch (error) {
      setToast(`Export failed: ${error}`);
    }
  };

  const systemColors: BuiltinTheme = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches
    ? BUILTIN_THEMES[1]
    : BUILTIN_THEMES[0];

  return (
    <>
      <div className="space-y-4">
        <div className="p-4 bg-line/30 rounded-xl border border-line/50">
          <p className="text-[13px] text-ink font-medium mb-1">
            {t("settings.language.title")}
          </p>
          <p className="text-[12px] text-stone leading-relaxed mb-3">
            {t("settings.language.description")}
          </p>
          <div className="max-w-[240px]">
            <Dropdown
              value={settings.language ?? ""}
              options={[
                { value: "", label: t("settings.language.system") },
                ...LOCALES.map((l) => ({
                  value: l.id,
                  label:
                    l.nativeLabel === l.englishLabel
                      ? l.nativeLabel
                      : `${l.nativeLabel} (${l.englishLabel})`,
                })),
              ]}
              onChange={(value) =>
                onSettingsChange({ ...settings, language: value })
              }
            />
          </div>
        </div>

        <p className="text-[12px] text-stone">
          {t("settings.theme.chooseIntro")}
        </p>

        <div className="grid grid-cols-3 gap-2">
          <ThemePreviewCard
            name={t("common.system")}
            colors={systemColors.colors}
            isDark={systemColors.isDark}
            isActive={activeTheme === "system" || activeTheme === ""}
            isSystem
            onClick={() => selectTheme("system")}
          />
          {BUILTIN_THEMES.map((theme) => (
            <ThemePreviewCard
              key={theme.id}
              name={t(theme.nameKey)}
              colors={theme.colors}
              isDark={theme.isDark}
              isActive={activeTheme === theme.id}
              onClick={() => selectTheme(theme.id)}
            />
          ))}
          {customThemes.map((theme) => (
            <div key={theme.id} className="relative group">
              <ThemePreviewCard
                name={theme.name}
                colors={theme.colors}
                isDark={theme.is_dark}
                isActive={activeTheme === theme.id}
                onClick={() => selectTheme(theme.id)}
              />
              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditTheme(theme);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded bg-bg/80 backdrop-blur-sm text-stone hover:text-ink text-[10px]"
                  title={t("settings.theme.edit")}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport(theme);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded bg-bg/80 backdrop-blur-sm text-stone hover:text-ink text-[10px]"
                  title={t("settings.theme.export")}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(theme.id);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded bg-bg/80 backdrop-blur-sm text-stone hover:text-coral text-[10px]"
                  title={t("settings.theme.delete")}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {editingTheme ? (
          <CustomThemeEditor
            theme={editingTheme}
            onChange={setEditingTheme}
            onSave={saveTheme}
            onCancel={() => setEditingTheme(null)}
            onDelete={
              !isNewTheme
                ? () => setConfirmingDelete(editingTheme.id)
                : undefined
            }
            isNew={isNewTheme}
          />
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startNewTheme}
              className="flex-1 px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
            >
              <span className="text-lg">+</span>
              <span>{t("settings.theme.create")}</span>
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
            >
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{t("common.import")}</span>
            </button>
          </div>
        )}

        {/* ── Font Picker ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] text-stone font-medium">{t("settings.font.editorFont")}</p>
            <button
              type="button"
              onClick={handleImportFont}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-coral border border-dashed border-coral/30 hover:bg-coral-light transition-colors"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              
              {t("settings.font.importEllipsis")}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <button
              type="button"
              onClick={() =>
                onSettingsChange({ ...settings, font_family: null })
              }
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                selectedFont === null
                  ? "bg-coral text-white border-coral"
                  : "border-line text-stone hover:border-coral/40 hover:text-ink"
              }`}
            >
              {t("settings.font.systemDefault")}
            </button>
          </div>

          {(["sans", "serif", "mono"] as const).map((cat) => (
            <div key={cat} className="mb-2">
              <p className="text-[10px] text-stone uppercase tracking-wider mb-1.5">
                {cat === "sans"
                  ? t("settings.font.sansSerif")
                  : cat === "serif"
                    ? t("settings.font.serif")
                    : t("settings.font.monospace")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FONTS.filter((f) => f.category === cat).map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => {
                      loadGoogleFont(font.id);
                      onSettingsChange({ ...settings, font_family: font.id });
                    }}
                    style={{ fontFamily: `"${font.id}", sans-serif` }}
                    className={`px-3 py-1.5 rounded-full text-[11px] border transition-colors ${
                      selectedFont === font.id
                        ? "bg-coral text-white border-coral"
                        : "border-line text-ink hover:border-coral/40"
                    }`}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {customFonts.length > 0 && (
            <div className="mb-1">
              <p className="text-[10px] text-stone uppercase tracking-wider mb-1.5">
                {t("settings.template.custom")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {customFonts.map((cf) => (
                  <div key={cf.path} className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        void loadCustomFont(cf.name, cf.path).then((ok) => {
                          if (ok)
                            onSettingsChange({
                              ...settings,
                              font_family: cf.name,
                            });
                          else
                            setToast(
                              `Could not load "${cf.name}" — file may have moved`,
                            );
                        });
                      }}
                      style={{ fontFamily: `"${cf.name}", sans-serif` }}
                      className={`px-3 py-1.5 rounded-l-full text-[11px] border-y border-l transition-colors ${
                        selectedFont === cf.name
                          ? "bg-coral text-white border-coral"
                          : "border-line text-ink hover:border-coral/40"
                      }`}
                    >
                      {cf.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCustomFont(cf.path)}
                      className={`px-1.5 py-1.5 rounded-r-full text-[10px] border-y border-r transition-colors ${
                        selectedFont === cf.name
                          ? "bg-coral text-white border-coral hover:bg-coral/90"
                          : "border-line text-stone hover:text-coral hover:border-coral/40"
                      }`}
                      title={t("settings.font.remove")}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Background Opacity ── */}
        <div className="p-4 bg-line/30 rounded-xl border border-line/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] text-ink font-medium">
              {t("settings.opacity.title")}
            </p>
            <span className="text-[12px] font-mono text-stone tabular-nums">
              {Math.round(windowOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            aria-label={t("settings.opacity.title")}
            min={20}
            max={100}
            step={5}
            value={Math.round(windowOpacity * 100)}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                window_opacity: Number(e.target.value) / 100,
              })
            }
            className="w-full accent-coral"
          />
          <p className="mt-2 text-[11px] text-stone leading-relaxed">
            {t("settings.opacity.describe")}
          </p>
        </div>

        <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
          <p className="text-[12px] text-stone leading-relaxed">
            {t("settings.theme.scopeNote")}
          </p>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={t("settings.theme.deleteConfirm")}
          description={t("settings.theme.deleteDescribe", {
            name: customThemes.find((c) => c.id === confirmingDelete)?.name ?? "",
          })}
          onConfirm={() => deleteTheme(confirmingDelete)}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
      {toast && <SettingsToast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}

const TEMPLATE_NAME_RE = /^[a-z][a-z0-9-]*$/;
const TEMPLATE_NAME_MIN = 2;
const TEMPLATE_NAME_MAX = 20;
const TEMPLATE_BODY_MAX = 5000;

function validateTemplateName(
  name: string,
  existingNames: string[],
  editingIndex: number | null,
): string | null {
  if (name.length < TEMPLATE_NAME_MIN)
    return tGlobal("settings.template.nameTooShort", { min: TEMPLATE_NAME_MIN });
  if (name.length > TEMPLATE_NAME_MAX)
    return tGlobal("settings.template.nameTooLong", { max: TEMPLATE_NAME_MAX });
  if (!TEMPLATE_NAME_RE.test(name))
    return tGlobal("settings.template.nameRule");
  if (BUILTIN_COMMAND_NAMES.includes(name))
    return tGlobal("settings.template.nameBuiltin", { name });
  const dupeIdx = existingNames.findIndex((n) => n === name);
  if (dupeIdx >= 0 && dupeIdx !== editingIndex)
    return tGlobal("settings.template.nameTaken");
  return null;
}

function TemplatesSection({
  templates,
  onChange,
}: {
  templates: CustomTemplate[];
  onChange: (templates: CustomTemplate[]) => void;
}) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startAdd = () => {
    setEditingIndex(-1); // -1 = new template
    setEditName("");
    setEditBody("");
    setNameError(null);
    setBodyError(null);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditName(templates[index].name);
    setEditBody(templates[index].body);
    setNameError(null);
    setBodyError(null);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditName("");
    setEditBody("");
    setNameError(null);
    setBodyError(null);
  };

  const saveEdit = () => {
    const trimmedName = editName.trim();
    const trimmedBody = editBody.trim();

    const existingNames = templates.map((t) => t.name);
    const nErr = validateTemplateName(
      trimmedName,
      existingNames,
      editingIndex === -1 ? null : editingIndex,
    );
    const bErr = !trimmedBody
      ? t("settings.template.bodyEmpty")
      : trimmedBody.length > TEMPLATE_BODY_MAX
        ? `Body must be at most ${TEMPLATE_BODY_MAX} characters`
        : null;

    setNameError(nErr);
    setBodyError(bErr);
    if (nErr || bErr) return;

    const entry: CustomTemplate = { name: trimmedName, body: trimmedBody };
    const isNew = editingIndex === -1;
    if (isNew) {
      onChange([...templates, entry]);
    } else if (editingIndex !== null) {
      const updated = [...templates];
      updated[editingIndex] = entry;
      onChange(updated);
    }
    cancelEdit();
    setToast(
      isNew
        ? `Template /${trimmedName} added`
        : `Template /${trimmedName} updated`,
    );
  };

  const confirmDelete = (index: number) => {
    const name = templates[index].name;
    onChange(templates.filter((_, i) => i !== index));
    if (editingIndex === index) cancelEdit();
    setConfirmingDelete(null);
    setToast(`Template /${name} deleted`);
  };

  return (
    <>
      <div className="space-y-4">
        <p className="text-[12px] text-stone">
          {t("settings.template.intro")}
        </p>

        {/* Existing templates */}
        {templates.length > 0 && (
          <div className="space-y-2">
            {templates.map((tpl, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2.5 bg-line/30 rounded-xl border border-line/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-ink font-medium">/{tpl.name}</p>
                  <p className="text-[11px] text-stone truncate">
                    {tpl.body.split("\n")[0].slice(0, 60)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(i)}
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-line text-stone hover:text-ink transition-colors"
                  title={t("settings.template.edit")}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(i)}
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-coral-light text-stone hover:text-coral transition-colors"
                  title={t("settings.template.delete")}
                >
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
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Edit / Add form */}
        {editingIndex !== null ? (
          <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-3">
            <div>
              <label
                className="block text-[12px] text-stone mb-1.5"
                htmlFor="template-name-input"
              >
                {t("settings.template.commandName")}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-stone">/</span>
                <input
                  ref={nameInputRef}
                  id="template-name-input"
                  type="text"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="my-template"
                  maxLength={TEMPLATE_NAME_MAX}
                  className="flex-1 px-3 py-2 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
                />
              </div>
              {nameError && (
                <p className="mt-1 text-[11px] text-coral">{nameError}</p>
              )}
            </div>

            <div>
              <label
                className="block text-[12px] text-stone mb-1.5"
                htmlFor="template-body-input"
              >
                {t("settings.template.body")}
              </label>
              <textarea
                id="template-body-input"
                value={editBody}
                onChange={(e) => {
                  setEditBody(e.target.value);
                  setBodyError(null);
                }}
                placeholder={"# My Template\n\nContent here...\n\n{{cursor}}"}
                rows={6}
                maxLength={TEMPLATE_BODY_MAX}
                className="w-full px-3 py-2 bg-bg border border-line rounded-lg text-[13px] text-ink font-mono placeholder:text-stone/70 focus:outline-none focus:border-coral/50 resize-y"
              />
              {bodyError && (
                <p className="mt-1 text-[11px] text-coral">{bodyError}</p>
              )}
            </div>

            <div className="p-2.5 bg-bg/50 rounded-lg border border-line/50">
              <p className="text-[11px] text-stone mb-1 font-medium">
                {t("settings.template.placeholders")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "{{date}}",
                  "{{time}}",
                  "{{day}}",
                  "{{datetime}}",
                  "{{isodate}}",
                  "{{cursor}}",
                ].map((ph) => (
                  <code
                    key={ph}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-line/50 text-ink font-mono"
                  >
                    {ph}
                  </code>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-stone">
                <span className="text-ink">{"{{cursor}}"}</span>{" "}
                {t("settings.template.cursorHint")}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={saveEdit}
                className="px-3 py-2 text-[12px] font-medium text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors"
              >
                {editingIndex === -1 ? "Add" : t("common.save")}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-2 text-[12px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
              >
                {t("common.cancelAction")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startAdd}
            className="w-full px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
          >
            <span className="text-lg">+</span>
            <span>{t("settings.template.add")}</span>
          </button>
        )}

        <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
          <p className="text-[12px] text-stone leading-relaxed">
            {t("settings.template.badgeHint")}
          </p>
        </div>
      </div>
      {confirmingDelete !== null && (
        <ConfirmDialog
          title={t("settings.template.deleteConfirm")}
          description={`This will remove /${templates[confirmingDelete]?.name} from your slash commands.`}
          onConfirm={() => confirmDelete(confirmingDelete)}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
      {toast && <SettingsToast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}

export default function SettingsContent({
  activeTab,
  settings,
  folders,
  onSettingsChange,
  resolvedNotesDir,
  captureStreakLabel,
  captureStreakDays,
  isRefreshingStreak,
  onRefreshCaptureStreak,
  onThisDayMessage,
  onThisDayPreview,
  onThisDayDate,
  onThisDayFolder,
  isCheckingOnThisDay,
  onCheckOnThisDay,
  gitSyncStatus,
  isPreparingGitRepo,
  isSyncingGitNow,
  isOpeningGitRemote,
  onPrepareGitRepository,
  onSyncGitNow,
  onOpenGitRemote,
  onTabChange,
}: SettingsContentProps) {
  const { t } = useTranslation();
  const [showGitAdvanced, setShowGitAdvanced] = useState(false);
  const remoteWebUrl = remoteToWebUrl(settings.git_sharing.remote_url);
  const notesDir = settings.notes_directory
    ? settings.use_directory_as_root
      ? settings.notes_directory
      : `${settings.notes_directory}/Stik`
    : resolvedNotesDir || "~/Documents/Stik";
  const linkedRepoPath =
    settings.git_sharing.repository_layout === "stik_root"
      ? notesDir
      : `${notesDir}/${settings.git_sharing.shared_folder || "Inbox"}`;

  const updateMapping = (index: number, updates: Partial<ShortcutMapping>) => {
    const newMappings = [...settings.shortcut_mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const removeMapping = (index: number) => {
    const newMappings = settings.shortcut_mappings.filter(
      (_, i) => i !== index,
    );
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const systemShortcutValues = Object.values(settings.system_shortcuts ?? {});

  const addMapping = () => {
    const usedShortcuts = settings.shortcut_mappings.map((m) => m.shortcut);
    let defaultShortcut = "Cmd+Shift+S";

    const letters = "ABCDEFGHIJKLNOQRTUVWXYZ".split("");
    for (const letter of letters) {
      const shortcut = `Cmd+Shift+${letter}`;
      if (
        !usedShortcuts.includes(shortcut) &&
        !systemShortcutValues.includes(shortcut)
      ) {
        defaultShortcut = shortcut;
        break;
      }
    }

    onSettingsChange({
      ...settings,
      shortcut_mappings: [
        ...settings.shortcut_mappings,
        {
          shortcut: defaultShortcut,
          folder: folders[0] || "Inbox",
          enabled: true,
        },
      ],
    });
  };

  const getExistingShortcuts = (excludeIndex?: number) => {
    return settings.shortcut_mappings
      .filter((_, i) => i !== excludeIndex)
      .map((m) => m.shortcut);
  };

  const updateGitSharing = (updates: Partial<StikSettings["git_sharing"]>) => {
    onSettingsChange({
      ...settings,
      git_sharing: {
        ...settings.git_sharing,
        ...updates,
      },
    });
  };

  return (
    <div>
      {activeTab === "appearance" && (
        <AppearanceSection
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      )}

      {activeTab === "shortcuts" && (
        <div>
          <p className="mb-4 text-[12px] text-stone">
            {t("settings.shortcut.intro")}
          </p>

          <div className="space-y-2">
            {settings.shortcut_mappings.map((mapping, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-2 bg-line/30 rounded-xl border border-line/50"
              >
                <div className="flex-1 min-w-0">
                  <ShortcutRecorder
                    value={mapping.shortcut}
                    onChange={(value) =>
                      updateMapping(index, { shortcut: value })
                    }
                    reservedShortcuts={systemShortcutValues}
                    existingShortcuts={getExistingShortcuts(index)}
                  />
                </div>
                <span className="text-coral text-sm">→</span>
                <div className="flex-1">
                  <Dropdown
                    value={mapping.folder}
                    options={folders.map((f) => ({ value: f, label: f }))}
                    onChange={(value) =>
                      updateMapping(index, { folder: value })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMapping(index)}
                  className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-coral-light text-stone hover:text-coral transition-colors"
                  title={t("settings.shortcut.remove")}
                >
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
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addMapping}
            className="mt-4 w-full px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
          >
            <span className="text-lg">+</span>
            <span>{t("settings.shortcut.add")}</span>
          </button>

          <div className="mt-6">
            <p className="text-[12px] text-stone mb-3">{t("settings.shortcut.system")}</p>
            <div className="space-y-2">
              {SYSTEM_SHORTCUT_ACTIONS.map((action) => {
                const currentShortcut =
                  settings.system_shortcuts?.[action] ??
                  SYSTEM_SHORTCUT_DEFAULTS[action];
                const isDefault =
                  currentShortcut === SYSTEM_SHORTCUT_DEFAULTS[action];
                // Other system shortcuts + all folder shortcuts are reserved for this recorder
                const otherSystemShortcuts = SYSTEM_SHORTCUT_ACTIONS.filter(
                  (a) => a !== action,
                ).map(
                  (a) =>
                    settings.system_shortcuts?.[a] ??
                    SYSTEM_SHORTCUT_DEFAULTS[a],
                );
                const folderShortcuts = settings.shortcut_mappings.map(
                  (m) => m.shortcut,
                );

                return (
                  <div
                    key={action}
                    className="flex items-center gap-2 px-3 py-2 bg-line/30 rounded-xl border border-line/50"
                  >
                    <span className="w-[70px] shrink-0 text-[12px] text-ink font-medium">
                      {t(SYSTEM_SHORTCUT_LABEL_KEYS[action as SystemAction])}
                    </span>
                    <div className="flex-1 min-w-0">
                      <ShortcutRecorder
                        value={currentShortcut}
                        onChange={(value) =>
                          onSettingsChange({
                            ...settings,
                            system_shortcuts: {
                              ...settings.system_shortcuts,
                              [action]: value,
                            },
                          })
                        }
                        reservedShortcuts={otherSystemShortcuts}
                        existingShortcuts={folderShortcuts}
                      />
                    </div>
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() =>
                          onSettingsChange({
                            ...settings,
                            system_shortcuts: {
                              ...settings.system_shortcuts,
                              [action]:
                                SYSTEM_SHORTCUT_DEFAULTS[
                                  action as SystemAction
                                ],
                            },
                          })
                        }
                        className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-coral-light text-stone hover:text-coral transition-colors"
                        title={t("settings.shortcut.resetDefault")}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {SYSTEM_SHORTCUT_ACTIONS.some(
              (a) =>
                (settings.system_shortcuts?.[a] ??
                  SYSTEM_SHORTCUT_DEFAULTS[a]) !== SYSTEM_SHORTCUT_DEFAULTS[a],
            ) && (
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    system_shortcuts: { ...SYSTEM_SHORTCUT_DEFAULTS },
                  })
                }
                className="mt-2 text-[11px] text-coral hover:underline"
              >
                {t("settings.shortcut.resetAll")}
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === "folders" && (
        <div className="space-y-4">
          {/* iCloud Drive sync */}
          <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">{t("settings.icloud.title")}</p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.icloud.describe")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const newICloud = {
                  ...settings.icloud,
                  enabled: !settings.icloud?.enabled,
                };
                onSettingsChange({ ...settings, icloud: newICloud });
              }}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                settings.icloud?.enabled ? "bg-coral" : "bg-line"
              }`}
              title={t("settings.icloud.toggle")}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  settings.icloud?.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          {settings.icloud?.enabled && (
            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
              <p className="text-[12px] text-stone leading-relaxed">
                {t("settings.icloud.detail")}
              </p>
              {!settings.icloud?.migrated && (
                <button
                  type="button"
                  onClick={async () => {
                    const { invoke } = await import("@tauri-apps/api/core");
                    try {
                      const result = await invoke<{
                        files_copied: number;
                        errors: string[];
                      }>("icloud_migrate_notes");
                      if (result.files_copied > 0) {
                        onSettingsChange({
                          ...settings,
                          icloud: { ...settings.icloud, migrated: true },
                        });
                      }
                    } catch (e) {
                      console.error("Migration failed:", e);
                    }
                  }}
                  className="mt-2 px-3 py-1.5 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors"
                >
                  {t("settings.icloud.copyExisting")}
                </button>
              )}
            </div>
          )}

          {/* Notes directory (hidden when iCloud is active) */}
          {!settings.icloud?.enabled && (
            <div>
              <p className="text-[12px] text-stone mb-1.5">{t("settings.notesDirectory")}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] font-mono truncate text-ink">
                  {notesDir}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      title: t("settings.notesDirectory.choose"),
                      defaultPath:
                        settings.notes_directory ||
                        resolvedNotesDir ||
                        undefined,
                    });
                    if (selected) {
                      onSettingsChange({
                        ...settings,
                        notes_directory: selected,
                      });
                    }
                  }}
                  className="px-3 py-2.5 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors whitespace-nowrap"
                >
                  {t("common.browse")}
                </button>
                {settings.notes_directory && (
                  <button
                    type="button"
                    onClick={() =>
                      onSettingsChange({ ...settings, notes_directory: "" })
                    }
                    className="px-3 py-2.5 text-[12px] text-stone hover:text-coral border border-line rounded-lg hover:border-coral/30 transition-colors whitespace-nowrap"
                  >
                    {t("common.reset")}
                  </button>
                )}
              </div>
              {!settings.use_directory_as_root && (
                <p className="mt-1.5 text-[12px] text-stone leading-relaxed">
                  {t("settings.notesDirectory.stikFolderNote")}
                </p>
              )}
              {settings.notes_directory && (
                <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.use_directory_as_root ?? false}
                    onChange={(e) =>
                      onSettingsChange({
                        ...settings,
                        use_directory_as_root: e.target.checked,
                      })
                    }
                    className="rounded border-line"
                  />
                  <span className="text-[12px] text-ink">
                    {t("settings.notesDirectory.asRoot")}
                  </span>
                </label>
              )}
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.simple_filenames ?? false}
                onChange={(e) =>
                  onSettingsChange({
                    ...settings,
                    simple_filenames: e.target.checked,
                  })
                }
                className="rounded border-line"
              />
              <span className="text-[12px] text-ink">
                {t("settings.simpleFilenames")}
              </span>
            </label>
            <p className="mt-1.5 text-[12px] text-stone leading-relaxed">
              {t("settings.simpleFilenames.note")}
            </p>
          </div>

          <div>
            <p className="text-[12px] text-stone mb-1.5">{t("settings.defaultFolder")}</p>
            <div className="max-w-[360px]">
              <Dropdown
                value={settings.default_folder}
                options={folders.map((f) => ({ value: f, label: f }))}
                onChange={(value) =>
                  onSettingsChange({ ...settings, default_folder: value })
                }
              />
            </div>
            <p className="mt-1.5 text-[12px] text-stone leading-relaxed">
              {t("settings.defaultFolder.describe")}
            </p>
          </div>

          {!settings.icloud?.enabled &&
          settings.git_sharing.enabled &&
          gitSyncStatus?.repo_initialized ? (
            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
              <p className="text-[12px] text-stone leading-relaxed">
                <span className="text-ink font-medium">
                  {settings.git_sharing.repository_layout === "stik_root"
                    ? t("settings.notesDirectory.allFolders")
                    : settings.git_sharing.shared_folder || "Inbox"}
                </span>{" "}
                {t("settings.git.syncedViaGit")}{" "}
                {onTabChange && (
                  <button
                    type="button"
                    onClick={() => onTabChange("git")}
                    className="text-coral hover:underline"
                  >
                    {t("settings.git.openGitTab")}
                  </button>
                )}
              </p>
            </div>
          ) : !settings.icloud?.enabled ? (
            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
              <p className="text-[12px] text-stone leading-relaxed">
                {t("settings.syncTip", { dir: notesDir })}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === "editor" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">{t("settings.fontSize")}</p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.fontSize.describe")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    font_size: Math.max((settings.font_size ?? 14) - 1, 12),
                  })
                }
                disabled={(settings.font_size ?? 14) <= 12}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-line text-[14px] text-ink hover:bg-line/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="w-8 text-center text-[13px] font-mono text-ink tabular-nums">
                {settings.font_size ?? 14}
              </span>
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    font_size: Math.min((settings.font_size ?? 14) + 1, 48),
                  })
                }
                disabled={(settings.font_size ?? 14) >= 48}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-line text-[14px] text-ink hover:bg-line/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">{t("settings.vimMode")}</p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.vimMode.describe")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  vim_mode_enabled: !settings.vim_mode_enabled,
                })
              }
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                settings.vim_mode_enabled ? "bg-coral" : "bg-line"
              }`}
              title={t("settings.vimMode.toggle")}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  settings.vim_mode_enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          <div className="p-4 bg-line/30 rounded-xl border border-line/50">
            <p className="text-[13px] text-ink font-medium mb-1">
              {t("settings.textDirection.title")}
            </p>
            <p className="text-[12px] text-stone leading-relaxed mb-3">
              {t("settings.textDirection.describe")}
            </p>
            <div className="max-w-[240px]">
              <Dropdown
                value={settings.text_direction || "auto"}
                options={[
                  { value: "auto", label: t("settings.textDirection.auto") },
                  { value: "ltr", label: t("settings.textDirection.ltr") },
                  { value: "rtl", label: t("settings.textDirection.rtl") },
                ]}
                onChange={(value) =>
                  onSettingsChange({ ...settings, text_direction: value })
                }
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">{t("settings.hideDockIcon")}</p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.hideDockIcon.describe")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  hide_dock_icon: !settings.hide_dock_icon,
                })
              }
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                settings.hide_dock_icon ? "bg-coral" : "bg-line"
              }`}
              title={t("settings.hideDockIcon.toggle")}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  settings.hide_dock_icon ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">
                {t("settings.hideTrayIcon.title")}
              </p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.hideTrayIcon.describe")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  hide_tray_icon: !settings.hide_tray_icon,
                })
              }
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                settings.hide_tray_icon ? "bg-coral" : "bg-line"
              }`}
              title={t("settings.hideTrayIcon.toggle")}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  settings.hide_tray_icon ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
            <p className="text-[13px] text-ink font-medium">{t("settings.vim.quickReference")}</p>
            <div className="text-[12px] text-stone leading-relaxed space-y-1">
              <p>
                <span className="text-ink font-medium">{t("settings.vim.movement")}</span> — h j k
                l, w b (word), 0 $ (line), gg G (document)
              </p>
              <p>
                <span className="text-ink font-medium">{t("settings.vim.insert")}</span> — i
                (before), a (after), A (end of line), o O (new line)
              </p>
              <p>
                <span className="text-ink font-medium">{t("settings.vim.edit")}</span> — x dd cc cw
                C, yy p, diw ciw, ci/di + &quot; &apos; ( {"{"}
              </p>
              <p>
                <span className="text-ink font-medium">{t("settings.vim.visual")}</span> — v
                (chars), V (lines), d x (delete), y (yank), c (change)
              </p>
              <p>
                <span className="text-ink font-medium">{t("settings.vim.undo")}</span> — u, Ctrl+r
                (redo), . (repeat)
              </p>
              <p>
                <span className="text-ink font-medium">{t("settings.vim.commands")}</span> — :wq
                (save &amp; close), :q! (discard &amp; close)
              </p>
            </div>
          </div>

          <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl space-y-1">
            <p className="text-[12px] font-semibold text-ink">{t("settings.vim.howToClose")}</p>
            <p className="text-[12px] text-stone leading-relaxed">
              {t("settings.vim.commandBar")}
            </p>
          </div>
        </div>
      )}

      {activeTab === "templates" && (
        <TemplatesSection
          templates={settings.custom_templates ?? []}
          onChange={(templates) =>
            onSettingsChange({ ...settings, custom_templates: templates })
          }
        />
      )}

      {activeTab === "git" && (
        <div className="space-y-3">
          {settings.icloud?.enabled && (
            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl mb-2">
              <p className="text-[12px] text-stone leading-relaxed">
                {t("settings.git.disabledByICloud")}
              </p>
            </div>
          )}

          {/* Enable toggle */}
          <label
            className={`flex items-center justify-between gap-3 ${settings.icloud?.enabled ? "opacity-50 pointer-events-none" : ""}`}
          >
            <span className="text-[13px] text-ink font-medium">
              {t("settings.git.enable")}
            </span>
            <button
              type="button"
              onClick={() =>
                updateGitSharing({ enabled: !settings.git_sharing.enabled })
              }
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.git_sharing.enabled ? "bg-coral" : "bg-line"
              }`}
              title={t("settings.git.toggle")}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  settings.git_sharing.enabled
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </label>

          {/* Remote URL — primary field */}
          <div>
            <label
              className="block text-[12px] text-stone mb-1.5"
              htmlFor="git-remote-url-input"
            >
              {t("settings.git.remoteUrl")}
            </label>
            <input
              id="git-remote-url-input"
              type="text"
              value={settings.git_sharing.remote_url}
              onChange={(e) => updateGitSharing({ remote_url: e.target.value })}
              placeholder="https://github.com/your-org/stik-notes.git"
              className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
            />
          </div>

          {/* Shared folder — only for folder_root layout */}
          {settings.git_sharing.repository_layout === "folder_root" ? (
            <div>
              <p className="text-[12px] text-stone mb-1.5">{t("settings.git.sharedFolder")}</p>
              <Dropdown
                value={settings.git_sharing.shared_folder}
                options={folders.map((f) => ({ value: f, label: f }))}
                onChange={(value) => updateGitSharing({ shared_folder: value })}
              />
            </div>
          ) : (
            <p className="text-[12px] text-stone leading-relaxed">
              {t("settings.git.rootLayoutNote")}
              <span className="mx-1 text-ink">Inbox/</span>
              <span className="text-ink">Work/</span>
              <span className="mx-1 text-ink">Ideas/</span>.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onPrepareGitRepository}
              disabled={isPreparingGitRepo || isSyncingGitNow}
              className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
            >
              {isPreparingGitRepo ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="animate-spin">↻</span>
                  <span>{t("common.linking")}</span>
                </span>
              ) : (
                t("settings.git.linkRepo")
              )}
            </button>
            <button
              type="button"
              onClick={onSyncGitNow}
              disabled={isSyncingGitNow}
              className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
            >
              {isSyncingGitNow ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="animate-spin">↻</span>
                  <span>{t("common.syncing")}</span>
                </span>
              ) : (
                t("settings.git.syncNow")
              )}
            </button>
            {remoteWebUrl && (
              <button
                type="button"
                onClick={onOpenGitRemote}
                disabled={isOpeningGitRemote}
                className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors"
              >
                {isOpeningGitRemote ? t("common.opening") : t("settings.git.openRemote")}
              </button>
            )}
          </div>

          {/* Status */}
          <div className="text-[12px] text-stone leading-relaxed space-y-0.5">
            <p>
              
              {t("settings.git.status")}{" "}
              <span className="text-ink font-medium">
                {gitSyncStatus?.repo_initialized
                  ? t("settings.git.linked")
                  : t("settings.git.notLinked")}
              </span>
            </p>
            {gitSyncStatus?.last_sync_at && (
              <p>
                
                {t("settings.git.lastSync")}{" "}
                {new Date(gitSyncStatus.last_sync_at).toLocaleString()}
              </p>
            )}
            {gitSyncStatus?.last_error && (
              <p className="text-coral">
                
                {t("settings.git.lastError")} {gitSyncStatus.last_error}
              </p>
            )}
            <p>{t("settings.git.autoSyncNote")}</p>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowGitAdvanced(!showGitAdvanced)}
            className="flex items-center gap-1 text-[12px] text-stone hover:text-ink transition-colors"
          >
            <span>{showGitAdvanced ? "▾" : "▸"}</span>
            <span>{t("settings.git.advanced")}</span>
          </button>

          {showGitAdvanced && (
            <div className="space-y-3 pl-3 border-l-2 border-line">
              <div>
                <p className="text-[12px] text-stone mb-1.5">
                  {t("settings.git.layout")}
                </p>
                <Dropdown
                  value={settings.git_sharing.repository_layout}
                  options={[
                    {
                      value: "folder_root",
                      label: t("settings.git.layoutSelected"),
                    },
                    {
                      value: "stik_root",
                      label: t("settings.git.layoutWhole"),
                    },
                  ]}
                  onChange={(value) =>
                    updateGitSharing({
                      repository_layout: value as "folder_root" | "stik_root",
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-[1fr_130px] gap-3">
                <div>
                  <label
                    className="block text-[12px] text-stone mb-1.5"
                    htmlFor="git-branch-input"
                  >
                    {t("settings.git.branch")}
                  </label>
                  <input
                    id="git-branch-input"
                    type="text"
                    value={settings.git_sharing.branch}
                    onChange={(e) =>
                      updateGitSharing({ branch: e.target.value })
                    }
                    placeholder="main"
                    className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
                  />
                </div>
                <div>
                  <label
                    className="block text-[12px] text-stone mb-1.5"
                    htmlFor="git-pull-interval-input"
                  >
                    {t("settings.git.pullInterval")}
                  </label>
                  <input
                    id="git-pull-interval-input"
                    type="number"
                    min={60}
                    step={30}
                    value={settings.git_sharing.sync_interval_seconds}
                    onChange={(e) => {
                      const parsed = Number.parseInt(
                        e.target.value || "300",
                        10,
                      );
                      updateGitSharing({
                        sync_interval_seconds: Number.isFinite(parsed)
                          ? Math.max(parsed, 60)
                          : 300,
                      });
                    }}
                    className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-coral/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* GitHub credentials tip */}
          <div className="p-3 bg-coral-light/35 border border-coral/20 rounded-xl space-y-1">
            <p className="text-[12px] font-semibold text-ink">
              {t("settings.git.accountSetup")}
            </p>
            <p className="text-[12px] text-stone leading-relaxed">
              {t("settings.git.credentials")}
            </p>
            <p className="text-[12px] text-stone leading-relaxed">
              {t("settings.git.authHint")}
            </p>
            <code className="block px-2.5 py-2 text-[11px] rounded-lg bg-bg border border-line text-ink break-all">
              git -C "{linkedRepoPath}" push
            </code>
          </div>
        </div>
      )}

      {activeTab === "ai" && (
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
            <div>
              <p className="text-[13px] text-ink font-medium">
                {t("settings.ai.enable")}
              </p>
              <p className="mt-1 text-[12px] text-stone leading-relaxed">
                {t("settings.ai.describe")}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  ai_features_enabled: !settings.ai_features_enabled,
                })
              }
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                settings.ai_features_enabled ? "bg-coral" : "bg-line"
              }`}
              title={t("settings.ai.toggle")}
            >
              <span
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                  settings.ai_features_enabled
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </label>

          <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
            <p className="text-[13px] text-ink font-medium">{t("settings.ai.howItWorks")}</p>
            <ul className="text-[12px] text-stone leading-relaxed space-y-1.5">
              <li>
                <span className="text-ink font-medium">
                  {t("settings.ai.semanticSearch")}
                </span>{" "}
                {t("settings.ai.semanticSearchDesc")}
              </li>
              <li>
                <span className="text-ink font-medium">
                  {t("settings.ai.folderSuggestions")}
                </span>{" "}
                {t("settings.ai.folderSuggestionsDesc")}
              </li>
              <li>
                <span className="text-ink font-medium">
                  {t("settings.ai.noteEmbeddings")}
                </span>{" "}
                {t("settings.ai.noteEmbeddingsDesc")}
              </li>
            </ul>
          </div>

          <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl space-y-1">
            <p className="text-[12px] font-semibold text-ink">{t("settings.ai.privacy")}</p>
            <p className="text-[12px] text-stone leading-relaxed">
              {t("settings.ai.privacyNote")}
            </p>
          </div>

          {!settings.ai_features_enabled && (
            <p className="text-[12px] text-stone text-center">
              {t("settings.ai.restartHint")}
            </p>
          )}
        </div>
      )}

      {activeTab === "dictation" && (
        <DictationSettingsPanel
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      )}

      {activeTab === "insights" && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-coral">↻</span>
              <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                {t("settings.streak.title")}
              </h3>
            </div>
            <div className="p-4 bg-line/30 rounded-xl border border-line/50 flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {captureStreakLabel}
                </p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  {t("settings.streak.describe")}
                  {captureStreakDays === null
                    ? ` ${t("settings.streak.unavailableHint")}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshCaptureStreak}
                disabled={isRefreshingStreak}
                className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
              >
                {isRefreshingStreak ? t("common.refreshing") : t("common.refresh")}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-coral">☼</span>
              <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                {t("settings.onThisDay.title")}
              </h3>
            </div>
            <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
              <p className="text-[14px] font-semibold text-ink">
                {onThisDayMessage}
              </p>
              {(onThisDayDate || onThisDayFolder) && (
                <p className="text-[12px] text-stone">
                  {onThisDayFolder || t("settings.onThisDay.folderUnknown")} •{" "}
                  {onThisDayDate || t("settings.onThisDay.dateUnknown")}
                </p>
              )}
              {onThisDayPreview && (
                <p className="text-[12px] text-stone leading-relaxed">
                  {onThisDayPreview}
                </p>
              )}
              <button
                type="button"
                onClick={onCheckOnThisDay}
                disabled={isCheckingOnThisDay}
                className="mt-2 px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
              >
                {isCheckingOnThisDay ? t("common.checking") : t("common.checkNow")}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "privacy" && (
        <PrivacySection
          settings={settings}
          onSettingsChange={onSettingsChange}
        />
      )}
    </div>
  );
}

// ── Dictation settings panel ───────────────────────────────────────

const DICTATION_LANGUAGES: { code: string | null; labelKey: TranslationKey }[] = [
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

function DictationSettingsPanel({
  settings,
  onSettingsChange,
}: {
  settings: StikSettings;
  onSettingsChange: (s: StikSettings) => void;
}) {
  const { t } = useTranslation();
  const [models, setModels] = useState<DictationModelInfo[]>([]);
  const [status, setStatus] = useState<DictationStatus | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadBytesDone, setDownloadBytesDone] = useState(0);
  const [downloadBytesTotal, setDownloadBytesTotal] = useState(0);
  // The model we're in the process of loading into memory. Used to show
  // a "Loading…" state on the Use-this-model button and to block other
  // buttons while a load is in flight.
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Elapsed seconds since the load started — surfaced in the UI so the
  // user can tell it's making progress vs frozen. Turbo first-load is
  // legitimately ~2 minutes (CoreML compilation + ANE warmup).
  const [loadElapsed, setLoadElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tick the elapsed counter while a load is in flight
  useEffect(() => {
    if (!loadingId) {
      setLoadElapsed(0);
      return;
    }
    const started = Date.now();
    const interval = window.setInterval(() => {
      setLoadElapsed(Math.floor((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [loadingId]);

  const dictation = settings.dictation ?? {
    active_model: null,
    active_language: null,
    enabled: true,
  };

  const refresh = useCallback(async () => {
    try {
      const [list, stat] = await Promise.all([
        invoke<DictationModelInfo[]>("dictation_list_models"),
        invoke<DictationStatus>("dictation_get_status"),
      ]);
      setModels(list);
      setStatus(stat);
    } catch (e) {
      setErrorMsg(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to download lifecycle events only. Model loading is now
  // fully synchronous from the frontend's perspective: the invoke for
  // `dictation_set_active_model` blocks until the sidecar finishes
  // loading (or errors), so there's no need for separate lifecycle
  // events on that path.
  useEffect(() => {
    const u1 = listen<DictationDownloadProgress>(
      "dictation:download_progress",
      (e) => {
        setDownloadProgress(e.payload.progress);
        setDownloadBytesDone(e.payload.bytes_done);
        setDownloadBytesTotal(e.payload.bytes_total);
      },
    );
    const u2 = listen<{ model_id: string }>(
      "dictation:download_complete",
      async () => {
        setDownloadingId(null);
        await refresh();
      },
    );
    const u3 = listen<{ model_id: string; message: string }>(
      "dictation:download_error",
      (e) => {
        setDownloadingId(null);
        setErrorMsg(e.payload.message);
      },
    );
    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
      u3.then((fn) => fn());
    };
  }, [refresh]);

  const startDownload = useCallback(async (modelId: string) => {
    setErrorMsg(null);
    setDownloadingId(modelId);
    setDownloadProgress(0);
    setDownloadBytesDone(0);
    setDownloadBytesTotal(0);
    try {
      await invoke("dictation_download_model", { modelId });
    } catch (e) {
      setDownloadingId(null);
      setErrorMsg(String(e));
    }
  }, []);

  const cancelDownload = useCallback(async () => {
    try {
      await invoke("dictation_cancel_download");
    } catch {
      /* ignore */
    }
    setDownloadingId(null);
  }, []);

  const setActive = useCallback(
    async (modelId: string) => {
      setErrorMsg(null);
      setLoadingId(modelId);
      // The invoke blocks until the sidecar finishes loading the model
      // (or times out at 180 s). On success we persist the choice and
      // refresh the panel so the ACTIVE badge moves to the new model.
      try {
        await invoke("dictation_set_active_model", { modelId });
        onSettingsChange({
          ...settings,
          dictation: { ...dictation, active_model: modelId },
        });
        await refresh();
      } catch (e) {
        setErrorMsg(String(e));
      } finally {
        setLoadingId(null);
      }
    },
    [settings, dictation, onSettingsChange, refresh],
  );

  const deleteModel = useCallback(
    async (modelId: string) => {
      try {
        await invoke("dictation_delete_model", { modelId });
        if (dictation.active_model === modelId) {
          onSettingsChange({
            ...settings,
            dictation: { ...dictation, active_model: null },
          });
        }
        await refresh();
      } catch (e) {
        setErrorMsg(String(e));
      }
    },
    [settings, dictation, onSettingsChange, refresh],
  );

  return (
    <div className="space-y-4">
      <div className="p-4 bg-line/30 rounded-xl border border-line/50">
        <p className="text-[13px] text-ink font-medium">{t("dictation.onDevice")}</p>
        <p className="mt-1 text-[12px] text-stone leading-relaxed">
          {t("dictation.whisperLocal")}
        </p>
      </div>

      {/* Language */}
      <div>
        <label className="block text-[12px] text-stone mb-1.5">
          {t("dictation.language")}
        </label>
        <Dropdown
          value={dictation.active_language ?? ""}
          options={DICTATION_LANGUAGES.map((l) => ({
            value: l.code ?? "",
            label: t(l.labelKey),
          }))}
          onChange={(value) =>
            onSettingsChange({
              ...settings,
              dictation: {
                ...dictation,
                active_language: value || null,
              },
            })
          }
          placeholder={t("dictation.selectLanguage")}
        />
        <p className="mt-1.5 text-[11px] text-stone">
          {t("dictation.languageDescribe")}
        </p>
      </div>

      {/* Model manager */}
      <div>
        <label className="block text-[12px] text-stone mb-1.5">{t("dictation.models")}</label>
        <div className="space-y-2">
          {models.map((m) => {
            const isActive = status?.active_model === m.id;
            const isDownloading = downloadingId === m.id;
            return (
              <div
                key={m.id}
                className={`p-3 rounded-lg border ${
                  isActive
                    ? "border-coral bg-coral-light/20"
                    : "border-line bg-line/10"
                }`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] text-ink font-medium">
                      {m.label}
                    </span>
                    {isActive && (
                      <span className="text-[10px] text-coral uppercase tracking-wide">
                        {t("common.active")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-stone">{m.size_mb} MB</span>
                </div>
                <p className="text-[11px] text-stone leading-snug mb-2">
                  {m.description}
                </p>

                {isDownloading ? (
                  <div>
                    <div className="w-full h-1.5 bg-line/30 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full bg-coral transition-all"
                        style={{
                          width: `${Math.round(downloadProgress * 100)}%`,
                        }}
                      />
                    </div>
                    <div
                      className="flex items-center justify-between text-[11px] text-stone"
                      role="status"
                      aria-live="polite"
                    >
                      <span>
                        {(() => {
                          const pct = Math.round(downloadProgress * 100);
                          if (downloadBytesTotal > 1_000_000) {
                            return `${pct}% — ${(
                              downloadBytesDone / 1_000_000
                            ).toFixed(1)} / ${(
                              downloadBytesTotal / 1_000_000
                            ).toFixed(1)} MB`;
                          }
                          return downloadProgress > 0
                            ? `${pct}%`
                            : t("dictation.connecting");
                        })()}
                      </span>
                      <button
                        type="button"
                        onClick={cancelDownload}
                        className="text-coral hover:underline"
                      >
                        {t("common.cancelAction")}
                      </button>
                    </div>
                  </div>
                ) : m.downloaded ? (
                  <div>
                    <div className="flex gap-2">
                      {!isActive &&
                        (loadingId === m.id ? (
                          <button
                            type="button"
                            disabled
                            className="px-3 py-1 text-[11px] bg-coral/60 text-white rounded-md cursor-wait"
                          >
                            
                            {t("common.loadingEllipsis")} {loadElapsed}s
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActive(m.id)}
                            disabled={loadingId !== null}
                            className="px-3 py-1 text-[11px] bg-coral text-white rounded-md hover:bg-coral/90 disabled:opacity-50"
                          >
                            {t("dictation.useModel")}
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => deleteModel(m.id)}
                        disabled={loadingId !== null}
                        className="px-3 py-1 text-[11px] text-stone border border-line rounded-md hover:text-coral hover:border-coral/30 disabled:opacity-50"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                    {loadingId === m.id && (
                      <p className="mt-1.5 text-[10px] text-stone leading-snug">
                        {m.size_mb >= 500
                          ? t("dictation.firstLoadLong")
                          : t("dictation.firstLoadMedium")}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startDownload(m.id)}
                    disabled={downloadingId !== null}
                    className="px-3 py-1 text-[11px] bg-coral text-white rounded-md hover:bg-coral/90 disabled:opacity-50"
                  >
                    {t("common.download")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-coral-light/30 border border-coral/30 rounded-lg">
          <p className="text-[11px] text-coral break-words">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
