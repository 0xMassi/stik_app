import { describe, expect, it } from "vitest";
import { shouldSaveOnGlobalEscape } from "./captureEscape";

const base = {
  defaultPrevented: false,
  inLinkPopover: false,
  isCopyMenuOpen: false,
  isAutocompleteOpen: false,
  showPicker: false,
  isSaving: false,
  isPinning: false,
};

describe("shouldSaveOnGlobalEscape", () => {
  it("does not save when escape was already handled by editor", () => {
    expect(shouldSaveOnGlobalEscape({ ...base, defaultPrevented: true })).toBe(false);
  });

  it("does not save while slash autocomplete is open", () => {
    expect(shouldSaveOnGlobalEscape({ ...base, isAutocompleteOpen: true })).toBe(false);
  });

  it("does not save when folder picker is visible", () => {
    expect(shouldSaveOnGlobalEscape({ ...base, showPicker: true })).toBe(false);
  });

  it("does not save when copy menu is open", () => {
    expect(shouldSaveOnGlobalEscape({ ...base, isCopyMenuOpen: true })).toBe(false);
  });

  it("does not save while saving or pinning is in progress", () => {
    expect(shouldSaveOnGlobalEscape({ ...base, isSaving: true })).toBe(false);
    expect(shouldSaveOnGlobalEscape({ ...base, isPinning: true })).toBe(false);
  });

  it("does not save when in link popover", () => {
    expect(shouldSaveOnGlobalEscape({ ...base, inLinkPopover: true })).toBe(false);
  });

  it("saves only when no overlay or transient state is active", () => {
    expect(shouldSaveOnGlobalEscape(base)).toBe(true);
  });
});
