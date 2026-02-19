import type { ThemeColors, CustomThemeDefinition } from "@/types";
import { rgbToHex } from "@/utils/color";

export interface BuiltinTheme {
  id: string;
  name: string;
  isDark: boolean;
  colors: ThemeColors;
}

const light: BuiltinTheme = {
  id: "light",
  name: "Light",
  isDark: false,
  colors: {
    bg: "255 252 249",
    surface: "255 255 255",
    ink: "26 26 26",
    stone: "122 122 122",
    line: "240 238 235",
    accent: "232 112 95",
    accent_light: "255 241 238",
    accent_dark: "214 96 79",
  },
};

const dark: BuiltinTheme = {
  id: "dark",
  name: "Dark",
  isDark: true,
  colors: {
    bg: "28 25 23",
    surface: "41 37 36",
    ink: "245 240 235",
    stone: "168 162 158",
    line: "68 64 60",
    accent: "232 112 95",
    accent_light: "61 37 32",
    accent_dark: "214 96 79",
  },
};

const sepia: BuiltinTheme = {
  id: "sepia",
  name: "Sepia",
  isDark: false,
  colors: {
    bg: "245 235 220",
    surface: "250 242 230",
    ink: "62 48 36",
    stone: "140 120 100",
    line: "225 210 190",
    accent: "180 100 60",
    accent_light: "245 225 210",
    accent_dark: "160 80 45",
  },
};

const nord: BuiltinTheme = {
  id: "nord",
  name: "Nord",
  isDark: true,
  colors: {
    bg: "46 52 64",
    surface: "59 66 82",
    ink: "236 239 244",
    stone: "165 175 191",
    line: "67 76 94",
    accent: "136 192 208",
    accent_light: "46 62 74",
    accent_dark: "94 162 182",
  },
};

const rosePine: BuiltinTheme = {
  id: "rose-pine",
  name: "Rose Pine",
  isDark: true,
  colors: {
    bg: "25 23 36",
    surface: "30 28 44",
    ink: "224 222 244",
    stone: "144 140 170",
    line: "38 35 58",
    accent: "235 111 146",
    accent_light: "50 30 40",
    accent_dark: "210 90 125",
  },
};

const solarizedLight: BuiltinTheme = {
  id: "solarized-light",
  name: "Solarized Light",
  isDark: false,
  colors: {
    bg: "253 246 227",
    surface: "238 232 213",
    ink: "0 43 54",
    stone: "88 110 117",
    line: "220 213 194",
    accent: "38 139 210",
    accent_light: "230 240 250",
    accent_dark: "30 115 180",
  },
};

const solarizedDark: BuiltinTheme = {
  id: "solarized-dark",
  name: "Solarized Dark",
  isDark: true,
  colors: {
    bg: "0 43 54",
    surface: "7 54 66",
    ink: "253 246 227",
    stone: "147 161 161",
    line: "14 65 78",
    accent: "38 139 210",
    accent_light: "10 55 70",
    accent_dark: "30 115 180",
  },
};

const dracula: BuiltinTheme = {
  id: "dracula",
  name: "Dracula",
  isDark: true,
  colors: {
    bg: "40 42 54",
    surface: "50 52 68",
    ink: "248 248 242",
    stone: "148 150 164",
    line: "62 64 82",
    accent: "189 147 249",
    accent_light: "55 45 75",
    accent_dark: "160 120 220",
  },
};

const tokyoNight: BuiltinTheme = {
  id: "tokyo-night",
  name: "Tokyo Night",
  isDark: true,
  colors: {
    bg: "26 27 38",
    surface: "36 40 59",
    ink: "192 202 245",
    stone: "130 140 170",
    line: "41 46 66",
    accent: "125 207 255",
    accent_light: "30 50 65",
    accent_dark: "100 180 230",
  },
};

export const BUILTIN_THEMES: BuiltinTheme[] = [
  light,
  dark,
  sepia,
  nord,
  rosePine,
  solarizedLight,
  solarizedDark,
  dracula,
  tokyoNight,
];

export const BUILTIN_THEME_MAP = new Map(BUILTIN_THEMES.map((t) => [t.id, t]));

