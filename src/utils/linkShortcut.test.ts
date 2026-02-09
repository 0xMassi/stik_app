import { describe, expect, it } from "vitest";
import { isLinkEditShortcut } from "./linkShortcut";

describe("isLinkEditShortcut", () => {
  it("accepts Cmd+K", () => {
    expect(isLinkEditShortcut({
      key: "k",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
    })).toBe(true);
  });

  it("accepts Cmd+L", () => {
    expect(isLinkEditShortcut({
      key: "L",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
    })).toBe(true);
  });

  it("accepts Ctrl+K for non-mac keyboards", () => {
    expect(isLinkEditShortcut({
      key: "k",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
    })).toBe(true);
  });

  it("rejects unrelated combos", () => {
    expect(isLinkEditShortcut({
      key: "k",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    })).toBe(false);
    expect(isLinkEditShortcut({
      key: "p",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
    })).toBe(false);
    expect(isLinkEditShortcut({
      key: "k",
      metaKey: true,
      ctrlKey: false,
      altKey: true,
    })).toBe(false);
  });
});
