import type { TranslationKey } from "@/i18n";
export const SYSTEM_SHORTCUT_ACTIONS = [
  "search",
  "manager",
  "settings",
  "last_note",
  "zen_mode",
  "dictation",
  "voice_note",
  "clip_capture",
] as const;
export type SystemAction = (typeof SYSTEM_SHORTCUT_ACTIONS)[number];

export const SYSTEM_SHORTCUT_DEFAULTS: Record<SystemAction, string> = {
  search: "Cmd+Shift+P",
  manager: "Cmd+Shift+M",
  settings: "Cmd+Shift+Comma",
  last_note: "Cmd+Shift+L",
  zen_mode: "Cmd+Period",
  dictation: "Cmd+Shift+D",
  voice_note: "Cmd+Shift+V",
  clip_capture: "Cmd+Shift+C",
};

export const SYSTEM_SHORTCUT_LABEL_KEYS: Record<SystemAction, TranslationKey> = {
  search: "shortcut.search",
  manager: "shortcut.manager",
  settings: "shortcut.settings",
  last_note: "shortcut.lastNote",
  zen_mode: "shortcut.zenMode",
  dictation: "shortcut.dictation",
  voice_note: "shortcut.voiceNote",
  clip_capture: "shortcut.clipCapture",
};

/**
 * Settings deliberately cannot be cleared.
 *
 * The tray icon and the Dock icon can both be hidden, so if the Settings
 * shortcut were also unset there would be no way left to reach Settings and
 * undo any of it. Every other action has a menu or is simply optional.
 */
export const UNCLEARABLE_ACTIONS: readonly SystemAction[] = ["settings"];

export function isClearableAction(action: SystemAction): boolean {
  return !UNCLEARABLE_ACTIONS.includes(action);
}

/** Get all system shortcut values for use as reserved list */
export function getSystemShortcutValues(
  systemShortcuts: Record<string, string>,
): string[] {
  // Cleared shortcuts are the empty string; they reserve nothing.
  return Object.values(systemShortcuts).filter((value) => value !== "");
}
