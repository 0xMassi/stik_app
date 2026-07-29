/// Internationalization — locale registry, active-locale store and the
/// `translate` primitive. Deliberately dependency-free: the whole runtime is
/// a lookup plus `{placeholder}` substitution, which is all Stik needs.
///
/// English (`en`) is the source of truth. Every other locale is typed as
/// `Record<TranslationKey, string>`, so a missing or misspelled key is a
/// compile error rather than a silent fallback at runtime.
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;
export type Locale = "en" | "zh-CN";

export interface LocaleInfo {
  id: Locale;
  /// Name in the language itself — what a speaker of it looks for.
  nativeLabel: string;
  /// English name, shown alongside so the picker is navigable when you
  /// can't read the current UI language.
  englishLabel: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { id: "en", nativeLabel: "English", englishLabel: "English" },
  { id: "zh-CN", nativeLabel: "简体中文", englishLabel: "Simplified Chinese" },
] as const;

const CATALOGUES: Record<Locale, Translations> = {
  en,
  "zh-CN": zhCN,
};

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return LOCALES.some((l) => l.id === value);
}

/// Resolve a settings value (or a browser language tag) to a supported locale.
/// Falls back to the base language so `zh`, `zh-Hans` and `zh-CN` all match.
export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  if (isLocale(value)) return value;

  const base = value.toLowerCase().split(/[-_]/)[0];
  if (base === "zh") return "zh-CN";
  const match = LOCALES.find((l) => l.id.toLowerCase().split("-")[0] === base);
  return match ? match.id : DEFAULT_LOCALE;
}

export type TranslationVars = Record<string, string | number>;

/// Look up `key` in `locale`, falling back to English so a partially
/// translated locale degrades to readable English instead of a raw key.
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: TranslationVars,
): string {
  const template = CATALOGUES[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

// ── Active locale store ──────────────────────────────────────────────
// Module-level rather than React context: Stik renders several independent
// window roots from one bundle, and a plain store keeps them in sync without
// threading a provider through every entry point.

let activeLocale: Locale = DEFAULT_LOCALE;
const subscribers = new Set<() => void>();

export function getLocale(): Locale {
  return activeLocale;
}

export function setLocale(next: Locale): void {
  if (next === activeLocale) return;
  activeLocale = next;
  document.documentElement.lang = next;
  subscribers.forEach((notify) => notify());
}

export function subscribeToLocale(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}
