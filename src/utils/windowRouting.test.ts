import { describe, expect, it } from "vitest";
import { resolveWindowInfo } from "./windowRouting";

describe("window routing", () => {
  it.each(["search", "manager", "command-palette"])(
    "routes %s to the command palette chunk",
    (windowName) => {
      expect(resolveWindowInfo(`?window=${windowName}`).type).toBe(
        "command-palette",
      );
    },
  );

  it("keeps sticked viewing metadata", () => {
    expect(
      resolveWindowInfo("?window=sticked&id=abc&viewing=true"),
    ).toEqual({ type: "sticked", id: "abc", viewing: true });
  });

  it("defaults unknown windows to the capture surface", () => {
    expect(resolveWindowInfo("?window=unknown")).toEqual({ type: "postit" });
  });
});
