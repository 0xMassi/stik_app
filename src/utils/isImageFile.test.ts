import { describe, expect, it } from "vitest";
import { isImageFile } from "./isImageFile";

describe("isImageFile", () => {
  it("accepts files with image MIME types", () => {
    expect(isImageFile({ type: "image/png", name: "photo" } as File)).toBe(true);
  });

  it("accepts image files by extension when MIME type is empty", () => {
    expect(isImageFile({ type: "", name: "photo.JPG" } as File)).toBe(true);
  });

  it("accepts image files by extension when MIME type is octet-stream", () => {
    expect(isImageFile({ type: "application/octet-stream", name: "photo.webp" } as File)).toBe(true);
  });

  it("rejects non-image files", () => {
    expect(isImageFile({ type: "", name: "document.pdf" } as File)).toBe(false);
    expect(isImageFile({ type: "text/plain", name: "notes.txt" } as File)).toBe(false);
  });
});
