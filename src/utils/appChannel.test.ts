import { describe, it, expect } from "vitest";
import { channelLabel } from "./appChannel";

describe("channelLabel", () => {
  it("treats a plain release version as stable", () => {
    expect(channelLabel("0.8.0")).toBeNull();
    expect(channelLabel("1.0.0")).toBeNull();
  });

  it("treats any SemVer pre-release as beta", () => {
    expect(channelLabel("0.8.0-beta.7")).toBe("BETA");
    expect(channelLabel("0.9.0-rc.1")).toBe("BETA");
    expect(channelLabel("1.0.0-alpha")).toBe("BETA");
  });

  it("ignores build metadata when deciding", () => {
    // `+sha` is build metadata, not a pre-release marker.
    expect(channelLabel("0.8.0+abc1234")).toBeNull();
    expect(channelLabel("0.8.0+feature-beta")).toBeNull();
    expect(channelLabel("0.8.0-beta.7+abc1234")).toBe("BETA");
  });

  it("falls back to stable for empty or whitespace input", () => {
    // getVersion() is async; the version is "" on first render, and flashing
    // a BETA pill on a stable build would be worse than showing it late.
    expect(channelLabel("")).toBeNull();
    expect(channelLabel("   ")).toBeNull();
  });

  it("treats a trailing dash with no identifier as stable", () => {
    expect(channelLabel("0.8.0-")).toBeNull();
  });
});
