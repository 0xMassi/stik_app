interface LinkShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export function isLinkEditShortcut(event: LinkShortcutEvent): boolean {
  if (event.altKey) return false;
  if (!event.metaKey && !event.ctrlKey) return false;
  const key = event.key.toLowerCase();
  return key === "k" || key === "l";
}
