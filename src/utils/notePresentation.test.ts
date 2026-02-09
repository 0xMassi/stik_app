import { describe, expect, it } from "vitest";
import {
  extractNoteTitle,
  normalizeNoteSnippet,
  normalizeNoteTitle,
} from "./notePresentation";

describe("notePresentation", () => {
  it("extracts a clean title from heading + markdown links", () => {
    const content =
      "# Amazon Saves [iPhone Pro](https://www.amazon.in/iPhone-17-Pro-Max-Promotion)\n\n<br>\n";

    expect(extractNoteTitle(content)).toBe("Amazon Saves iPhone Pro");
  });

  it("extracts title from query-format image-style autolinks and removes <br>", () => {
    const content =
      "<https://pbs.twimg.com/media/HAnWnITacAEIpk0?format=jpg&name=4096x4096> <br>";

    expect(extractNoteTitle(content)).toBe(
      "https://pbs.twimg.com/media/HAnWnITacAEIpk0?format=jpg&name=4096x4096"
    );
  });

  it("keeps readable text from mixed inline markdown", () => {
    const title =
      "Apple Notes <https://apple.com> [Apple Website](https://apple.com)";

    expect(normalizeNoteTitle(title)).toBe("Apple Notes https://apple.com Apple Website");
  });

  it("normalizes snippets for display by removing placeholder breaks and markdown syntax", () => {
    const snippet =
      "Hello <br> [Google](https://google.com) and ![img](https://example.com/a.png)";

    expect(normalizeNoteSnippet(snippet)).toBe("Hello Google and img");
  });
});
