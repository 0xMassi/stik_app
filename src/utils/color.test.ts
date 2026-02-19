import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHex } from "./color";

describe("color utils", () => {
  it("converts rgb triplets to hex", () => {
    expect(rgbToHex("255 128 0")).toBe("#ff8000");
  });

  it("clamps out-of-range rgb values", () => {
    expect(rgbToHex("999 -3 42")).toBe("#ff002a");
  });

  it("converts hex to rgb triplets", () => {
    expect(hexToRgb("#112233")).toBe("17 34 51");
  });
});
