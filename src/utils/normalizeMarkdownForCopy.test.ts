import { describe, expect, it } from "vitest";
import {
  isMarkdownEffectivelyEmpty,
  normalizeMarkdownForCopy,
} from "./normalizeMarkdownForCopy";

describe("normalizeMarkdownForCopy", () => {
  it("collapses triple+ newlines and trims trailing whitespace", () => {
    const input = "# Title\n\n\n\ntest\n\n\n\ntest\n\n\n\n\n\n";

    expect(normalizeMarkdownForCopy(input)).toBe("# Title\n\ntest\n\ntest");
  });

  it("keeps regular markdown content intact", () => {
    const input = "- item 1\n- item 2  \n";

    expect(normalizeMarkdownForCopy(input)).toBe("- item 1\n- item 2");
  });

  it("treats whitespace-only content as effectively empty", () => {
    expect(isMarkdownEffectivelyEmpty("  \n\n  \n")).toBe(true);
  });

  it("treats real content as non-empty", () => {
    expect(isMarkdownEffectivelyEmpty("hello\n\n")).toBe(false);
  });
});
