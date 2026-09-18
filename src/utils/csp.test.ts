/**
 * The CSP has to permit the sources the app actually loads from.
 *
 * Fonts existed as a silent, total failure: there was no `font-src` at all, so it
 * fell back to `default-src 'self'` and every font — the bundled Google ones and
 * any user-imported file — was blocked with nothing but a console violation.
 * Local images were the same failure in `img-src`: only the non-macOS
 * `http://asset.localhost` form was listed, so the `asset:` URLs the macOS
 * webview actually gets were blocked. Parsing the real config keeps them in sync.
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

describe("CSP image sources", () => {
  it("allows the asset: scheme the macOS webview receives", () => {
    // convertFileSrc() returns `asset://localhost/<encoded path>` on macOS and
    // iOS; only Windows and Linux get the `http://asset.localhost` form. Stik
    // ships macOS-only, so without `asset:` every pasted or dropped image is
    // blocked by CSP and the editor renders "Image failed to load".
    expect(directive("img-src")).toContain("asset:");
  });

  it("keeps the asset.localhost origins for the other webviews", () => {
    // Guard against "fixing" macOS by swapping the platforms around.
    expect(directive("img-src")).toContain("http://asset.localhost");
    expect(directive("img-src")).toContain("https://asset.localhost");
  });

  it("allows data: URLs, which is how pasted images preview before they are saved", () => {
    expect(directive("img-src")).toContain("data:");
  });
});

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
