import {
  findExternalLinkAtOffset,
  shouldShowCmdLinkCursor,
} from "./externalLinkHitTest";
import { describe, expect, it } from "vitest";

describe("findExternalLinkAtOffset", () => {
  it("returns markdown link URL when offset is inside markdown link", () => {
    const line = "[Apple](https://apple.com)";
    expect(findExternalLinkAtOffset(line, 2)).toBe("https://apple.com");
  });

  it("returns bare URL when offset is inside plain URL", () => {
    const line = "visit https://example.com now";
    expect(findExternalLinkAtOffset(line, 10)).toBe("https://example.com");
  });

  it("returns null when offset is outside links", () => {
    const line = "plain text only";
    expect(findExternalLinkAtOffset(line, 3)).toBeNull();
  });
});

describe("shouldShowCmdLinkCursor", () => {
  it("returns true when cmd is held on a link", () => {
    const line = "[Apple](https://apple.com)";
    expect(
      shouldShowCmdLinkCursor({
        metaKey: true,
        lineText: line,
        offset: 3,
      })
    ).toBe(true);
  });

  it("returns false when cmd is not held", () => {
    const line = "[Apple](https://apple.com)";
    expect(
      shouldShowCmdLinkCursor({
        metaKey: false,
        lineText: line,
        offset: 3,
      })
    ).toBe(false);
  });
});
