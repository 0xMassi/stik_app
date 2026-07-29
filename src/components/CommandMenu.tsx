import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "@/hooks/useTranslation";
import type { TranslationKey } from "@/i18n";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/// In-window command menu, opened with Cmd/Ctrl+K.
///
/// Stik's full palette is a separate Tauri window with search and folders;
/// this is the lighter thing you reach for mid-sentence, when leaving the
/// current window would cost the thought you were capturing.
interface CommandAction {
  id: string;
  labelKey: TranslationKey;
  run: () => Promise<void>;
}

export default function CommandMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const actions = useMemo<CommandAction[]>(
    () => [
      { id: "search", labelKey: "shortcut.search", run: () => invoke("open_command_palette") },
      { id: "settings", labelKey: "shortcut.settings", run: () => invoke("open_settings") },
      { id: "last_note", labelKey: "shortcut.lastNote", run: () => invoke("reopen_last_note") },
      { id: "manager", labelKey: "shortcut.manager", run: () => invoke("open_manager") },
    ],
    [],
  );

  const runAction = useCallback(async (action: CommandAction) => {
    setOpen(false);
    try {
      await action.run();
    } catch (error) {
      console.error(`Command "${action.id}" failed:`, error);
    }
  }, []);

  // Cmd/Ctrl+K toggles the command menu.
  useEffect(() => {
    const controller = new AbortController();

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key !== "k") return;

      // Cmd+K is already "insert link" inside the editor (Editor.tsx binds
      // Mod-k), so leave it alone while the user is writing. Without this,
      // Cmd+K mid-note both inserted a link and opened this menu.
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable ||
        target?.closest(".cm-editor")
      ) {
        return;
      }

      e.preventDefault();
      setOpen((prev) => !prev);
    };

    document.addEventListener("keydown", onKeyDown, { signal: controller.signal });
    return () => controller.abort();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} label={t("palette.commandMenu")}>
      <CommandInput placeholder={t("palette.commandMenuPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.commandMenuEmpty")}</CommandEmpty>
        <CommandGroup>
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={t(action.labelKey)}
              onSelect={() => void runAction(action)}
            >
              {t(action.labelKey)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
