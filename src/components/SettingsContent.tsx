import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ShortcutRecorder from "./ShortcutRecorder";
import type { CustomTemplate, GitSyncStatus, ShortcutMapping, StikSettings } from "@/types";
import { BUILTIN_COMMAND_NAMES } from "@/extensions/cm-slash-commands";
import ConfirmDialog from "./ConfirmDialog";
import {
  SYSTEM_SHORTCUT_ACTIONS,
  SYSTEM_SHORTCUT_DEFAULTS,
  SYSTEM_SHORTCUT_LABELS,
  type SystemAction,
} from "@/utils/systemShortcuts";

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

export function Dropdown({ value, options, onChange, placeholder }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allOptions = options.some((o) => o.value === value)
    ? options
    : [{ value, label: value }, ...options];

  const selectedOption = allOptions.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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
          {selectedOption?.label || placeholder || "Select..."}
        </span>
        <span className={`text-[8px] text-stone transition-transform ${isOpen ? "rotate-180" : ""}`}>
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

export type SettingsTab = "shortcuts" | "folders" | "editor" | "templates" | "git" | "ai" | "insights" | "privacy";

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
}

function SettingsToast({ message, onDone }: { message: string; onDone: () => void }) {
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
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
  }, [loadDeviceId]);

  const copyDeviceId = () => {
    if (!deviceId) return;
    navigator.clipboard.writeText(deviceId);
    setToast("Device ID copied");
  };

  return (
    <>
    <div className="space-y-4">
      <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
        <div>
          <p className="text-[13px] text-ink font-medium">Share anonymous usage data</p>
          <p className="mt-1 text-[12px] text-stone leading-relaxed">
            Help improve Stik by sharing anonymous usage statistics.
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
          title="Toggle anonymous analytics"
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
          <p className="text-[13px] text-ink font-medium">Automatic updates</p>
          <p className="mt-1 text-[12px] text-stone leading-relaxed">
            Check for and install updates silently in the background.
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
          title="Toggle automatic updates"
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
          <p className="text-[13px] text-ink font-medium mb-2">What we collect</p>
          <ul className="text-[12px] text-stone leading-relaxed space-y-1">
            <li>App opens (daily active usage)</li>
            <li>Device type (macOS version, CPU architecture)</li>
            <li>Screen resolution and app version</li>
            <li>Anonymous device identifier</li>
          </ul>
        </div>
        <div>
          <p className="text-[13px] text-ink font-medium mb-2">What we NEVER collect</p>
          <ul className="text-[12px] text-stone leading-relaxed space-y-1">
            <li>Your notes, titles, or folder names</li>
            <li>File paths or personal information</li>
            <li>Anything that could identify you</li>
          </ul>
        </div>
      </div>

      {deviceId && (
        <div className="p-4 bg-line/30 rounded-xl border border-line/50">
          <p className="text-[12px] text-stone mb-2">Your device ID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2.5 py-2 text-[11px] rounded-lg bg-bg border border-line text-ink font-mono truncate">
              {deviceId}
            </code>
            <button
              type="button"
              onClick={copyDeviceId}
              className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors whitespace-nowrap"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-[11px] text-stone">
            This random identifier is not linked to your identity.
          </p>
        </div>
      )}

      <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
        <p className="text-[12px] text-stone leading-relaxed">
          Analytics are sent to PostHog using a write-only key. Stik is open-source — you
          can verify exactly what is collected in the source code.
        </p>
      </div>
    </div>
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
  if (name.length < TEMPLATE_NAME_MIN) return `Name must be at least ${TEMPLATE_NAME_MIN} characters`;
  if (name.length > TEMPLATE_NAME_MAX) return `Name must be at most ${TEMPLATE_NAME_MAX} characters`;
  if (!TEMPLATE_NAME_RE.test(name)) return "Lowercase letters, numbers, and hyphens only (must start with a letter)";
  if (BUILTIN_COMMAND_NAMES.includes(name)) return `"${name}" is a built-in command`;
  const dupeIdx = existingNames.findIndex((n) => n === name);
  if (dupeIdx >= 0 && dupeIdx !== editingIndex) return "A template with this name already exists";
  return null;
}

