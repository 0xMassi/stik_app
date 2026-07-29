/// Release-channel detection.
///
/// Beta builds are produced by `.github/workflows/beta.yml`, which stamps
/// `tauri.conf.json` with a SemVer pre-release version (`0.8.0-beta.7`) and
/// renames the app to "Stik Beta". The version string is the reliable signal:
/// it is set by the workflow itself, whereas the product name could drift.

export type ReleaseChannel = "stable" | "beta";

/// SemVer pre-release: everything after the first `-`, before any `+` build
/// metadata. `0.8.0-beta.7` → beta, `0.8.0` → stable.
export function channelFor(version: string): ReleaseChannel {
  const trimmed = version.trim();
  if (!trimmed) return "stable";

  const withoutBuild = trimmed.split("+")[0];
  const dash = withoutBuild.indexOf("-");
  if (dash === -1) return "stable";

  const preRelease = withoutBuild.slice(dash + 1);
  return preRelease.length > 0 ? "beta" : "stable";
}

export function isPreRelease(version: string): boolean {
  return channelFor(version) === "beta";
}

/// Short label for the channel pill — "BETA" for anything pre-release.
/// Returns null for stable so callers can skip rendering entirely.
export function channelLabel(version: string): string | null {
  return isPreRelease(version) ? "BETA" : null;
}
