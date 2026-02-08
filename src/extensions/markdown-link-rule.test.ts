import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./markdown-link-rule";

describe("normalizeUrl", () => {
  it("prepends https:// to bare domains", () => {
    expect(normalizeUrl("google.com")).toBe("https://google.com");
    expect(normalizeUrl("example.org/path")).toBe("https://example.org/path");
  });

  it("preserves valid https URLs", () => {
    expect(normalizeUrl("https://google.com")).toBe("https://google.com");
    expect(normalizeUrl("https://example.org/path?q=1")).toBe("https://example.org/path?q=1");
  });

  it("preserves valid http URLs", () => {
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("preserves mailto and tel protocols", () => {
    expect(normalizeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
    expect(normalizeUrl("tel:+1234567890")).toBe("tel:+1234567890");
  });

  it("preserves ftp protocol", () => {
    expect(normalizeUrl("ftp://files.example.com")).toBe("ftp://files.example.com");
  });

  it("rejects javascript: protocol", () => {
    const result = normalizeUrl("javascript:alert(1)");
    expect(result).not.toContain("javascript:");
    expect(result).toMatch(/^https:\/\//);
  });

  it("rejects data: protocol", () => {
    const result = normalizeUrl("data:text/html,<script>alert(1)</script>");
    expect(result).not.toContain("data:");
    expect(result).toMatch(/^https:\/\//);
  });

  it("rejects file: protocol", () => {
    const result = normalizeUrl("file:///etc/passwd");
    expect(result).not.toContain("file:");
    expect(result).toMatch(/^https:\/\//);
  });

  it("rejects vbscript: protocol", () => {
    const result = normalizeUrl("vbscript:MsgBox");
    expect(result).not.toContain("vbscript:");
    expect(result).toMatch(/^https:\/\//);
  });

  it("handles case-insensitive protocols", () => {
    expect(normalizeUrl("HTTPS://Google.com")).toBe("HTTPS://Google.com");
    expect(normalizeUrl("HTTP://example.com")).toBe("HTTP://example.com");
  });

  it("handles edge cases", () => {
    expect(normalizeUrl("")).toBe("https://");
    expect(normalizeUrl("subdomain.example.co.uk/path")).toBe("https://subdomain.example.co.uk/path");
  });
});
