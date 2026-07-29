import { useEffect, type ReactNode } from "react";
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

/// Toggle light/dark (Cmd/Ctrl+Alt+D). Deliberately not one of the
/// user-configurable global shortcuts: those are OS-level and registered in
/// Rust, whereas this is a window-local convenience.
const TOGGLE_KEY = "d";

export default function ThemeProvider({ children }: Props) {
  useTheme();

  useEffect(() => {
    const controller = new AbortController();

    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Alt+D: Cmd+Shift+D is already the global dictation shortcut.
      if (!(e.metaKey || e.ctrlKey) || !e.altKey) return;
      if (e.key.toLowerCase() !== TOGGLE_KEY) return;

      // Never steal the key while the user is writing.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      e.preventDefault();

      // Flip the document immediately so the toggle feels instant, then
      // persist. useTheme re-applies from settings on the round trip.
      const root = document.documentElement;
      const nextIsDark = !root.classList.contains("dark");
      root.classList.toggle("dark", nextIsDark);

      void (async () => {
        try {
          const settings = await invoke<StikSettings>("get_settings");
          const updated: StikSettings = {
            ...settings,
            active_theme: nextIsDark ? "dark" : "light",
          };
          await invoke("save_settings", { settings: updated });
          await emit("settings-changed", updated);
        } catch (error) {
          console.error("Failed to toggle theme:", error);
        }
      })();
    };

    window.addEventListener("keydown", onKeyDown, { signal: controller.signal });
    return () => controller.abort();
  }, []);

  return <>{children}</>;
}
