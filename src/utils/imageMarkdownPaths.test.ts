import { describe, expect, it } from "vitest";
import { resolveImagePaths, unresolveImagePaths } from "./imageMarkdownPaths";

describe("imageMarkdownPaths", () => {
  it("converts legacy asset://localhost links to relative .assets paths", () => {
    const input =
      "![shot](asset://localhost/Users/massi/Documents/Stik/Inbox/.assets/screen%20one.png)";

    expect(unresolveImagePaths(input)).toBe("![shot](.assets/screen one.png)");
  });

  it("converts asset.localhost links to relative .assets paths", () => {
    const input =
      "![shot](https://asset.localhost/Users/massi/Documents/Stik/Inbox/.assets/screen-two.png)";

    expect(unresolveImagePaths(input)).toBe("![shot](.assets/screen-two.png)");
  });

  it("converts file:// links that point into .assets to relative .assets paths", () => {
    const input =
      "![shot](file:///Users/massi/Documents/Stik/Inbox/.assets/screen-three.png)";

    expect(unresolveImagePaths(input)).toBe("![shot](.assets/screen-three.png)");
  });

  it("keeps non-asset markdown links unchanged", () => {
    const input = "![shot](https://example.com/image.png)";

    expect(unresolveImagePaths(input)).toBe(input);
  });

  it("resolves relative .assets paths with toFileSrc", () => {
    const markdown = "![shot](.assets/pasted.png)";
    const toFileSrc = (absPath: string) => `file://${absPath}`;

    expect(resolveImagePaths(markdown, "/tmp/Stik/Inbox", toFileSrc)).toBe(
      "![shot](file:///tmp/Stik/Inbox/.assets/pasted.png)"
    );
  });

  it("normalizes legacy absolute asset links before resolving for display", () => {
    const markdown =
      "![shot](asset://localhost/Users/massi/Documents/Stik/Inbox/.assets/pasted.png)";
    const toFileSrc = (absPath: string) => `file://${absPath}`;

    expect(resolveImagePaths(markdown, "/tmp/Stik/Inbox", toFileSrc)).toBe(
      "![shot](file:///tmp/Stik/Inbox/.assets/pasted.png)"
    );
  });
});
