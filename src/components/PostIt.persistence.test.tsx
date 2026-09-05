import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { useImperativeHandle, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import PostIt from "./PostIt";

const quit = vi.hoisted(() => ({ save: undefined as undefined | (() => Promise<void>) }));
const native = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  startDictation: vi.fn(),
}));
vi.mock("@/hooks/useAppQuit", () => ({
  useAppQuit: (save: () => Promise<void>) => { quit.save = save; },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, handler) => {
    native.handlers.set(name, handler);
    return () => { native.handlers.delete(name); };
  }),
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({
  onMoved: vi.fn().mockResolvedValue(() => {}),
  onResized: vi.fn().mockResolvedValue(() => {}),
  onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
}) }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("./SpeechButton", () => ({ default: ({ ref, onTranscription }: {
  ref: Ref<{ toggle: () => void }>;
  onTranscription: (text: string, origin: number) => void;
}) => {
  useImperativeHandle(ref, () => ({ toggle: () => {
    native.startDictation();
    onTranscription("Native transcription", 0);
  } }));
  return null;
} }));
vi.mock("./AiMenu", () => ({ default: () => null }));
vi.mock("./SyncIndicator", () => ({ default: () => null }));

const path = "/vault/Inbox/secret.md";
let locked = true;
let saveError = false;
let files: Map<string, string>;
let pinnedContent: string | undefined;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  vi.clearAllMocks();
  quit.save = undefined;
  native.handlers.clear();
  document.body.inert = false;
  (window as unknown as { __stikDictationHoldOpen?: boolean }).__stikDictationHoldOpen = false;
  locked = true;
  saveError = false;
  files = new Map([[path, "Private note"]]);
  pinnedContent = "Pinned original";
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === "get_settings") return { vim_mode_enabled: false };
    if (command === "list_folders") return ["Inbox"];
    if (command === "get_notes_directory") return "/vault";
    if (command === "is_note_locked") return locked;
    if (command === "save_locked_note" || command === "update_note") {
      if (saveError) throw new Error("Not authenticated");
      const draft = args as { path: string; content: string };
      files.set(draft.path, draft.content);
    }
    if (command === "update_sticked_note") {
      if (saveError) throw new Error("Disk full");
      const draft = args as { content?: string };
      if (typeof draft.content === "string") pinnedContent = draft.content;
    }
    if (command === "close_sticked_note") {
      if ((args as { saveToFolder: boolean }).saveToFolder) files.set("saved-pinned.md", pinnedContent!);
      pinnedContent = undefined;
      return "saved-pinned.md";
    }
    if (command === "create_sticked_note") return { id: "copy" };
    return null;
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); });

function edit(content: string) {
  const view = EditorView.findFromDOM(screen.getByRole("textbox"));
  if (!view) throw new Error("CodeMirror did not mount");
  act(() => { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } }); });
}

function text() { return EditorView.findFromDOM(screen.getByRole("textbox"))!.state.doc.toString(); }
async function requestQuit() { await act(async () => { await quit.save?.(); }); }

async function openViewingNote(content = "Private edited note") {
  render(<PostIt folder="Inbox" onSave={vi.fn()} onClose={vi.fn()}
    onFolderChange={vi.fn()} isSticked isViewing stickedId="view-secret"
    originalPath={path} initialContent="Private note" />);
  await screen.findByRole("textbox");
  edit(content);
}

async function openPinnedNote() {
  render(<PostIt folder="Inbox" onSave={vi.fn()} onClose={vi.fn()}
    onFolderChange={vi.fn()} isSticked stickedId="pinned" initialContent="Pinned original" />);
  await screen.findByRole("textbox");
  edit("Pinned final keystroke");
}

async function openCapture(onSave = vi.fn().mockResolvedValue("/vault/Inbox/capture.md")) {
  const onClose = vi.fn();
  render(<PostIt folder="Inbox" onSave={onSave} onClose={onClose} onFolderChange={vi.fn()} />);
  await screen.findByRole("textbox");
  edit("Fresh capture draft");
  return { onSave, onClose };
}

