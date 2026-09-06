import { describe, expect, it } from "vitest";
import { isImageUrl } from "./isImageUrl";

describe("isImageUrl", () => {
  it("accepts signed GitHub private-user-images png URLs", () => {
    const value =
      "https://private-user-images.githubusercontent.com/21236494/546923426-d5dd543d-eda8-4d02-a986-cb8bc15cdd66.png?jwt=token";

    expect(isImageUrl(value)).toBe(true);
  });

  it("accepts regular jpg URLs", () => {
    expect(isImageUrl("https://example.com/photo.jpg")).toBe(true);
    expect(isImageUrl("https://example.com/photo.jpeg?width=1200")).toBe(true);
  });

  it("accepts query-format image URLs", () => {
    expect(
      isImageUrl("https://pbs.twimg.com/media/HAnWnITacAEIpk0?format=jpg&name=4096x4096")
    ).toBe(true);
    expect(isImageUrl("https://cdn.example.com/resource?format=png")).toBe(true);
  });

  it("rejects non-image URLs", () => {
    expect(isImageUrl("https://example.com/page")).toBe(false);
    expect(isImageUrl("https://example.com/file.pdf")).toBe(false);
  });

  it("rejects non-http protocols", () => {
    expect(isImageUrl("file:///tmp/image.png")).toBe(false);
    expect(isImageUrl("data:image/png;base64,abc")).toBe(false);
  });
});
