import { describe, expect, it } from "vitest";
import { shouldHideCaptureOnBlur } from "./blurAutoHide";

describe("shouldHideCaptureOnBlur", () => {
  it("hides when empty and grace is inactive", () => {
    expect(
      shouldHideCaptureOnBlur({
        content: "   ",
        nowMs: 2000,
        ignoreUntilMs: 1000,
      })
    ).toBe(true);
  });

  it("hides when content is only a slash query and grace is inactive", () => {
    expect(
      shouldHideCaptureOnBlur({
        content: "/work",
        nowMs: 2000,
        ignoreUntilMs: 1000,
      })
    ).toBe(true);
  });

  it("does not hide while grace window is active", () => {
    expect(
      shouldHideCaptureOnBlur({
        content: "",
        nowMs: 1200,
        ignoreUntilMs: 1500,
      })
    ).toBe(false);
  });

  it("does not hide when there is meaningful content", () => {
    expect(
      shouldHideCaptureOnBlur({
        content: "hello",
        nowMs: 2000,
        ignoreUntilMs: 1000,
      })
    ).toBe(false);
  });
});
