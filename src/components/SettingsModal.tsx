import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ShortcutRecorder from "./ShortcutRecorder";

interface ShortcutMapping {
  shortcut: string;
  folder: string;
  enabled: boolean;
}

interface StikSettings {
  shortcut_mappings: ShortcutMapping[];
  default_folder: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isWindow?: boolean;
}

// Reserved shortcuts that Stik uses internally
const RESERVED_SHORTCUTS = [
  "CommandOrControl+Shift+F", // Folder selector
  "CommandOrControl+Shift+P", // Search
  "CommandOrControl+Shift+M", // Manager
  "CommandOrControl+Shift+Comma", // Settings
];

interface DropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}

function Dropdown({ value, options, onChange, placeholder }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ensure current value is always in options
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

export default function SettingsModal({ isOpen, onClose, isWindow = false }: SettingsModalProps) {
  const [settings, setSettings] = useState<StikSettings | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings and folders
  useEffect(() => {
    if (isOpen) {
      invoke<StikSettings>("get_settings").then(setSettings);
      invoke<string[]>("list_folders").then(setFolders);
    }
  }, [isOpen]);

  // ESC key disabled for settings - user must use Cancel or Save buttons

  // Safety: ensure shortcuts are resumed when settings closes/unmounts
  useEffect(() => {
    return () => {
      // Always resume shortcuts when settings modal closes
      invoke("resume_shortcuts").catch(() => {});
    };
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      await invoke("save_settings", { settings });
      await invoke("reload_shortcuts");
      if (!isWindow) {
        onClose();
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateMapping = (index: number, updates: Partial<ShortcutMapping>) => {
    if (!settings) return;

    const newMappings = [...settings.shortcut_mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    setSettings({ ...settings, shortcut_mappings: newMappings });
  };

  const removeMapping = (index: number) => {
    if (!settings) return;

    const newMappings = settings.shortcut_mappings.filter((_, i) => i !== index);
    setSettings({ ...settings, shortcut_mappings: newMappings });
  };

  const addMapping = () => {
    if (!settings) return;

    // Generate a default shortcut that's not already used
    const usedShortcuts = settings.shortcut_mappings.map((m) => m.shortcut);
    let defaultShortcut = "CommandOrControl+Shift+S";

    // Find an unused shortcut
    const letters = "ABCDEFGHIJKLNOQRTUVWXYZ".split(""); // Excluding F, M, P (reserved)
    for (const letter of letters) {
      const shortcut = `CommandOrControl+Shift+${letter}`;
      if (!usedShortcuts.includes(shortcut) && !RESERVED_SHORTCUTS.includes(shortcut)) {
        defaultShortcut = shortcut;
        break;
      }
    }

    const newMapping: ShortcutMapping = {
      shortcut: defaultShortcut,
      folder: folders[0] || "Inbox",
      enabled: true,
    };

    setSettings({
      ...settings,
      shortcut_mappings: [...settings.shortcut_mappings, newMapping],
    });
  };

  // Get all existing shortcuts for validation
  const getExistingShortcuts = (excludeIndex?: number) => {
    if (!settings) return [];
    return settings.shortcut_mappings
      .filter((_, i) => i !== excludeIndex)
      .map((m) => m.shortcut);
  };

  if (!isOpen || !settings) return null;

  // When rendered as a standalone window, fill the entire window
  if (isWindow) {
    return (
      <div className="w-full h-full bg-bg rounded-[14px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b border-line bg-line/20">
          <div className="flex items-center gap-2.5">
            <span className="text-coral text-lg">⚙</span>
            <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Keyboard Shortcuts Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-coral">⌨</span>
              <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                Keyboard Shortcuts
              </h3>
            </div>

            <div className="space-y-3">
              {settings.shortcut_mappings.map((mapping, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-line/30 rounded-xl border border-line/50"
                >
                  <div className="w-28">
                    <ShortcutRecorder
                      value={mapping.shortcut}
                      onChange={(value) => updateMapping(index, { shortcut: value })}
                      reservedShortcuts={RESERVED_SHORTCUTS}
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
                    onClick={() => removeMapping(index)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-coral-light text-stone hover:text-coral transition-colors"
                    title="Remove shortcut"
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

            <button
              onClick={addMapping}
              className="mt-4 w-full px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
            >
              <span className="text-lg">+</span>
              <span>Add shortcut</span>
            </button>
          </div>

          <div className="border-t border-line/50" />

          {/* Default Folder Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-coral">●</span>
              <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                Default Folder
              </h3>
            </div>

            <Dropdown
              value={settings.default_folder}
              options={folders.map((f) => ({ value: f, label: f }))}
              onChange={(value) =>
                setSettings({ ...settings, default_folder: value })
              }
            />

            <p className="mt-3 text-[12px] text-stone leading-relaxed">
              Opens when using tray menu or if no folder is specified
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-4 border-t border-line bg-line/10">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().close();
              }}
              className="px-5 py-2 text-[13px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await handleSave();
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().close();
              }}
              disabled={isSaving}
              className="px-5 py-2 text-[13px] text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">↻</span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-bg rounded-[14px] w-[440px] max-h-[500px] flex flex-col shadow-stik overflow-hidden border border-line/50">
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b border-line bg-line/20">
          <div className="flex items-center gap-2.5">
            <span className="text-coral text-lg">⚙</span>
            <h2 className="text-[15px] font-semibold text-ink">Settings</h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Keyboard Shortcuts Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-coral">⌨</span>
              <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                Keyboard Shortcuts
              </h3>
            </div>

            <div className="space-y-3">
              {settings.shortcut_mappings.map((mapping, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-line/30 rounded-xl border border-line/50"
                >
                  {/* Shortcut recorder */}
                  <div className="w-28">
                    <ShortcutRecorder
                      value={mapping.shortcut}
                      onChange={(value) => updateMapping(index, { shortcut: value })}
                      reservedShortcuts={RESERVED_SHORTCUTS}
                      existingShortcuts={getExistingShortcuts(index)}
                    />
                  </div>

                  {/* Arrow */}
                  <span className="text-coral text-sm">→</span>

                  {/* Folder selector */}
                  <div className="flex-1">
                    <Dropdown
                      value={mapping.folder}
                      options={folders.map((f) => ({ value: f, label: f }))}
                      onChange={(value) => updateMapping(index, { folder: value })}
                    />
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeMapping(index)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-coral-light text-stone hover:text-coral transition-colors"
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

            {/* Add shortcut button */}
            <button
              onClick={addMapping}
              className="mt-4 w-full px-4 py-3 text-[13px] text-coral hover:bg-coral-light rounded-xl transition-colors flex items-center justify-center gap-2 border border-dashed border-coral/30 hover:border-coral/50"
            >
              <span className="text-lg">+</span>
              <span>Add shortcut</span>
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-line/50" />

          {/* Default Folder Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-coral">●</span>
              <h3 className="text-[13px] font-semibold text-stone uppercase tracking-wide">
                Default Folder
              </h3>
            </div>

            <Dropdown
              value={settings.default_folder}
              options={folders.map((f) => ({ value: f, label: f }))}
              onChange={(value) =>
                setSettings({ ...settings, default_folder: value })
              }
            />

            <p className="mt-3 text-[12px] text-stone leading-relaxed">
              Opens when using tray menu or if no folder is specified
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-4 border-t border-line bg-line/10">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 text-[13px] text-stone hover:text-ink rounded-lg hover:bg-line transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-[13px] text-white bg-coral rounded-lg hover:bg-coral/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">↻</span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
