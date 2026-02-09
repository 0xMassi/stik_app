import { describe, expect, it } from "vitest";
import { extractDroppedImagePath } from "./droppedImagePath";

describe("extractDroppedImagePath", () => {
  it("extracts image path from file URL", () => {
    expect(extractDroppedImagePath("file:///Users/massi/Desktop/photo.png")).toBe(
      "/Users/massi/Desktop/photo.png"
    );
  });

  it("decodes escaped file URL segments", () => {
    expect(extractDroppedImagePath("file:///Users/massi/Desktop/screen%20shot.JPG")).toBe(
      "/Users/massi/Desktop/screen shot.JPG"
    );
  });

  it("accepts absolute local image paths", () => {
    expect(extractDroppedImagePath("/Users/massi/Desktop/pic.webp")).toBe(
      "/Users/massi/Desktop/pic.webp"
    );
  });

  it("rejects non-image paths and remote URLs", () => {
    expect(extractDroppedImagePath("/Users/massi/Desktop/file.txt")).toBeNull();
    expect(extractDroppedImagePath("https://example.com/image.png")).toBeNull();
  });
});
