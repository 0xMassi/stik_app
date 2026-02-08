import { describe, expect, it } from "vitest";
import {
  isMarkdownEffectivelyEmpty,
  normalizeMarkdownForCopy,
  normalizeMarkdownForState,
} from "./normalizeMarkdownForCopy";

describe("normalizeMarkdownForCopy", () => {
  it("removes internal <br> placeholder lines from copied markdown", () => {
    const input = "# Title\n\n<br>\n\ntest\n\n<br>\n\ntest\n\n<br>\n\n<br>\n\n<br>\n\n";

    expect(normalizeMarkdownForCopy(input)).toBe("# Title\n\ntest\n\ntest");
  });

  it("keeps regular markdown content intact", () => {
    const input = "- item 1\n- item 2  \n";

    expect(normalizeMarkdownForCopy(input)).toBe("- item 1\n- item 2");
  });

  it("treats placeholder <br> lines as effectively empty markdown", () => {
    expect(isMarkdownEffectivelyEmpty("<br>\n\n<br />\n\n")).toBe(true);
  });

  it("treats real content mixed with <br> placeholders as non-empty", () => {
    expect(isMarkdownEffectivelyEmpty("hello\n\n<br>\n\n")).toBe(false);
  });

  it("normalizes effectively-empty markdown to an empty state string", () => {
    expect(normalizeMarkdownForState("<br>\n\n<br />\n")).toBe("");
  });

  it("keeps non-empty markdown unchanged in state normalization", () => {
    const input = "hello\n\n<br>\n";
    expect(normalizeMarkdownForState(input)).toBe(input);
  });
});
