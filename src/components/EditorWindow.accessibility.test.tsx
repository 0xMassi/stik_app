import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import EditorWindow from "./EditorWindow";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
  invoke: vi.fn((command: string) => {
    if (command === "list_folders") return Promise.resolve(["Inbox"]);
    if (command === "get_settings") {
      return Promise.resolve({
        folder_colors: {},
        folder_icons: {},
        load_remote_images: false,
      });
    }
    if (command === "list_notes") {
      return Promise.resolve([
        {
          path: "/vault/Inbox/note.md",
          filename: "note.md",
          folder: "Inbox",
          content: "# Keyboard note\nBody",
          created: "2026-08-31T00:00:00Z",
        },
      ]);
    }
    if (command === "list_trashed_notes") return Promise.resolve([]);
    return Promise.resolve(null);
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

describe("EditorWindow accessibility", () => {
  it("does not announce an empty Trash while recoverable notes exist", async () => {
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation(async (command, args) => command === "list_trashed_notes"
      ? [{ id: "trash-note", filename: "Recoverable note.md", original_relative_path: "Inbox/note.md", folder: "Inbox", deleted_at: "2026-09-05" }]
      : original(command, args));
    try {
      render(<EditorWindow />);
      fireEvent.click(await screen.findByRole("button", { name: "Trash" }));
      expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
      expect(screen.queryByText("Trash is empty.")).not.toBeInTheDocument();
    } finally {
      vi.mocked(invoke).mockImplementation(original);
    }
  });
  it("keeps row actions keyboard-visible and exposes a named menu trigger", async () => {
    render(<EditorWindow />);

    const trigger = await screen.findByRole("button", {
      name: "Actions for Keyboard note",
    });
    await waitFor(() => expect(trigger).toBeInTheDocument());

    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger.className).toContain("focus:opacity-100");
    expect(trigger.className).toContain("group-focus-within:opacity-100");
  });
});
