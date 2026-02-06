export interface StickedNote {
  id: string;
  content: string;
  folder: string;
  position: [number, number] | null;
  size: [number, number] | null;
  created_at: string;
  updated_at: string;
  originalPath?: string;
}

export interface ShortcutMapping {
  shortcut: string;
  folder: string;
  enabled: boolean;
}

export interface StikSettings {
  shortcut_mappings: ShortcutMapping[];
  default_folder: string;
}

export interface NoteInfo {
  path: string;
  filename: string;
  folder: string;
  content: string;
  created: string;
}

export interface SearchResult {
  path: string;
  filename: string;
  folder: string;
  snippet: string;
  created: string;
}

export interface FolderStats {
  name: string;
  note_count: number;
}

export interface CaptureStreakStatus {
  days: number;
  label: string;
}

export interface OnThisDayStatus {
  found: boolean;
  message: string;
  date: string | null;
  folder: string | null;
  preview: string | null;
}

export interface ClipboardPayload {
  plain_text: string;
  html: string;
}