describe("viewing note persistence", () => {
  it("routes an edited locked note through authenticated encrypted storage", async () => {
    await openViewingNote();
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    await waitFor(() => expect(files.get(path)).toBe("Private edited note"));
    expect(invoke).toHaveBeenCalledWith("save_locked_note", { path, content: "Private edited note" });
    expect(invoke).not.toHaveBeenCalledWith("update_note", expect.anything());
  });

  it("retains the live editor draft when authentication has expired", async () => {
    saveError = true;
    await openViewingNote();
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    expect(await screen.findByRole("status")).toHaveTextContent("Not authenticated");
    expect(text()).toBe("Private edited note");
    expect(files.get(path)).toBe("Private note");
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
    await waitFor(() => expect(files.get(path)).toBe("Private edited note"));
    expect(invoke).not.toHaveBeenCalledWith("save_locked_note", expect.anything());
  });

  it.each([false, true])("persists a cleared viewing note, locked=%s", async (isLocked) => {
    locked = isLocked;
    await openViewingNote("");
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    await waitFor(() => expect(files.get(path)).toBe(""));
    if (!locked) expect(invoke).toHaveBeenCalledWith("update_note", { path, content: "", preserveEmpty: true });
    else expect(invoke).not.toHaveBeenCalledWith("update_note", expect.anything());
  });
});

describe("pinned note persistence", () => {
  it("continues saving to the created file if native window closing fails", async () => {
    locked = false;
    await openPinnedNote();
    const write = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "close_sticked_window") throw new Error("Window close failed");
      return write(command, args);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Window close failed"));
    edit("Text typed after the failed close");
    await requestQuit();
    expect(files.get("saved-pinned.md")).toBe("Text typed after the failed close");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {});
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "close_sticked_note")).toHaveLength(1);
  });

  it("saves the final keystroke before moving the pinned note to a file", async () => {
    await openPinnedNote();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(files.get("saved-pinned.md")).toBe("Pinned final keystroke"));
  });

  it("retains the pinned draft if its write fails before Save and Close", async () => {
    saveError = true;
    await openPinnedNote();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Disk full");
    expect(text()).toBe("Pinned final keystroke");
    expect(pinnedContent).toBe("Pinned original");
    expect(invoke).not.toHaveBeenCalledWith("close_sticked_note", expect.anything());
  });

  it("drains newer pinned text after an in-flight autosave before closing", async () => {
    await openPinnedNote();
    const blocked = deferred();
    const write = vi.mocked(invoke).getMockImplementation()!;
    let updates = 0;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "update_sticked_note" && ++updates === 1) await blocked.promise;
      return write(command, args);
    });
    await waitFor(() => expect(updates).toBe(1), { timeout: 2000 });
    edit("Newer pinned text");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(files.has("saved-pinned.md")).toBe(false);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    await act(async () => { blocked.resolve(); });
    expect(files.get("saved-pinned.md")).toBe("Newer pinned text");
    expect(updates).toBe(2);
  });
});

