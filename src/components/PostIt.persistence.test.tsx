import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import PostIt from "./PostIt";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  onMoved: vi.fn().mockResolvedValue(() => {}),
  onResized: vi.fn().mockResolvedValue(() => {}),
  outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
}) }));
vi.mock("./Editor", () => ({ default: ({ initialContent, onChange }: {
  initialContent: string; onChange: (text: string) => void;
}) => <textarea aria-label="Note content" defaultValue={initialContent}
  onChange={(event) => onChange(event.target.value)} /> }));
vi.mock("./SpeechButton", () => ({ default: () => null }));
vi.mock("./AiMenu", () => ({ default: () => null }));
vi.mock("./SyncIndicator", () => ({ default: () => null }));

const path = "/vault/Inbox/secret.md";
let locked = true;
let saveError = false;

beforeEach(() => {
  vi.clearAllMocks();
  locked = true;
  saveError = false;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_settings") return { vim_mode_enabled: false };
    if (command === "list_folders") return ["Inbox"];
    if (command === "get_notes_directory") return "/vault";
    if (command === "is_note_locked") return locked;
    if (command === "save_locked_note" && saveError) throw new Error("Not authenticated");
    if (command === "create_sticked_note") return { id: "copy" };
    return null;
  });
});

async function openViewingNote() {
  render(<PostIt folder="Inbox" onSave={vi.fn()} onClose={vi.fn()}
    onFolderChange={vi.fn()} isSticked isViewing stickedId="view-secret"
    originalPath={path} initialContent="Private note" />);
  const editor = await screen.findByRole("textbox", { name: "Note content" });
  fireEvent.change(editor, { target: { value: "Private edited note" } });
  return editor;
}

describe("viewing note persistence", () => {
  it("routes an edited locked note through authenticated encrypted storage", async () => {
    await openViewingNote();
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_locked_note", {
      path, content: "Private edited note",
    }));
    expect(invoke).not.toHaveBeenCalledWith("update_note", expect.anything());
  });

  it("retains the draft and window when authentication has expired", async () => {
    saveError = true;
    const editor = await openViewingNote();
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    expect(await screen.findByRole("status")).toHaveTextContent("Not authenticated");
    expect(editor).toHaveValue("Private edited note");
    expect(invoke).not.toHaveBeenCalledWith("close_sticked_window", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("update_note", expect.anything());
  });

  it("does not persist a decrypted note as an unencrypted pinned copy", async () => {
    await openViewingNote();
    fireEvent.click(screen.getByRole("button", { name: "Pin (will restore on restart)" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("is_note_locked", { path }));
    expect(invoke).not.toHaveBeenCalledWith("create_sticked_note", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("close_sticked_window", expect.anything());
  });

  it("continues saving ordinary viewing notes through update_note", async () => {
    locked = false;
    await openViewingNote();
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_note", {
      path, content: "Private edited note",
    }));
    expect(invoke).not.toHaveBeenCalledWith("save_locked_note", expect.anything());
  });
});
