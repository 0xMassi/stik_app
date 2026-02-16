import type { VimMode } from "@/extensions/cm-vim";

interface VimCommandBridgeParams {
  onSaveAndClose?: () => void;
  onCloseWithoutSaving?: () => void;
  onModeChange?: (mode: VimMode) => void;
}

export function createVimCommandCallbacks({
  onSaveAndClose,
  onCloseWithoutSaving,
  onModeChange,
}: VimCommandBridgeParams) {
  return {
    onSaveAndClose: () => onSaveAndClose?.(),
    onCloseWithoutSaving: () => onCloseWithoutSaving?.(),
    onCommandMode: () => onModeChange?.("command"),
  };
}
