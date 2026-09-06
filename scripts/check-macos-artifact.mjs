// Run in a disposable macOS account: the sidecar initializes its model directory.
// Checks ad-hoc CI bundles too; Developer ID/notarization require separate release QA.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join, resolve } from "node:path";

const [appPath, architecture] = process.argv.slice(2);
assert(appPath && ["arm64", "x86_64"].includes(architecture),
  "Usage: node scripts/check-macos-artifact.mjs /path/to/Stik.app arm64|x86_64");
const app = resolve(appPath);
const run = (command, args) => execFileSync(command, args, {
  encoding: "utf8", timeout: 30_000,
}).trim();

for (const name of ["stik", "darwinkit"]) {
  const binary = join(app, "Contents", "MacOS", name);
  accessSync(binary, constants.X_OK);
  assert.equal(run("lipo", ["-archs", binary]), architecture,
    `${name} must contain only the expected ${architecture} architecture`);
  const metadata = run("xcrun", ["vtool", "-show-build", binary]);
  assert.match(metadata, /^\s*platform MACOS\s*$/m, `${name} must target macOS`);
  assert.match(metadata, /^\s*minos 14\.0\s*$/m, `${name} must support macOS 14`);
}
assert.equal(run("/usr/libexec/PlistBuddy", [
  "-c", "Print :LSMinimumSystemVersion", join(app, "Contents", "Info.plist"),
]), "14.0", "The app must declare macOS 14 support");
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);

const capabilities = JSON.parse(run(join(app, "Contents", "MacOS", "darwinkit"), [
  "query", JSON.stringify({ jsonrpc: "2.0", id: "artifact-smoke", method: "system.capabilities" }),
]));
assert.equal(capabilities.id, "artifact-smoke");
assert.equal(capabilities.jsonrpc, "2.0");
assert.equal(capabilities.error, undefined);
assert.equal(capabilities.result?.arch, architecture, "The bundled sidecar must execute natively");
assert.equal(capabilities.result?.methods?.["nlp.embed"]?.available, true,
  "The bundled sidecar must expose the app's NLP capability");
console.log(`Verified ${architecture} app and sidecar, macOS 14 metadata, signature, and native capabilities.`);
