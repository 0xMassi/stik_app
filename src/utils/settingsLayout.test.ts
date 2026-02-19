import { describe, expect, it } from "vitest";
import { SETTINGS_MODAL_MAX_WIDTH, SETTINGS_MODAL_MIN_WIDTH } from "./settingsLayout";

describe("settings layout sizing", () => {
  it("keeps a desktop minimum width that can show the full tab bar", () => {
    expect(SETTINGS_MODAL_MIN_WIDTH).toBeGreaterThanOrEqual(760);
    expect(SETTINGS_MODAL_MAX_WIDTH).toBeGreaterThan(SETTINGS_MODAL_MIN_WIDTH);
  });
});