function TemplatesSection({
  templates,
  onChange,
}: {
  templates: CustomTemplate[];
  onChange: (templates: CustomTemplate[]) => void;
}) {
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
    const nErr = validateTemplateName(trimmedName, existingNames, editingIndex === -1 ? null : editingIndex);
    const bErr = !trimmedBody
      ? "Body cannot be empty"
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
    setToast(isNew ? `Template /${trimmedName} added` : `Template /${trimmedName} updated`);
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
        Create reusable note templates accessible via <span className="text-ink font-medium">/command</span> in the editor.
      </p>

      {/* Existing templates */}
      {templates.length > 0 && (
        <div className="space-y-2">
          {templates.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-2.5 bg-line/30 rounded-xl border border-line/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-ink font-medium">/{t.name}</p>
                <p className="text-[11px] text-stone truncate">
                  {t.body.split("\n")[0].slice(0, 60)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startEdit(i)}
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-line text-stone hover:text-ink transition-colors"
                title="Edit template"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(i)}
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-coral-light text-stone hover:text-coral transition-colors"
                title="Delete template"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <p className="text-[12px] text-stone mb-1.5">Command name</p>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-stone">/</span>
              <input
                ref={nameInputRef}
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
            <p className="text-[12px] text-stone mb-1.5">Template body</p>
            <textarea
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
            <p className="text-[11px] text-stone mb-1 font-medium">Placeholders</p>
            <div className="flex flex-wrap gap-1.5">
              {["{{date}}", "{{time}}", "{{day}}", "{{datetime}}", "{{isodate}}", "{{cursor}}"].map((ph) => (
                <code
                  key={ph}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-line/50 text-ink font-mono"
                >
                  {ph}
                </code>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-stone">
              <span className="text-ink">{"{{cursor}}"}</span> sets where the cursor lands after insertion.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={saveEdit}
              className="px-3 py-2 text-[12px] font-medium text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors"
            >
              {editingIndex === -1 ? "Add" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="px-3 py-2 text-[12px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
            >
              Cancel
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
          <span>Add template</span>
        </button>
      )}

      <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
        <p className="text-[12px] text-stone leading-relaxed">
          Type <span className="text-ink font-medium">/</span> at the start of a line in the editor to see all templates.
          Custom templates appear with a "Custom" badge.
        </p>
      </div>
    </div>
    {confirmingDelete !== null && (
      <ConfirmDialog
        title="Delete template?"
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
}: SettingsContentProps) {
  const remoteWebUrl = remoteToWebUrl(settings.git_sharing.remote_url);
  const notesDir = settings.notes_directory
    ? `${settings.notes_directory}/Stik`
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
    const newMappings = settings.shortcut_mappings.filter((_, i) => i !== index);
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const systemShortcutValues = Object.values(settings.system_shortcuts ?? {});

  const addMapping = () => {
    const usedShortcuts = settings.shortcut_mappings.map((m) => m.shortcut);
    let defaultShortcut = "Cmd+Shift+S";

    const letters = "ABCDEFGHIJKLNOQRTUVWXYZ".split("");
    for (const letter of letters) {
      const shortcut = `Cmd+Shift+${letter}`;
      if (!usedShortcuts.includes(shortcut) && !systemShortcutValues.includes(shortcut)) {
        defaultShortcut = shortcut;
        break;
      }
    }

    onSettingsChange({
      ...settings,
      shortcut_mappings: [
        ...settings.shortcut_mappings,
        { shortcut: defaultShortcut, folder: folders[0] || "Inbox", enabled: true },
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
        {activeTab === "shortcuts" && (
          <div>
            <p className="mb-4 text-[12px] text-stone">
              Configure global shortcuts that instantly open capture in a chosen folder.
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
                      onChange={(value) => updateMapping(index, { shortcut: value })}
                      reservedShortcuts={systemShortcutValues}
                      existingShortcuts={getExistingShortcuts(index)}
                    />
                  </div>
                  <span className="text-coral text-sm">→</span>
                  <div className="flex-1">
                    <Dropdown
                      value={mapping.folder}
                      options={folders.map((f) => ({ value: f, label: f }))}
                      onChange={(value) => updateMapping(index, { folder: value })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMapping(index)}
                    className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-coral-light text-stone hover:text-coral transition-colors"
                    title="Remove shortcut"
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
              <span>Add shortcut</span>
            </button>

            <div className="mt-6">
              <p className="text-[12px] text-stone mb-3">System shortcuts</p>
              <div className="space-y-2">
                {SYSTEM_SHORTCUT_ACTIONS.map((action) => {
                  const currentShortcut =
                    settings.system_shortcuts?.[action] ?? SYSTEM_SHORTCUT_DEFAULTS[action];
                  const isDefault = currentShortcut === SYSTEM_SHORTCUT_DEFAULTS[action];
                  // Other system shortcuts + all folder shortcuts are reserved for this recorder
                  const otherSystemShortcuts = SYSTEM_SHORTCUT_ACTIONS
                    .filter((a) => a !== action)
                    .map((a) => settings.system_shortcuts?.[a] ?? SYSTEM_SHORTCUT_DEFAULTS[a]);
                  const folderShortcuts = settings.shortcut_mappings.map((m) => m.shortcut);

                  return (
                    <div
                      key={action}
                      className="flex items-center gap-2 px-3 py-2 bg-line/30 rounded-xl border border-line/50"
                    >
                      <span className="w-[70px] shrink-0 text-[12px] text-ink font-medium">
                        {SYSTEM_SHORTCUT_LABELS[action as SystemAction]}
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
                                [action]: SYSTEM_SHORTCUT_DEFAULTS[action as SystemAction],
                              },
                            })
                          }
                          className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md hover:bg-coral-light text-stone hover:text-coral transition-colors"
                          title="Reset to default"
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
                  (settings.system_shortcuts?.[a] ?? SYSTEM_SHORTCUT_DEFAULTS[a]) !==
                  SYSTEM_SHORTCUT_DEFAULTS[a]
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
                  Reset all to defaults
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === "folders" && (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] text-stone mb-1.5">Notes directory</p>
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
                      title: "Choose where to store Stik notes",
                      defaultPath: settings.notes_directory || resolvedNotesDir || undefined,
                    });
                    if (selected) {
                      onSettingsChange({ ...settings, notes_directory: selected });
                    }
                  }}
                  className="px-3 py-2.5 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors whitespace-nowrap"
                >
                  Browse
                </button>
                {settings.notes_directory && (
                  <button
                    type="button"
                    onClick={() =>
                      onSettingsChange({ ...settings, notes_directory: "" })
                    }
                    className="px-3 py-2.5 text-[12px] text-stone hover:text-coral border border-line rounded-lg hover:border-coral/30 transition-colors whitespace-nowrap"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-stone leading-relaxed">
                Stik creates a <span className="text-ink font-medium">Stik/</span> folder inside your chosen location.
                Existing notes are not moved automatically.
              </p>
            </div>

            <div>
              <p className="text-[12px] text-stone mb-1.5">Default folder</p>
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
                Opens when using tray menu or if no folder is specified.
              </p>
            </div>

            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl">
              <p className="text-[12px] text-stone leading-relaxed">
                Sync tip: notes are saved in {notesDir}. If that folder is
                synced (iCloud Drive, Dropbox, Syncthing), Stik syncs across Macs automatically.
              </p>
            </div>
          </div>
        )}

        {activeTab === "editor" && (
          <div className="space-y-4">
            <div className="p-4 bg-line/30 rounded-xl border border-line/50">
              <p className="text-[13px] text-ink font-medium mb-1">Theme</p>
              <p className="text-[12px] text-stone leading-relaxed mb-3">
                Choose light, dark, or follow your macOS appearance.
              </p>
              <div className="inline-flex rounded-lg border border-line overflow-hidden">
                {(["system", "light", "dark"] as const).map((opt) => {
                  const labels = { system: "System", light: "Light", dark: "Dark" } as const;
                  const current = settings.theme_mode || "system";
                  const isActive =
                    opt === "system" ? !current || current === "system" : current === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        onSettingsChange({ ...settings, theme_mode: opt === "system" ? "" : opt })
                      }
                      className={`px-4 py-1.5 text-[12px] font-medium transition-colors ${
                        isActive
                          ? "bg-coral text-white"
                          : "text-stone hover:text-ink hover:bg-line/50"
                      }`}
                    >
                      {labels[opt]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
              <div>
                <p className="text-[13px] text-ink font-medium">Font size</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Editor text size. Use <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">Cmd+</kbd> / <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">Cmd-</kbd> to
                  adjust, <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">Cmd+0</kbd> to reset.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onSettingsChange({ ...settings, font_size: Math.max((settings.font_size ?? 14) - 1, 12) })
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
                    onSettingsChange({ ...settings, font_size: Math.min((settings.font_size ?? 14) + 1, 48) })
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
                <p className="text-[13px] text-ink font-medium">Vim mode</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Use Vim-style keybindings in the editor. Press <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">i</kbd> to
                  type, <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">Esc</kbd> to
                  return to Normal mode.
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
                title="Toggle Vim mode"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.vim_mode_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="p-4 bg-line/30 rounded-xl border border-line/50">
              <p className="text-[13px] text-ink font-medium mb-1">Text direction</p>
              <p className="text-[12px] text-stone leading-relaxed mb-3">
                Set text direction for the editor. Auto detects per line — ideal for Arabic, Hebrew, and mixed-language notes.
              </p>
              <div className="max-w-[240px]">
                <Dropdown
                  value={settings.text_direction || "auto"}
                  options={[
                    { value: "auto", label: "Auto (Recommended)" },
                    { value: "ltr", label: "Left to Right" },
                    { value: "rtl", label: "Right to Left" },
                  ]}
                  onChange={(value) =>
                    onSettingsChange({ ...settings, text_direction: value })
                  }
                />
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-4 bg-line/30 rounded-xl border border-line/50">
              <div>
                <p className="text-[13px] text-ink font-medium">Hide Dock icon</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Access Stik from the menu bar icon and global shortcuts.
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
                title="Toggle Dock icon visibility"
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
                <p className="text-[13px] text-ink font-medium">Hide menu bar icon</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Remove the tray icon from the menu bar. Stik is still accessible via global shortcuts.
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
                title="Toggle menu bar icon visibility"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.hide_tray_icon ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
              <p className="text-[13px] text-ink font-medium">Quick reference</p>
              <div className="text-[12px] text-stone leading-relaxed space-y-1">
                <p><span className="text-ink font-medium">Movement</span> — h j k l, w b (word), 0 $ (line), gg G (document)</p>
                <p><span className="text-ink font-medium">Insert</span> — i (before), a (after), A (end of line), o O (new line)</p>
                <p><span className="text-ink font-medium">Edit</span> — x dd cc cw C, yy p, diw ciw, ci/di + &quot; &apos; ( {'{'}</p>
                <p><span className="text-ink font-medium">Visual</span> — v (chars), V (lines), d x (delete), y (yank), c (change)</p>
                <p><span className="text-ink font-medium">Undo</span> — u, Ctrl+r (redo), . (repeat)</p>
                <p><span className="text-ink font-medium">Commands</span> — :wq (save &amp; close), :q! (discard &amp; close)</p>
              </div>
            </div>

            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl space-y-1">
              <p className="text-[12px] font-semibold text-ink">How to close</p>
              <p className="text-[12px] text-stone leading-relaxed">
                Press <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">:</kbd> in
                Normal mode to open the command bar, then type <kbd className="px-1 py-0.5 bg-bg border border-line rounded text-[11px] font-mono">wq</kbd> + Enter
                to save and close. Escape always switches between Insert and Normal mode.
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
            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink font-medium">Enable Git sharing</span>
              <button
                type="button"
                onClick={() => updateGitSharing({ enabled: !settings.git_sharing.enabled })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings.git_sharing.enabled ? "bg-coral" : "bg-line"
                }`}
                title="Toggle Git sharing"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.git_sharing.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div>
              <p className="text-[12px] text-stone mb-1.5">Repository layout</p>
              <Dropdown
                value={settings.git_sharing.repository_layout}
                options={[
                  { value: "folder_root", label: "Selected folder is repo root" },
                  { value: "stik_root", label: "Whole Stik folder is repo root" },
                ]}
                onChange={(value) =>
                  updateGitSharing({
                    repository_layout: value as "folder_root" | "stik_root",
                  })
                }
              />
            </div>

            {settings.git_sharing.repository_layout === "folder_root" ? (
              <div>
                <p className="text-[12px] text-stone mb-1.5">Shared folder</p>
                <Dropdown
                  value={settings.git_sharing.shared_folder}
                  options={folders.map((f) => ({ value: f, label: f }))}
                  onChange={(value) => updateGitSharing({ shared_folder: value })}
                />
              </div>
            ) : (
              <p className="text-[12px] text-stone leading-relaxed">
                Notes are synced from your full Stik root, so GitHub will show folders like
                <span className="mx-1 text-ink">Inbox/</span>
                <span className="text-ink">Work/</span>
                <span className="mx-1 text-ink">Ideas/</span>.
              </p>
            )}

            <div>
              <p className="text-[12px] text-stone mb-1.5">Remote URL</p>
              <input
                type="text"
                value={settings.git_sharing.remote_url}
                onChange={(e) => updateGitSharing({ remote_url: e.target.value })}
                placeholder="https://github.com/your-org/stik-notes.git"
                className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
              />
            </div>

            <div className="grid grid-cols-[1fr_130px] gap-3">
              <div>
                <p className="text-[12px] text-stone mb-1.5">Branch</p>
                <input
                  type="text"
                  value={settings.git_sharing.branch}
                  onChange={(e) => updateGitSharing({ branch: e.target.value })}
                  placeholder="main"
                  className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink placeholder:text-stone/70 focus:outline-none focus:border-coral/50"
                />
              </div>
              <div>
                <p className="text-[12px] text-stone mb-1.5">Pull interval</p>
                <input
                  type="number"
                  min={60}
                  step={30}
                  value={settings.git_sharing.sync_interval_seconds}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value || "300", 10);
                    updateGitSharing({
                      sync_interval_seconds: Number.isFinite(parsed) ? Math.max(parsed, 60) : 300,
                    });
                  }}
                  className="w-full px-3 py-2.5 bg-bg border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-coral/50"
                />
              </div>
            </div>

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
                    <span>Linking...</span>
                  </span>
                ) : (
                  "Link repository"
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
                    <span>Syncing...</span>
                  </span>
                ) : (
                  "Sync now"
                )}
              </button>
              {remoteWebUrl && (
                <button
                  type="button"
                  onClick={onOpenGitRemote}
                  disabled={isOpeningGitRemote}
                  className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors"
                >
                  {isOpeningGitRemote ? "Opening..." : "Open remote"}
                </button>
              )}
            </div>

            <div className="text-[12px] text-stone leading-relaxed space-y-0.5">
              <p>
                Status:{" "}
                <span className="text-ink font-medium">
                  {gitSyncStatus?.repo_initialized ? "Repository linked" : "Not linked yet"}
                </span>
              </p>
              {gitSyncStatus?.last_sync_at && (
                <p>Last sync: {new Date(gitSyncStatus.last_sync_at).toLocaleString()}</p>
              )}
              {gitSyncStatus?.last_error && (
                <p className="text-coral">Last error: {gitSyncStatus.last_error}</p>
              )}
              <p>Auto-sync commits and pushes changes ~30s after note edits in the shared folder.</p>
            </div>

            <div className="p-3 bg-coral-light/35 border border-coral/20 rounded-xl space-y-1">
              <p className="text-[12px] font-semibold text-ink">GitHub account setup</p>
              <p className="text-[12px] text-stone leading-relaxed">
                Stik uses your existing Git credentials on this Mac (SSH key or HTTPS credential
                helper). Stik does not ask for or store GitHub tokens.
              </p>
              <p className="text-[12px] text-stone leading-relaxed">
                If auth fails once, run this in Terminal to complete login:
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
                <p className="text-[13px] text-ink font-medium">Enable AI features</p>
                <p className="mt-1 text-[12px] text-stone leading-relaxed">
                  Powers semantic search in the search bar and folder suggestions while
                  capturing notes.
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
                title="Toggle AI features"
              >
                <span
                  className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform pointer-events-none ${
                    settings.ai_features_enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
              <p className="text-[13px] text-ink font-medium">How it works</p>
              <ul className="text-[12px] text-stone leading-relaxed space-y-1.5">
                <li>
                  <span className="text-ink font-medium">Semantic search</span> — find notes by
                  meaning, not just keywords. Search "what to buy" to find your grocery list.
                </li>
                <li>
                  <span className="text-ink font-medium">Folder suggestions</span> — while
                  capturing, Stik suggests the best folder based on what you're writing.
                </li>
                <li>
                  <span className="text-ink font-medium">Note embeddings</span> — each note gets a
                  numeric fingerprint used for similarity matching. Built in the background.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-coral-light/40 border border-coral/20 rounded-xl space-y-1">
              <p className="text-[12px] font-semibold text-ink">Privacy</p>
              <p className="text-[12px] text-stone leading-relaxed">
                All processing happens on-device via Apple NaturalLanguage. No data leaves your
                Mac. English works best; other languages have limited semantic understanding.
              </p>
            </div>

            {!settings.ai_features_enabled && (
              <p className="text-[12px] text-stone text-center">
                Restart Stik after enabling to start the AI engine.
              </p>
            )}
          </div>
        )}

        {activeTab === "insights" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-coral">↻</span>
                <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                  Capture Streak
                </h3>
              </div>
              <div className="p-4 bg-line/30 rounded-xl border border-line/50 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-ink">{captureStreakLabel}</p>
                  <p className="mt-1 text-[12px] text-stone leading-relaxed">
                    Consecutive days with at least one captured note.
                    {captureStreakDays === null
                      ? " Open settings again if this stays unavailable."
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRefreshCaptureStreak}
                  disabled={isRefreshingStreak}
                  className="px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
                >
                  {isRefreshingStreak ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-coral">☼</span>
                <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                  On This Day
                </h3>
              </div>
              <div className="p-4 bg-line/30 rounded-xl border border-line/50 space-y-2">
                <p className="text-[14px] font-semibold text-ink">{onThisDayMessage}</p>
                {(onThisDayDate || onThisDayFolder) && (
                  <p className="text-[12px] text-stone">
                    {onThisDayFolder || "Folder unknown"} • {onThisDayDate || "Date unknown"}
                  </p>
                )}
                {onThisDayPreview && (
                  <p className="text-[12px] text-stone leading-relaxed">{onThisDayPreview}</p>
                )}
                <button
                  type="button"
                  onClick={onCheckOnThisDay}
                  disabled={isCheckingOnThisDay}
                  className="mt-2 px-3 py-2 text-[12px] text-coral border border-coral/30 rounded-lg hover:bg-coral-light transition-colors disabled:opacity-50"
                >
                  {isCheckingOnThisDay ? "Checking..." : "Check now"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "privacy" && <PrivacySection settings={settings} onSettingsChange={onSettingsChange} />}

    </div>
  );
}
