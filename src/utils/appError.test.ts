import { describe, expect, it } from "vitest";
import { errorMessage, normalizeAppError } from "./appError";

describe("normalizeAppError", () => {
  it("preserves useful string and Error messages", () => {
    expect(errorMessage("Disk is full", "Save failed")).toBe("Disk is full");
    expect(errorMessage(new Error("Permission denied"), "Save failed")).toBe(
      "Permission denied",
    );
  });

  it("extracts structured Tauri error messages", () => {
    expect(
      normalizeAppError(
        { code: "vault_unavailable", message: "Vault moved", recoverable: true },
        "Vault check failed",
      ),
    ).toEqual({
      code: "vault_unavailable",
      message: "Vault moved",
      recoverable: true,
    });
  });

  it("uses a safe fallback for unknown values", () => {
    expect(errorMessage({ unexpected: true }, "Save failed")).toBe("Save failed");
    expect(errorMessage(null, "Save failed")).toBe("Save failed");
  });
});
