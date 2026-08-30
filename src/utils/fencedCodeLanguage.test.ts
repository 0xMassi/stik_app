import { describe, expect, it } from "vitest";
import { hasNamedFencedCodeBlock } from "./fencedCodeLanguage";

describe("named fenced code detection", () => {
  it("requests language data only for a named fence", () => {
    expect(hasNamedFencedCodeBlock("```typescript\nconst x = 1\n```"))
      .toBe(true);
    expect(hasNamedFencedCodeBlock("~~~ python\nprint('hi')\n~~~")).toBe(
      true,
    );
  });

  it("does not load the language catalogue for plain or unnamed code", () => {
    expect(hasNamedFencedCodeBlock("plain note")).toBe(false);
    expect(hasNamedFencedCodeBlock("```\nplain code\n```"))
      .toBe(false);
    expect(hasNamedFencedCodeBlock("`inline code`")).toBe(false);
  });
});
