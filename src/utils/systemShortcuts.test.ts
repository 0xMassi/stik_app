import { describe, it, expect } from "vitest";
import {
  SYSTEM_SHORTCUT_ACTIONS,
  getSystemShortcutValues,
  isClearableAction,
} from "./systemShortcuts";

describe("clearing system shortcuts (#92)", () => {
  it("lets every action be cleared except Settings", () => {
    // Settings is the way back: the tray icon and the Dock icon can both be
    // hidden, so unsetting this too would leave no route into Settings at all.
    expect(isClearableAction("settings")).toBe(false);

    for (const action of SYSTEM_SHORTCUT_ACTIONS) {
      if (action === "settings") continue;
      expect(isClearableAction(action)).toBe(true);
    }
  });

  it("treats a cleared shortcut as reserving nothing", () => {
    // Otherwise "" counts as a taken binding and blocks unrelated shortcuts.
    const values = getSystemShortcutValues({
      search: "Cmd+Shift+P",
      voice_note: "",
      zen_mode: "Cmd+Period",
    });

    expect(values).toEqual(["Cmd+Shift+P", "Cmd+Period"]);
    expect(values).not.toContain("");
  });

  it("keeps every binding when nothing is cleared", () => {
    const values = getSystemShortcutValues({
      search: "Cmd+Shift+P",
      manager: "Cmd+Shift+M",
    });

    expect(values).toHaveLength(2);
  });
});
