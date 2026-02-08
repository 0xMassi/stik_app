import { describe, it, expect } from "vitest";
import { filenameToSlug, escapeHtml } from "./wiki-link";

describe("filenameToSlug", () => {
  it("strips .md extension", () => {
    expect(filenameToSlug("my-note.md")).toBe("my-note");
  });

  it("strips timestamp prefix", () => {
    expect(filenameToSlug("20250115-143022-my-note.md")).toBe("my-note");
  });

  it("strips UUID suffix", () => {
    expect(filenameToSlug("my-note-a1b2.md")).toBe("my-note");
    expect(filenameToSlug("my-note-a1b2c3d4.md")).toBe("my-note");
  });

  it("strips both timestamp and UUID", () => {
    expect(filenameToSlug("20250115-143022-quick-thought-a1b2.md")).toBe("quick-thought");
  });

  it("handles slug with no timestamp or UUID", () => {
    expect(filenameToSlug("just-a-note.md")).toBe("just-a-note");
  });

  it("handles single-word slug", () => {
    expect(filenameToSlug("20250115-143022-hello-abcd.md")).toBe("hello");
  });

  it("handles slug with numbers that arent UUIDs", () => {
    // "2024" is only 4 chars but all digits — the regex matches 4+ hex chars
    // This is a known limitation but acceptable
    expect(filenameToSlug("version-3-notes.md")).toBe("version-3-notes");
  });

  it("handles filename without .md", () => {
    expect(filenameToSlug("20250115-143022-test-abcd")).toBe("test");
  });

  it("preserves hyphens in multi-word slugs", () => {
    expect(filenameToSlug("20250115-143022-this-is-a-long-note-f1e2.md")).toBe("this-is-a-long-note");
  });
});

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes all special chars together", () => {
    expect(escapeHtml('<a href="x&y">')).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
    expect(escapeHtml("my-note-slug")).toBe("my-note-slug");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("prevents XSS in wiki-link slug context", () => {
    const malicious = '"><img src=x onerror=alert(1)>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).not.toContain('"');
  });
});
