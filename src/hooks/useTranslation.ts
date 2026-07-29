/// React binding for the i18n store.
///
/// `useTranslation()` gives a component a `t()` that re-renders it when the
/// language changes. `useLanguageSync()` is mounted once per window root and
/// owns the settings plumbing — mirroring how `useTheme` works.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { StikSettings } from "@/types";
import {
  getLocale,
  resolveLocale,
  setLocale,
  subscribeToLocale,
  translate,
  type TranslationKey,
  type TranslationVars,
} from "@/i18n";

export function useTranslation() {
  const locale = useSyncExternalStore(subscribeToLocale, getLocale, getLocale);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      translate(locale, key, vars),
    [locale],
  );

  return { t, locale };
}

/// Load the language from settings and keep it current. Mount once per window
/// root; `useTranslation` in child components reads the resulting store.
export function useLanguageSync() {
  useEffect(() => {
    invoke<StikSettings>("get_settings")
      .then((s) => setLocale(resolveLocale(s.language)))
      .catch(() => {
        // Settings unavailable (first run, or backend not ready) — fall back
        // to the system language so the UI is still sensible.
        setLocale(resolveLocale(navigator.language));
      });

    const unlisten = listen<StikSettings>("settings-changed", (e) => {
      setLocale(resolveLocale(e.payload.language));
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