function computeEditorTokens(colors: ThemeColors, isDark: boolean) {
  const accentHex = rgbToHex(colors.accent);
  const stoneHex = rgbToHex(colors.stone);
  const lineHex = rgbToHex(colors.line);

  return {
    "--editor-placeholder": isDark ? "#666" : "#bbb",
    "--editor-strikethrough": stoneHex,
    "--editor-code-bg": lineHex,
    "--editor-code-block-bg": isDark ? "#0f0e0d" : "#1a1a1a",
    "--editor-code-block-text": isDark ? "#e8e4df" : "#f0f0f0",
    "--editor-checked-task": stoneHex,
    "--editor-link": accentHex,
    "--editor-marker": accentHex,
    "--editor-blockquote-border": accentHex,
    "--editor-blockquote-text": stoneHex,
    "--editor-checkbox-border": accentHex,
    "--editor-checkbox-checked": accentHex,
    "--vim-visual-selection": `rgba(${colors.accent.split(" ").join(", ")}, ${isDark ? 0.2 : 0.12})`,
    "--overlay-bg": isDark ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.6)",
    "--shadow-stik": isDark
      ? `0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)`
      : `0 20px 60px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.04)`,
    "--shadow-coral-sm": `0 4px 16px rgba(${colors.accent.split(" ").join(", ")}, ${isDark ? 0.2 : 0.25})`,
    "--shadow-coral-lg": `0 8px 24px rgba(${colors.accent.split(" ").join(", ")}, ${isDark ? 0.3 : 0.35})`,
    "--sticked-shadow": isDark
      ? `0 0 0 1px rgba(${colors.accent.split(" ").join(", ")}, 0.25), 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(${colors.accent.split(" ").join(", ")}, 0.08)`
      : `0 0 0 1px rgba(${colors.accent.split(" ").join(", ")}, 0.3), 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 20px rgba(${colors.accent.split(" ").join(", ")}, 0.1)`,
    "--sticked-header-gradient": `linear-gradient(to right, rgba(${colors.accent.split(" ").join(", ")}, ${isDark ? 0.12 : 0.08}), transparent)`,
    "--sticked-resize-gradient": `linear-gradient(135deg, transparent 50%, rgba(${colors.accent.split(" ").join(", ")}, ${isDark ? 0.25 : 0.3}) 50%)`,
    "--editor-font-size": undefined as string | undefined,
  };
}

export function resolveTheme(
  activeTheme: string,
  customThemes: CustomThemeDefinition[],
  prefersDark: boolean,
): { colors: ThemeColors; isDark: boolean } {
  if (!activeTheme || activeTheme === "system") {
    return prefersDark
      ? { colors: dark.colors, isDark: true }
      : { colors: light.colors, isDark: false };
  }

  if (activeTheme === "light") {
    return { colors: light.colors, isDark: false };
  }
  if (activeTheme === "dark") {
    return { colors: dark.colors, isDark: true };
  }

  const builtin = BUILTIN_THEME_MAP.get(activeTheme);
  if (builtin) {
    return { colors: builtin.colors, isDark: builtin.isDark };
  }

  const custom = customThemes.find((t) => t.id === activeTheme);
  if (custom) {
    return { colors: custom.colors, isDark: custom.is_dark };
  }

  return { colors: light.colors, isDark: false };
}

export function applyThemeToDOM(colors: ThemeColors, isDark: boolean) {
  const el = document.documentElement;

  el.style.setProperty("--color-bg", colors.bg);
  el.style.setProperty("--color-surface", colors.surface);
  el.style.setProperty("--color-ink", colors.ink);
  el.style.setProperty("--color-stone", colors.stone);
  el.style.setProperty("--color-line", colors.line);
  el.style.setProperty("--color-coral", colors.accent);
  el.style.setProperty("--color-coral-light", colors.accent_light);
  el.style.setProperty("--color-coral-dark", colors.accent_dark);

  const editorTokens = computeEditorTokens(colors, isDark);
  for (const [key, value] of Object.entries(editorTokens)) {
    if (value !== undefined) {
      el.style.setProperty(key, value);
    }
  }

  if (isDark) {
    el.setAttribute("data-theme", "dark");
  } else {
    el.removeAttribute("data-theme");
  }
}

export function generateThemeId(): string {
  return "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
