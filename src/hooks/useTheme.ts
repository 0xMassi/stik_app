import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { StikSettings } from "@/types";
import { resolveTheme, applyThemeToDOM } from "@/themes";

export function useTheme() {
  useEffect(() => {
    let activeThemeId = "";
    let customThemes: StikSettings["custom_themes"] = [];

    function apply() {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const { colors, isDark } = resolveTheme(activeThemeId, customThemes, prefersDark);
      applyThemeToDOM(colors, isDark);
    }

    invoke<StikSettings>("get_settings")
      .then((s) => {
        activeThemeId = s.active_theme || s.theme_mode || "";
        customThemes = s.custom_themes ?? [];
        apply();
      })
      .catch(() => apply());

    const unlistenSettings = listen<StikSettings>("settings-changed", (e) => {
      activeThemeId = e.payload.active_theme || e.payload.theme_mode || "";
      customThemes = e.payload.custom_themes ?? [];
      apply();
    });

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => apply();
    mq.addEventListener("change", onSystemChange);

    return () => {
      unlistenSettings.then((fn) => fn());
      mq.removeEventListener("change", onSystemChange);
    };
  }, []);
}
