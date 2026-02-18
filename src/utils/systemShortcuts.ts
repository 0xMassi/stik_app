export const SYSTEM_SHORTCUT_ACTIONS = ["search", "manager", "settings", "last_note", "zen_mode"] as const;
export type SystemAction = (typeof SYSTEM_SHORTCUT_ACTIONS)[number];

export const SYSTEM_SHORTCUT_DEFAULTS: Record<SystemAction, string> = {
  search: "Cmd+Shift+P",
  manager: "Cmd+Shift+M",
  settings: "Cmd+Shift+Comma",
  last_note: "Cmd+Shift+L",
  zen_mode: "Cmd+Period",
};

export const SYSTEM_SHORTCUT_LABELS: Record<SystemAction, string> = {
  search: "Command Palette",
  manager: "Command Palette (alt)",
  settings: "Settings",
  last_note: "Last note",
  zen_mode: "Zen mode",
};

/** Get all system shortcut values for use as reserved list */
export function getSystemShortcutValues(systemShortcuts: Record<string, string>): string[] {
  return Object.values(systemShortcuts);
}
