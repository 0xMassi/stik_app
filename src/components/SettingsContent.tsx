import { useState, useEffect, useRef } from "react";
import ShortcutRecorder from "./ShortcutRecorder";
import type { ShortcutMapping, StikSettings } from "@/types";

// Reserved shortcuts that Stik uses internally
export const RESERVED_SHORTCUTS = [
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

interface SettingsContentProps {
  settings: StikSettings;
  folders: string[];
  onSettingsChange: (settings: StikSettings) => void;
}

export default function SettingsContent({ settings, folders, onSettingsChange }: SettingsContentProps) {
  const updateMapping = (index: number, updates: Partial<ShortcutMapping>) => {
    const newMappings = [...settings.shortcut_mappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const removeMapping = (index: number) => {
    const newMappings = settings.shortcut_mappings.filter((_, i) => i !== index);
    onSettingsChange({ ...settings, shortcut_mappings: newMappings });
  };

  const addMapping = () => {
    const usedShortcuts = settings.shortcut_mappings.map((m) => m.shortcut);
    let defaultShortcut = "CommandOrControl+Shift+S";

    const letters = "ABCDEFGHIJKLNOQRTUVWXYZ".split("");
    for (const letter of letters) {
      const shortcut = `CommandOrControl+Shift+${letter}`;
      if (!usedShortcuts.includes(shortcut) && !RESERVED_SHORTCUTS.includes(shortcut)) {
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

  return (
    <div className="space-y-6">
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
            onSettingsChange({ ...settings, default_folder: value })
          }
        />

        <p className="mt-3 text-[12px] text-stone leading-relaxed">
          Opens when using tray menu or if no folder is specified
        </p>
      </div>
    </div>
  );
}
