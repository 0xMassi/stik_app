import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VaultHealth from "./VaultHealth";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mocks.save }));

const healthyReport = {
  status: "healthy",
  storageMode: "local",
  rootPath: "/Users/test/Documents/Stik",
  rootExists: true,
  rootIsDirectory: true,
  rootWritable: true,
  indexedNoteCount: 4,
  diskNoteCount: 4,
  checkedAt: "2026-08-31T00:00:00Z",
  issues: [],
};

describe("VaultHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_vault_health") return Promise.resolve(healthyReport);
      return Promise.resolve(true);
    });
  });

  it("shows the vault status and key check results", async () => {
    render(<VaultHealth />);

    expect(await screen.findByRole("heading", { name: "Vault health" })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Healthy");
    expect(screen.getByText("/Users/test/Documents/Stik")).toBeInTheDocument();
    expect(screen.getByText("4 on disk / 4 indexed")).toBeInTheDocument();
  });

  it("rebuilds the index and refreshes the report", async () => {
    render(<VaultHealth />);
    await screen.findByText("/Users/test/Documents/Stik");

    fireEvent.click(screen.getByRole("button", { name: "Rebuild index" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("rebuild_index"));
    await waitFor(() => {
      expect(mocks.invoke.mock.calls.filter(([name]) => name === "get_vault_health")).toHaveLength(2);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Search index rebuilt");
  });

  it("exports diagnostics to the explicitly selected file", async () => {
    mocks.save.mockResolvedValue("/tmp/stik-diagnostics.json");
    render(<VaultHealth />);
    await screen.findByText("/Users/test/Documents/Stik");

    fireEvent.click(screen.getByRole("button", { name: "Export diagnostics" }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("export_vault_diagnostics", {
        path: "/tmp/stik-diagnostics.json",
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Diagnostics exported");
  });

  it("surfaces structured backend failures", async () => {
    mocks.invoke.mockRejectedValueOnce({ message: "Vault permission denied" });
    render(<VaultHealth />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Vault permission denied");
  });
});
