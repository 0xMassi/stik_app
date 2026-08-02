import { describe, it, expect } from "vitest";
import {
  matchesShortcut,
  matchesEitherPrimary,
  parseShortcut,
} from "./matchShortcut";

/**
 * Builds the event shape the matcher reads. `code` is the physical key; `key`
 * is deliberately absent, because relying on it is the bug under test.
 */
function ev(
  code: string,
  mods: Partial<{
    meta: boolean;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
  }> = {},
) {
  return {
    code,
    metaKey: mods.meta ?? false,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  };
}

describe("matchesShortcut (#96)", () => {
  it("matches on physical position, so AZERTY behaves like QWERTY", () => {
    // The reported bug: an AZERTY user pressing the key labelled "M" produces
    // e.key = "," while e.code stays KeyM. Matching the code makes the binding
    // land on the same physical key on every layout.
    expect(
      matchesShortcut("Cmd+Shift+M", ev("KeyM", { meta: true, shift: true })),
    ).toBe(true);
  });

  it("fires Cmd+Alt+D, which the e.key comparison could never match", () => {
    // macOS yields "∂" for Cmd+Alt+D on US, ABC, Italian and French layouts,
    // so `e.key === "d"` was dead everywhere.
    expect(
      matchesShortcut("Cmd+Alt+D", ev("KeyD", { meta: true, alt: true })),
    ).toBe(true);
  });

  it("matches punctuation by position", () => {
    expect(matchesShortcut("Cmd+Period", ev("Period", { meta: true }))).toBe(
      true,
    );
    expect(
      matchesShortcut(
        "Cmd+Shift+Comma",
        ev("Comma", { meta: true, shift: true }),
      ),
    ).toBe(true);
  });

  it("requires modifiers to match exactly", () => {
    // Cmd+Shift+P must not fire when Alt is also down.
    expect(
      matchesShortcut(
        "Cmd+Shift+P",
        ev("KeyP", { meta: true, shift: true, alt: true }),
      ),
    ).toBe(false);
    expect(matchesShortcut("Cmd+Shift+P", ev("KeyP", { meta: true }))).toBe(
      false,
    );
  });

  it("does not match a different physical key", () => {
    expect(
      matchesShortcut("Cmd+Shift+M", ev("Comma", { meta: true, shift: true })),
    ).toBe(false);
  });

  it("never matches a cleared shortcut", () => {
    // #92 made empty mean "unbound"; it must not become a wildcard.
    expect(matchesShortcut("", ev("KeyM", { meta: true }))).toBe(false);
  });

  it("never matches a token that has no physical key", () => {
    // The recorder's e.key.toUpperCase() fallback can store "@", which Rust
    // cannot register either. It must be inert, not throw and not match.
    expect(parseShortcut("Cmd+Shift+@")).toBeNull();
    expect(
      matchesShortcut("Cmd+Shift+@", ev("Digit2", { meta: true, shift: true })),
    ).toBe(false);
  });

  it("expands arrows and digits back to their codes", () => {
    expect(parseShortcut("Cmd+Up")?.code).toBe("ArrowUp");
    expect(parseShortcut("Cmd+1")?.code).toBe("Digit1");
    expect(parseShortcut("Cmd+F5")?.code).toBe("F5");
  });
});

describe("matchesEitherPrimary", () => {
  it("accepts Cmd or Ctrl for the built-in bindings that always have", () => {
    expect(
      matchesEitherPrimary(
        "Cmd+Shift+D",
        ev("KeyD", { meta: true, shift: true }),
      ),
    ).toBe(true);
    expect(
      matchesEitherPrimary(
        "Cmd+Shift+D",
        ev("KeyD", { ctrl: true, shift: true }),
      ),
    ).toBe(true);
  });

  it("still needs a primary modifier", () => {
    expect(
      matchesEitherPrimary("Cmd+Shift+D", ev("KeyD", { shift: true })),
    ).toBe(false);
  });
});
