import { describe, expect, it, vi } from "vitest";
import { consumeEscapeForPopover } from "./popoverEscape";

describe("consumeEscapeForPopover", () => {
  it("consumes Escape and runs close callback", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const onEscape = vi.fn();

    const consumed = consumeEscapeForPopover(
      {
        key: "Escape",
        preventDefault,
        stopPropagation,
      },
      onEscape
    );

    expect(consumed).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const onEscape = vi.fn();

    const consumed = consumeEscapeForPopover(
      {
        key: "Enter",
        preventDefault,
        stopPropagation,
      },
      onEscape
    );

    expect(consumed).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});
