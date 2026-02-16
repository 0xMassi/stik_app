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

export interface GitSharingSettings {
  enabled: boolean;
  shared_folder: string;
  remote_url: string;
  branch: string;
  repository_layout: "folder_root" | "stik_root";
  sync_interval_seconds: number;
}

export interface CustomTemplate {
  name: string;
  body: string;
}

export interface StikSettings {
  shortcut_mappings: ShortcutMapping[];
  default_folder: string;
  git_sharing: GitSharingSettings;
  ai_features_enabled: boolean;
  vim_mode_enabled: boolean;
  theme_mode: string;
  notes_directory: string;
  hide_dock_icon: boolean;
  folder_colors: Record<string, string>;
  system_shortcuts: Record<string, string>;
  analytics_enabled: boolean;
  analytics_notice_dismissed: boolean;
  font_size: number;
  custom_templates: CustomTemplate[];
  sidebar_position: string;
  auto_update_enabled: boolean;
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
  title: string;
  snippet: string;
  created: string;
}

export interface SemanticResult {
  path: string;
  filename: string;
  folder: string;
  title: string;
  snippet: string;
  created: string;
  similarity: number;
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

export interface AppleNoteEntry {
  note_id: number;
  title: string;
  folder_name: string;
  snippet: string;
  modified_date: string;
  account_name: string;
}

export interface GitSyncStatus {
  enabled: boolean;
  linked_folder: string | null;
  remote_url: string | null;
  branch: string;
  repository_layout: "folder_root" | "stik_root";
  repo_initialized: boolean;
  pending_changes: boolean;
  syncing: boolean;
  last_sync_at: string | null;
  last_error: string | null;
}
