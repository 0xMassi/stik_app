interface EscapeLikeEvent {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export function consumeEscapeForPopover(
  event: EscapeLikeEvent,
  onEscape: () => void
): boolean {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  event.stopPropagation();
  onEscape();
  return true;
}
