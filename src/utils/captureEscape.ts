interface GlobalEscapeState {
  defaultPrevented: boolean;
  inLinkPopover: boolean;
  isCopyMenuOpen: boolean;
  isAutocompleteOpen: boolean;
  showPicker: boolean;
  isSaving: boolean;
  isPinning: boolean;
}

export function shouldSaveOnGlobalEscape(state: GlobalEscapeState): boolean {
  if (state.defaultPrevented) return false;
  if (state.inLinkPopover) return false;
  if (state.isCopyMenuOpen) return false;
  if (state.isAutocompleteOpen) return false;
  if (state.showPicker) return false;
  if (state.isSaving) return false;
  if (state.isPinning) return false;
  return true;
}
