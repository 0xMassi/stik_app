import type { VimMode } from "@/extensions/cm-vim";

interface VimCommandKeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  vimEnabled: boolean | null;
  vimMode: VimMode;
  targetInsideEditor: boolean;
}

export function shouldOpenVimCommandBar({
  key,
  metaKey,
  ctrlKey,
  altKey,
  vimEnabled,
  vimMode,
  targetInsideEditor,
}: VimCommandKeyInput): boolean {
  if (key !== ":") return false;
  if (!vimEnabled) return false;
  if (metaKey || ctrlKey || altKey) return false;
  if (!targetInsideEditor) return false;
  return vimMode === "normal" || vimMode === "visual" || vimMode === "visual-line";
}
