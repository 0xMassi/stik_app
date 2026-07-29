import { describe, it, expect } from "vitest";
import ts from "typescript";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/// Guard against untranslated UI text.
///
/// Three earlier sweeps each missed a different shape, because each matched on
/// line layout: JSX-only, then string-literals-only, then prose-only lines
/// (which skipped `<span>Create custom theme</span>`, since that line also
/// holds tags). This walks the real TypeScript AST instead, so wrapping and
/// formatting are irrelevant — a JSX text node is a JSX text node.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") && !full.includes(".test.")) out.push(full);
  }
  return out;
}

/// Genuinely untranslatable: keyboard nomenclature, units, path fragments,
/// folder examples, and the vim command reference.
const ALLOWED = new Set([
  "AI", "MB", "opt", "tab", "esc", "/command", "/Stik/",
  "Inbox/", "Work/", "Ideas/", 'git -C "', '" push',
  "-- NORMAL --", "-- VISUAL --", "-- VISUAL LINE --", "-- INSERT --", "·", "&middot;",
]);

interface Finding {
  file: string;
  line: number;
  text: string;
}

function scan(file: string): Finding[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: Finding[] = [];
  const lineOf = (n: ts.Node) =>
    source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim().replace(/\s+/g, " ");
      if (
        text.length > 0 &&
        /[A-Za-z]{2}/.test(text) &&
        !ALLOWED.has(text) &&
        !text.startsWith("—")
      ) {
        found.push({ file, line: lineOf(node), text });
      }

      // A t("…") call left in raw JSX text renders the call itself to the
      // user. That shipped once; it must not ship again.
      if (/\bt\(\s*"/.test(node.text)) {
        found.push({ file, line: lineOf(node), text: `LITERAL t() IN TEXT: ${text}` });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

describe("no untranslated UI text", () => {
  it("routes every JSX text node through t()", () => {
    const report = walk("src")
      .flatMap(scan)
      .map((f) => `${f.file}:${f.line}  ${f.text}`)
      .join("\n");

    expect(report).toBe("");
  });
});
