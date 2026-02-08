import { describe, expect, it } from "vitest";
import { normalizeMarkdownForCopy } from "./normalizeMarkdownForCopy";

describe("normalizeMarkdownForCopy", () => {
  it("removes internal <br> placeholder lines from copied markdown", () => {
    const input = "# Title\n\n<br>\n\ntest\n\n<br>\n\ntest\n\n<br>\n\n<br>\n\n<br>\n\n";

    expect(normalizeMarkdownForCopy(input)).toBe("# Title\n\ntest\n\ntest");
  });

  it("keeps regular markdown content intact", () => {
    const input = "- item 1\n- item 2  \n";

    expect(normalizeMarkdownForCopy(input)).toBe("- item 1\n- item 2");
  });
});
