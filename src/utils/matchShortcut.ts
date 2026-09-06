/**
 * One place that decides whether a keyboard event matches a stored shortcut.
 *
 * Shortcuts are stored by PHYSICAL key: the recorder builds the string from
 * `e.code` (`KeyM` -> `"M"`) and Rust registers it as a `Code`. So matching has
 * to compare `e.code` as well.
 *
 * Handlers that compared `e.key` were reading the *character the layout
 * produces* instead of the key's position. On AZERTY the physical KeyM prints
 * ",", which is why Cmd+Shift+M only fired when the user pressed the key
 * labelled "," (#96). The same mistake makes Cmd+Alt+D unreachable on every
 * layout, because macOS yields "∂" for that combination.
 */

/** Tokens that are already a `KeyboardEvent.code`. */
const VERBATIM_CODES = new Set([
  "Space",
  "Enter",
  "Backspace",
  "Tab",
  "Escape",
  "Comma",
  "Period",
  "Slash",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Semicolon",
  "Quote",
  "Backquote",
  "Minus",
  "Equal",
]);

/** The recorder shortens the arrow codes; expand them back. */
const ARROW_CODES: Record<string, string> = {
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
};

export interface ParsedShortcut {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** A `KeyboardEvent.code` value, e.g. "KeyM". */
  code: string;
}

/** Turn the stored key token back into the `KeyboardEvent.code` it came from. */
function tokenToCode(token: string): string | null {
  if (/^[A-Za-z]$/.test(token)) return `Key${token.toUpperCase()}`;
  if (/^[0-9]$/.test(token)) return `Digit${token}`;
  if (ARROW_CODES[token]) return ARROW_CODES[token];
  if (VERBATIM_CODES.has(token)) return token;
  if (/^F\d{1,2}$/.test(token)) return token;

  // The recorder falls back to `e.key.toUpperCase()` for keys it cannot map,
  // producing tokens like "@" that correspond to no code. Rust cannot register
  // those either, so they must never match rather than matching by accident.
  return null;
}

export function parseShortcut(shortcut: string): ParsedShortcut | null {
  if (!shortcut) return null;

  const parts = shortcut.split("+");
  const token = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  const code = tokenToCode(token);
  if (!code) return null;

  return {
    meta: modifiers.some((p) => p === "Cmd" || p === "Command" || p === "Meta"),
    ctrl: modifiers.some((p) => p === "Ctrl" || p === "Control"),
    shift: modifiers.includes("Shift"),
    alt: modifiers.some((p) => p === "Alt" || p === "Option"),
    code,
  };
}

/**
 * True when the event is exactly this shortcut. Modifiers must match exactly,
 * so Cmd+Shift+P does not fire on Cmd+Shift+Alt+P.
 */
export function matchesShortcut(
  shortcut: string,
  event: Pick<
    KeyboardEvent,
    "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;

  return (
    parsed.meta === event.metaKey &&
    parsed.ctrl === event.ctrlKey &&
    parsed.shift === event.shiftKey &&
    parsed.alt === event.altKey &&
    parsed.code === event.code
  );
}

/**
 * True when the event matches with either Cmd or Ctrl as the primary modifier.
 * Used by the few built-in bindings that have always accepted both.
 */
export function matchesEitherPrimary(
  shortcut: string,
  event: Pick<
    KeyboardEvent,
    "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;

  const primaryHeld = event.metaKey || event.ctrlKey;
  return (
    primaryHeld &&
    parsed.shift === event.shiftKey &&
    parsed.alt === event.altKey &&
    parsed.code === event.code
  );
}
