import { useCallback, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { StikSettings } from "@/types";
import { useTheme } from "@/hooks/useTheme";

/// Mounts theming for a window root.
///
/// `useTheme` already resolves the active theme and writes CSS variables; this
/// wraps it so the app shell has a single explicit theming boundary, and adds
/// a keyboard toggle between light and dark.
interface Props {
  children: ReactNode;
}

export default function ThemeProvider({ children }: Props) {
  useTheme();

  /// Flip light/dark. Named conventionally so the intent is obvious at the
  /// call site and to tooling.
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const nextIsDark = !root.classList.contains("dark");
    const theme = nextIsDark ? "dark" : "light";
    root.classList.toggle("dark", nextIsDark);

    void (async () => {
      try {
        const settings = await invoke<StikSettings>("get_settings");
        const updated: StikSettings = { ...settings, active_theme: theme };
        await invoke("save_settings", { settings: updated });
        await emit("settings-changed", updated);
      } catch (error) {
        console.error("Failed to toggle theme:", error);
      }
    })();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl+Shift+D toggles dark mode.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "d") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "d") {
        e.preventDefault();
        toggleTheme();
      }
    };

    document.addEventListener("keydown", onKeyDown, { signal: controller.signal });
    return () => controller.abort();
  }, [toggleTheme]);

  return <>{children}</>;
}