describe("PostIt app quit", () => {
  it("updates the first capture file when text arrives during save instead of creating duplicate notes", async () => {
    locked = false;
    const blocked = deferred();
    const capturePath = "/vault/Inbox/capture.md";
    const onSave = vi.fn(async (content: string) => {
      await blocked.promise;
      files.set(capturePath, content);
      return capturePath;
    });
    await openCapture(onSave);
    let pending!: Promise<void>;
    await act(async () => { pending = quit.save!(); });
    edit("Capture with final native input");
    await act(async () => { blocked.resolve(); await pending; });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(files.get(capturePath)).toBe("Capture with final native input");
    expect(text()).toBe("");
  });

  it("reuses an already-created capture file after a subsequent write fails and quit is retried", async () => {
    locked = false;
    const blocked = deferred();
    const capturePath = "/vault/Inbox/capture.md";
    const onSave = vi.fn(async (content: string) => {
      await blocked.promise;
      files.set(capturePath, content);
      return capturePath;
    });
    await openCapture(onSave);
    let pending!: Promise<void>;
    await act(async () => { pending = quit.save!(); });
    edit("Capture with final native input");
    saveError = true;
    await act(async () => {
      const failure = expect(pending).rejects.toThrow("Not authenticated");
      blocked.resolve();
      await failure;
    });
    expect(text()).toBe("Capture with final native input");
    saveError = false;
    await requestQuit();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(files.get(capturePath)).toBe("Capture with final native input");
  });

  it("vetoes quit during dictation so a later final transcript is not lost", async () => {
    const { onSave } = await openCapture();
    (window as unknown as { __stikDictationHoldOpen?: boolean }).__stikDictationHoldOpen = true;
    await expect(requestQuit()).rejects.toThrow("Finish dictation or close its setup before quitting.");
    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toBe("Fresh capture draft");
    (window as unknown as { __stikDictationHoldOpen?: boolean }).__stikDictationHoldOpen = false;
    await requestQuit();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("does not start native dictation across a quit acknowledgement, event queued=%s", async (queued) => {
    await openCapture();
    vi.useFakeTimers();
    if (queued) native.handlers.get("start-dictation")?.({ payload: undefined });
    await requestQuit();
    document.body.inert = true;
    if (!queued) native.handlers.get("start-dictation")?.({ payload: undefined });
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(native.startDictation).not.toHaveBeenCalled();
    expect(text()).toBe("");
  });

  it("saves capture without closing and does not duplicate it after a cancelled quit", async () => {
    const { onSave, onClose } = await openCapture();
    await requestQuit();
    expect(onSave).toHaveBeenCalledWith("Fresh capture draft", "Inbox");
    expect(text()).toBe("");
    expect(onClose).not.toHaveBeenCalled();
    await requestQuit();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("rejects failed capture quit, retains text, and permits a later retry", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Disk full")).mockResolvedValue("capture.md");
    const { onClose } = await openCapture(onSave);
    await expect(requestQuit()).rejects.toThrow("Disk full");
    expect(text()).toBe("Fresh capture draft");
    expect(onClose).not.toHaveBeenCalled();
    await requestQuit();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(text()).toBe("");
  });

  it("waits for an explicit capture save already in flight without duplicating it", async () => {
    const blocked = deferred();
    const onSave = vi.fn(async () => { await blocked.promise; return "capture.md"; });
    await openCapture(onSave);
    fireEvent.click(screen.getByTitle("Save and close (Esc)"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    let completed = false;
    let pending!: Promise<void>;
    await act(async () => { pending = quit.save?.().then(() => { completed = true; }) ?? Promise.resolve(); });
    expect(completed).toBe(false);
    await act(async () => { blocked.resolve(); await pending; });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(completed).toBe(true);
  });

  it("flushes a pinned draft without unpinning or closing its window", async () => {
    await openPinnedNote();
    await requestQuit();
    expect(pinnedContent).toBe("Pinned final keystroke");
    expect(invoke).not.toHaveBeenCalledWith("close_sticked_note", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("close_sticked_window", expect.anything());
  });

  it.each([false, true])("flushes a dirty viewing note without plaintext locked copies, locked=%s", async (isLocked) => {
    locked = isLocked;
    await openViewingNote();
    await requestQuit();
    expect(files.get(path)).toBe("Private edited note");
    expect(text()).toBe("Private edited note");
    expect(invoke).not.toHaveBeenCalledWith("close_sticked_window", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("create_sticked_note", expect.anything());
    if (locked) expect(invoke).not.toHaveBeenCalledWith("update_note", expect.anything());
  });

  it("does not require authentication to quit an unchanged locked viewing note", async () => {
    saveError = true;
    await openViewingNote("Private note");
    await requestQuit();
    expect(invoke).not.toHaveBeenCalledWith("save_locked_note", expect.anything());
  });

  it("rejects quit when encrypted saving fails and preserves the live draft", async () => {
    saveError = true;
    await openViewingNote();
    await expect(requestQuit()).rejects.toThrow("Not authenticated");
    expect(text()).toBe("Private edited note");
    expect(files.get(path)).toBe("Private note");
  });

  it("drains native editor changes arriving while a viewing quit save is pending", async () => {
    await openViewingNote();
    const blocked = deferred();
    const write = vi.mocked(invoke).getMockImplementation()!;
    let updates = 0;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "save_locked_note" && ++updates === 1) await blocked.promise;
      return write(command, args);
    });
    let pending!: Promise<void>;
    await act(async () => { pending = quit.save!(); });
    edit("Final dictation text");
    await act(async () => { blocked.resolve(); await pending; });
    expect(files.get(path)).toBe("Final dictation text");
    expect(text()).toBe("Final dictation text");
    expect(updates).toBe(2);
  });
});
