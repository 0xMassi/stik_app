import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const outputDirectory = process.env.STIK_BUNDLE_DIR || "dist";
const maximumEntryBytes = Number(
  process.env.STIK_ENTRY_BUDGET_BYTES || "750000",
);
const manifestPath = join(outputDirectory, ".vite", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entry = Object.values(manifest).find((chunk) => chunk.isEntry);

if (!entry?.file) {
  throw new Error(`No entry chunk found in ${manifestPath}`);
}

const entryPath = join(outputDirectory, entry.file);
const { size } = await stat(entryPath);
const formattedSize = new Intl.NumberFormat("en").format(size);
const formattedBudget = new Intl.NumberFormat("en").format(maximumEntryBytes);

if (size > maximumEntryBytes) {
  console.error(
    `Entry bundle ${entry.file} is ${formattedSize} bytes; budget is ${formattedBudget} bytes.`,
  );
  process.exit(1);
}

console.log(
  `Entry bundle ${entry.file} is ${formattedSize} bytes (budget ${formattedBudget}).`,
);
