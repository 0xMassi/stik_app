import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/// Guard against untranslated UI text creeping back in.
///
/// Two earlier sweeps each missed a whole category — the first only looked at
/// JSX text nodes, the second only at quoted string literals — and both times
/// the catalogues looked complete while the app still rendered English. This
/// test walks the component tree the way a reviewer would and fails on bare
/// prose sitting between JSX tags.
///
/// It is intentionally narrow: it checks JSX *text nodes* only. Quoted
/// literals are far noisier (command names, CSS, keyboard codes) and are left
/// to review.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") && !full.includes(".test.")) out.push(full);
  }
  return out;
}

/// A line that is pure prose: no JSX syntax, no code punctuation.
const CODE_CHARS = /[{}<>=;()[\]`$]|=>/;
const PROSE = /^[A-Za-z][A-Za-z0-9 ,.'’"()%/:!?—–-]*$/;

interface Finding {
  file: string;
  line: number;
  text: string;
}

function findUntranslated(file: string): Finding[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const found: Finding[] = [];

  lines.forEach((raw, idx) => {
    const text = raw.trim();
    if (!text || text.length < 3) return;
    if (/^(\/\/|\*|\/\*|import)/.test(text)) return;
    if (CODE_CHARS.test(text)) return;
    // object properties and function parameters
    if (text.endsWith(",") || /^\w+\s*:/.test(text)) return;
    // bare lowercase identifiers
    if (/^\w+$/.test(text) && text[0] === text[0].toLowerCase()) return;
    if (!PROSE.test(text)) return;

    // A JSX text node closes a tag above it or opens one below.
    const prev = idx > 0 ? lines[idx - 1].trim() : "";
    const next = idx + 1 < lines.length ? lines[idx + 1].trim() : "";
    if (!prev.endsWith(">") && !next.startsWith("<")) return;

    found.push({ file, line: idx + 1, text });
  });

  return found;
}

describe("no untranslated UI text", () => {
  it("has no bare prose in JSX text nodes", () => {
    const findings = walk("src").flatMap(findUntranslated);

    // Readable failure: list every offender with its location so the fix is
    // mechanical rather than a hunt.
    const report = findings
      .map((f) => `${f.file}:${f.line}  ${f.text}`)
      .join("\n");

    expect(report).toBe("");
  });
});
