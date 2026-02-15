import { describe, expect, it } from "vitest";
import { isCaptureSlashQuery } from "./slashQuery";

describe("isCaptureSlashQuery", () => {
  it("matches root slash and short slash prefixes", () => {
    expect(isCaptureSlashQuery("/")).toBe(true);
    expect(isCaptureSlashQuery("/work")).toBe(true);
    expect(isCaptureSlashQuery("/h1")).toBe(true);
    expect(isCaptureSlashQuery("/meeting")).toBe(true);
  });

  it("rejects multi-word and non-leading slash content", () => {
    expect(isCaptureSlashQuery("/work now")).toBe(false);
    expect(isCaptureSlashQuery("note /work")).toBe(false);
  });

  it("rejects multiline and long slash content", () => {
    expect(isCaptureSlashQuery("/work\nnext")).toBe(false);
    expect(isCaptureSlashQuery("/abcdefghijklmn")).toBe(false);
  });

  it("rejects empty and non-slash content", () => {
    expect(isCaptureSlashQuery("")).toBe(false);
    expect(isCaptureSlashQuery("hello")).toBe(false);
    expect(isCaptureSlashQuery("# heading")).toBe(false);
  });

  it("accepts queries up to the length limit", () => {
    // 14 chars total (slash + 13) — just under the limit of 15
    expect(isCaptureSlashQuery("/abcdefghijklm")).toBe(true);
    // 15 chars — at the limit
    expect(isCaptureSlashQuery("/abcdefghijklmn")).toBe(false);
  });
});
