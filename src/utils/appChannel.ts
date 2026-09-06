/// Release-channel detection.
///
/// Beta builds are produced by `.github/workflows/beta.yml`, which stamps
/// `tauri.conf.json` with a SemVer pre-release version (`0.8.0-beta.7`) and
/// renames the app to "Stik Beta". The version string is the reliable signal:
/// it is set by the workflow itself, whereas the product name could drift.

/// BETA for a nonempty SemVer pre-release identifier; null for stable builds.
export function channelLabel(version: string): string | null {
  const withoutBuild = version.trim().split("+")[0];
  const dash = withoutBuild.indexOf("-");
  return dash !== -1 && dash < withoutBuild.length - 1 ? "BETA" : null;
}
