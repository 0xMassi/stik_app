/**
 * The CSP has to permit the sources the font code actually loads from.
 *
 * This existed as a silent, total failure: there was no `font-src` at all, so it
 * fell back to `default-src 'self'` and every font — the bundled Google ones and
 * any user-imported file — was blocked with nothing but a console violation.
 * Parsing the real config keeps the two in sync.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = JSON.parse(
  readFileSync(resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf-8"),
) as { app: { security: { csp: string } } };

function directive(name: string): string[] | null {
  for (const part of config.app.security.csp.split(";")) {
    const tokens = part.trim().split(/\s+/);
    if (tokens[0] === name) return tokens.slice(1);
  }
  return null;
}

describe("CSP font sources", () => {
  it("declares font-src explicitly rather than inheriting default-src", () => {
    // Without this, default-src 'self' silently blocks every font.
    expect(directive("font-src")).not.toBeNull();
  });

  it("allows data: URLs, which is how imported font files are loaded", () => {
    expect(directive("font-src")).toContain("data:");
  });

  it("allows the Google Fonts file origin for the built-in families", () => {
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("allows the Google Fonts stylesheet origin", () => {
    // loadGoogleFont() injects <link rel=stylesheet> pointing here, so
    // style-src has to permit it or the built-in fonts never resolve.
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
  });

  it("still restricts script-src to self", () => {
    // Guard against widening the wrong directive while fixing fonts.
    expect(directive("script-src")).toEqual(["'self'"]);
  });
});
