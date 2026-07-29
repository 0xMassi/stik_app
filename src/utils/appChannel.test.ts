import { describe, it, expect } from "vitest";
import { channelFor, isPreRelease, channelLabel } from "./appChannel";

describe("channelFor", () => {
  it("treats a plain release version as stable", () => {
    expect(channelFor("0.8.0")).toBe("stable");
    expect(channelFor("1.0.0")).toBe("stable");
  });

  it("treats any SemVer pre-release as beta", () => {
    expect(channelFor("0.8.0-beta.7")).toBe("beta");
    expect(channelFor("0.9.0-rc.1")).toBe("beta");
    expect(channelFor("1.0.0-alpha")).toBe("beta");
  });

  it("ignores build metadata when deciding", () => {
    // `+sha` is build metadata, not a pre-release marker.
    expect(channelFor("0.8.0+abc1234")).toBe("stable");
    expect(channelFor("0.8.0-beta.7+abc1234")).toBe("beta");
  });

  it("falls back to stable for empty or whitespace input", () => {
    // getVersion() is async; the version is "" on first render, and flashing
    // a BETA pill on a stable build would be worse than showing it late.
    expect(channelFor("")).toBe("stable");
    expect(channelFor("   ")).toBe("stable");
  });

  it("treats a trailing dash with no identifier as stable", () => {
    expect(channelFor("0.8.0-")).toBe("stable");
  });
});

describe("isPreRelease", () => {
  it("mirrors channelFor", () => {
    expect(isPreRelease("0.8.0-beta.7")).toBe(true);
    expect(isPreRelease("0.8.0")).toBe(false);
  });
});

describe("channelLabel", () => {
  it("returns BETA for pre-release builds", () => {
    expect(channelLabel("0.8.0-beta.7")).toBe("BETA");
  });

  it("returns null on stable so nothing renders", () => {
    expect(channelLabel("0.8.0")).toBeNull();
    expect(channelLabel("")).toBeNull();
  });
});
