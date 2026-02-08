import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { StikSettings } from "@/types";

type ThemeMode = "system" | "light" | "dark";

function resolveMode(raw: string): ThemeMode {
  if (raw === "light" || raw === "dark") return raw;
  return "system";
}

function applyTheme(mode: ThemeMode) {
  const isDark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function useTheme() {
  useEffect(() => {
    let mode: ThemeMode = "system";

    // Apply initial theme from settings
    invoke<StikSettings>("get_settings")
      .then((s) => {
        mode = resolveMode(s.theme_mode);
        applyTheme(mode);
      })
      .catch(() => applyTheme("system"));

    // Listen for settings changes (any window)
    const unlistenSettings = listen<StikSettings>("settings-changed", (e) => {
      mode = resolveMode(e.payload.theme_mode);
      applyTheme(mode);
    });

    // Listen for OS appearance changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => applyTheme(mode);
    mq.addEventListener("change", onSystemChange);

    return () => {
      unlistenSettings.then((fn) => fn());
      mq.removeEventListener("change", onSystemChange);
    };
  }, []);
}
