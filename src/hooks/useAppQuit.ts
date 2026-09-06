import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Each note window saves its own draft; the native coordinator waits for all. */
export function useAppQuit(save: () => Promise<void>, onError: (error: unknown) => void): void {
  const callbacks = useRef({ save, onError });
  callbacks.current = { save, onError };

  useEffect(() => {
    let disposed = false;
    let attempt: number | null = null;
    let previousInert = false;
    const listeners: UnlistenFn[] = [];
    const restore = () => {
      if (attempt !== null) document.body.inert = previousInert;
      attempt = null;
    };

    async function subscribe() {
      const cancelled = await listen<{ id: number }>("app-quit-cancelled", ({ payload }) => {
        if (attempt === payload.id) restore();
      });
      if (disposed) { cancelled(); return; }
      listeners.push(cancelled);
      const requested = await listen<{ id: number }>("app-quit-requested", async ({ payload: { id } }) => {
        if (disposed || attempt !== null) return;
        attempt = id;
        previousInert = Boolean(document.body.inert);
        document.body.inert = true;
        let saved = false;
        try {
          await callbacks.current.save();
          saved = true;
        } catch (error) {
          callbacks.current.onError(error);
        }
        // A slow save from a cancelled attempt must not approve a later quit.
        if (disposed || attempt !== id) return;
        try { await invoke("complete_app_quit", { id, saved }); }
        catch (error) { callbacks.current.onError(error); }
      });
      if (disposed) { requested(); return; }
      listeners.push(requested);
      await invoke("register_quit_participant");
    }
    void subscribe().catch((error) => { if (!disposed) callbacks.current.onError(error); });
    return () => {
      disposed = true;
      listeners.forEach((unlisten) => unlisten());
      restore();
    };
  }, []);
}
