import { readFile } from "node:fs/promises";

const expectedVersion = "14.0";
const expectedSwiftVersion = ".macOS(.v14)";
const expectedRunner = "runs-on: macos-14";
const expectedCaskRequirement = "depends_on macos: :sonoma";

const failures = [];

async function requireText(path, expected, description) {
  const content = await readFile(path, "utf8");
  if (!content.includes(expected)) {
    failures.push(`${path}: expected ${description} (${JSON.stringify(expected)})`);
  }
}

const tauriConfig = JSON.parse(
  await readFile("src-tauri/tauri.conf.json", "utf8"),
);
const configuredVersion = tauriConfig.bundle?.macOS?.minimumSystemVersion;
if (configuredVersion !== expectedVersion) {
  failures.push(
    `src-tauri/tauri.conf.json: minimumSystemVersion is ${JSON.stringify(configuredVersion)}; expected ${JSON.stringify(expectedVersion)}`,
  );
}

await Promise.all([
  requireText(
    "src-tauri/darwinkit/Package.swift",
    expectedSwiftVersion,
    "the Swift deployment target",
  ),
  requireText("README.md", "macOS 14+", "the public support requirement"),
  requireText(
    "CONTRIBUTING.md",
    "| macOS | 14+ |",
    "the contributor support requirement",
  ),
  requireText(
    ".github/homebrew-cask-template.rb",
    expectedCaskRequirement,
    "the Homebrew support requirement",
  ),
  requireText(
    ".github/workflows/release.yml",
    expectedCaskRequirement,
    "the generated Homebrew support requirement",
  ),
  requireText(
    ".github/workflows/ci.yml",
    expectedRunner,
    "the macOS CI runner",
  ),
  requireText(
    ".github/workflows/release.yml",
    expectedRunner,
    "the release runner",
  ),
  requireText(
    ".github/workflows/beta.yml",
    expectedRunner,
    "the beta runner",
  ),
]);

if (failures.length > 0) {
  console.error("macOS support declarations disagree:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("macOS support is consistently set to 14 (Sonoma).");
