/**
 * Folder color palette — single source of truth for colored folder dots and badges.
 *
 * Each preset maps to:
 *  - dot: RGB string for inline `style={{ color }}` on the small dot indicator
 *  - badgeBg / badgeText: Tailwind classes (with dark: variants) for folder name badges
 */

export interface FolderColorDef {
  dot: string;
  badgeBg: string;
  badgeText: string;
}

export const FOLDER_COLORS: Record<string, FolderColorDef> = {
  coral: {
    dot: "rgb(232,112,95)",
    badgeBg: "bg-coral-light",
    badgeText: "text-coral",
  },
  red: {
    dot: "rgb(239,68,68)",
    badgeBg: "bg-red-100 dark:bg-red-950",
    badgeText: "text-red-600 dark:text-red-400",
  },
  amber: {
    dot: "rgb(245,158,11)",
    badgeBg: "bg-amber-100 dark:bg-amber-950",
    badgeText: "text-amber-600 dark:text-amber-400",
  },
  green: {
    dot: "rgb(34,197,94)",
    badgeBg: "bg-green-100 dark:bg-green-950",
    badgeText: "text-green-600 dark:text-green-400",
  },
  teal: {
    dot: "rgb(20,184,166)",
    badgeBg: "bg-teal-100 dark:bg-teal-950",
    badgeText: "text-teal-600 dark:text-teal-400",
  },
  blue: {
    dot: "rgb(59,130,246)",
    badgeBg: "bg-blue-100 dark:bg-blue-950",
    badgeText: "text-blue-600 dark:text-blue-400",
  },
  purple: {
    dot: "rgb(168,85,247)",
    badgeBg: "bg-purple-100 dark:bg-purple-950",
    badgeText: "text-purple-600 dark:text-purple-400",
  },
  pink: {
    dot: "rgb(236,72,153)",
    badgeBg: "bg-pink-100 dark:bg-pink-950",
    badgeText: "text-pink-600 dark:text-pink-400",
  },
};

export const FOLDER_COLOR_KEYS = Object.keys(FOLDER_COLORS);

const DEFAULT_COLOR = FOLDER_COLORS.coral;

export function getFolderColor(
  folderName: string,
  folderColors: Record<string, string>,
): FolderColorDef {
  const key = folderColors[folderName];
  return (key && FOLDER_COLORS[key]) || DEFAULT_COLOR;
}
