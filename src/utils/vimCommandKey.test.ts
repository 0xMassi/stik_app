import { describe, expect, it } from "vitest";
import { shouldOpenVimCommandBar } from "./vimCommandKey";
import type { VimMode } from "@/extensions/cm-vim";

function buildInput(overrides: Partial<Parameters<typeof shouldOpenVimCommandBar>[0]> = {}) {
  return {
    key: ":",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    vimEnabled: true,
    vimMode: "normal" as VimMode,
    targetInsideEditor: true,
    ...overrides,
  };
}

describe("shouldOpenVimCommandBar", () => {
  it("opens on ':' in normal mode when editor is focused", () => {
    expect(shouldOpenVimCommandBar(buildInput())).toBe(true);
  });

  it("opens on ':' in visual mode", () => {
    expect(shouldOpenVimCommandBar(buildInput({ vimMode: "visual" }))).toBe(true);
  });

  it("does not open in insert mode", () => {
    expect(shouldOpenVimCommandBar(buildInput({ vimMode: "insert" }))).toBe(false);
  });

  it("does not open outside editor", () => {
    expect(shouldOpenVimCommandBar(buildInput({ targetInsideEditor: false }))).toBe(false);
  });

  it("does not open with modifier keys", () => {
    expect(shouldOpenVimCommandBar(buildInput({ metaKey: true }))).toBe(false);
    expect(shouldOpenVimCommandBar(buildInput({ ctrlKey: true }))).toBe(false);
    expect(shouldOpenVimCommandBar(buildInput({ altKey: true }))).toBe(false);
  });
});
