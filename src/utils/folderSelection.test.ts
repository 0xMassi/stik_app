import { describe, expect, it } from "vitest";
import { resolveCaptureFolder } from "./folderSelection";

describe("resolveCaptureFolder", () => {
  it("prefers requested folder when it exists", () => {
    expect(
      resolveCaptureFolder({
        requestedFolder: "Work",
        defaultFolder: "Inbox",
        availableFolders: ["Inbox", "Work", "Notes"],
      })
    ).toBe("Work");
  });

  it("falls back to default folder when requested folder is missing", () => {
    expect(
      resolveCaptureFolder({
        requestedFolder: "Inbox",
        defaultFolder: "Notes",
        availableFolders: ["Notes", "Work"],
      })
    ).toBe("Notes");
  });

  it("falls back to first available folder when both requested and default are missing", () => {
    expect(
      resolveCaptureFolder({
        requestedFolder: "Inbox",
        defaultFolder: "Ideas",
        availableFolders: ["Alpha", "Zeta"],
      })
    ).toBe("Alpha");
  });

  it("returns empty string when there are no available folders", () => {
    expect(
      resolveCaptureFolder({
        requestedFolder: "Inbox",
        defaultFolder: "Inbox",
        availableFolders: [],
      })
    ).toBe("");
  });
});
