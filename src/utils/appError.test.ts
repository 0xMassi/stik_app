import { describe, expect, it } from "vitest";
import { errorMessage } from "./appError";

describe("errorMessage", () => {
  it("preserves useful string and Error messages", () => {
    expect(errorMessage("Disk is full", "Save failed")).toBe("Disk is full");
    expect(errorMessage(new Error("Permission denied"), "Save failed")).toBe(
      "Permission denied",
    );
  });

  it("extracts structured Tauri error messages", () => {
    expect(
      errorMessage(
        { code: "vault_unavailable", message: "Vault moved", recoverable: true },
        "Vault check failed",
      ),
    ).toBe("Vault moved");
  });

  it("uses a safe fallback for unknown values", () => {
    expect(errorMessage({ unexpected: true }, "Save failed")).toBe("Save failed");
    expect(errorMessage(null, "Save failed")).toBe("Save failed");
    expect(errorMessage({ message: 123 }, "Save failed")).toBe("Save failed");
  });

  it("trims useful messages and falls back for blank messages", () => {
    expect(errorMessage({ message: "  Disk is full  " }, "Save failed")).toBe("Disk is full");
    expect(errorMessage("  ", "Save failed")).toBe("Save failed");
    expect(errorMessage(new Error(""), "Save failed")).toBe("Save failed");
  });
});
