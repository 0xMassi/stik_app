import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { setLocale } from "@/i18n";
import EditorWindow from "./EditorWindow";

const native = vi.hoisted(() => ({
  closeHandler: undefined as undefined | ((event: { preventDefault: () => void }) => void | Promise<void>),
  closed: false,
  quitHandler: undefined as undefined | ((event: { payload: { id: number } }) => void | Promise<void>),
  cancelQuitHandler: undefined as undefined | ((event: { payload: { id: number } }) => void),
  quitApproved: false,
  focusHandler: undefined as undefined | ((event: { payload: boolean }) => void),
  fileHandlers: new Map<string, () => void>(),
}));

async function requestClose() {
  let prevented = false;
  await native.closeHandler?.({ preventDefault: () => { prevented = true; } });
  if (!prevented) native.closed = true;
}

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, handler) => {
    if (name === "app-quit-requested") native.quitHandler = handler;
    if (name === "app-quit-cancelled") native.cancelQuitHandler = handler;
    if (name === "files-changed" || name === "icloud-files-changed") native.fileHandlers.set(name, handler);
    return () => {
      if (name === "app-quit-requested") native.quitHandler = undefined;
      if (name === "app-quit-cancelled") native.cancelQuitHandler = undefined;
      native.fileHandlers.delete(name);
    };
  }),
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
    onFocusChanged: vi.fn(async (handler) => {
      native.focusHandler = handler;
      return () => { native.focusHandler = undefined; };
    }),
    onCloseRequested: vi.fn(async (handler) => {
      native.closeHandler = handler;
      return () => { native.closeHandler = undefined; };
    }),
    close: requestClose,
    destroy: async () => { native.closed = true; },
  }),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

const alpha = "/vault/Inbox/alpha.md";
const beta = "/vault/Inbox/beta.md";
const locked = "/vault/Inbox/locked.md";
let files: Map<string, string>;
let folders: string[];
let failSaves: boolean;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  setLocale("en");
  // jsdom has no layout; these are only used by CodeMirror's paint measurement.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  files = new Map([[alpha, "# Alpha\nOriginal A"], [beta, "# Beta\nOriginal B"], [locked, "---stik-locked---\nnonce: encrypted\nciphertext"]]);
  folders = ["Inbox", "Other"];
  failSaves = false;
  native.closed = false;
  native.quitApproved = false;
  native.quitHandler = undefined;
  native.closeHandler = undefined;
  native.focusHandler = undefined;
  native.fileHandlers.clear();
  vi.mocked(invoke).mockReset().mockImplementation(async (command, args) => {
    if (command === "complete_app_quit") {
      const { id, saved } = args as { id: number; saved: boolean };
      native.quitApproved = saved;
      if (!saved) native.cancelQuitHandler?.({ payload: { id } });
      return null;
    }
    if (command === "list_folders") return [...folders];
    if (command === "create_folder") {
      folders.push((args as { name: string }).name);
      return null;
    }
    if (command === "get_settings") return { folder_colors: {}, folder_icons: {}, load_remote_images: false };
    if (command === "list_notes") {
      const folder = (args as { folder: string }).folder;
      return [...files].filter(([path]) => path.includes(`/${folder}/`)).map(([path, content]) => ({
        path, content: path === locked ? "" : content, filename: path.split("/").pop(),
        folder, locked: path === locked, created: "2026-09-05T00:00:00Z",
      }));
    }
    if (command === "get_note_content") return files.get((args as { path: string }).path);
    if (command === "search_notes") {
      const { query, folder } = args as { query: string; folder: string };
      return [...files].filter(([path, content]) => path.includes(`/${folder}/`) && content.includes(query)).map(([path, content]) => ({
        path, title: content.split("\n")[0].replace(/^# /, ""), snippet: content,
        filename: path.split("/").pop(), folder, created: "2026-09-05", locked: false,
      }));
    }
    if (command === "update_note") {
      if (failSaves) throw new Error("Disk is full");
      const { path, content, preserveEmpty } = args as { path: string; content: string; preserveEmpty?: boolean };
      if (!files.has(path)) throw new Error("Note file does not exist");
      // The real command trashes empty managed notes unless preservation is requested.
      if (!content && !preserveEmpty) { files.delete(path); return { path: "" }; }
      files.set(path, content);
      return { path };
    }
    if (command === "save_note") {
      const { folder, content } = args as { folder: string; content: string };
      const path = `/vault/${folder}/new.md`;
      files.set(path, content);
      return { path };
    }
    if (command === "move_note") {
      const { path, targetFolder } = args as { path: string; targetFolder: string };
      const target = `/vault/${targetFolder}/${path.split("/").pop()}`;
      files.set(target, files.get(path)!);
      files.delete(path);
      return target;
    }
    if (command === "delete_note") {
      const { path } = args as { path: string };
      files.set(`/trash/${path.split("/").pop()}`, files.get(path)!);
      files.delete(path);
      return { id: "trash-id", filename: path.split("/").pop(), original_relative_path: "Inbox/alpha.md" };
    }
    return null;
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); setLocale("en"); });

async function open(title: string) {
  const button = await screen.findByRole("button", { name: new RegExp(`^${title}`) });
  await act(async () => { fireEvent.click(button); });
}

function edit(text: string) {
  const view = EditorView.findFromDOM(screen.getByRole("textbox", { name: "Start writing…" }));
  if (!view) throw new Error("Editor did not mount");
  act(() => { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); });
}

function documentText() { return screen.getByRole("textbox", { name: "Start writing…" }).textContent; }
async function autosave() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); }); }

describe("full editor persistence", () => {
  it("translates live editor controls without translating or replacing the draft", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("An untranslated draft — Café 🔒");
    act(() => setLocale("zh-CN"));
    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建笔记" })).toBeInTheDocument();
    expect(screen.getByText("3 条笔记")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "开始写作…" })).toHaveTextContent("An untranslated draft — Café 🔒");
    fireEvent.click(screen.getByRole("button", { name: "Alpha 的操作" }));
    expect(screen.getByRole("menuitem", { name: "置顶" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "归档" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("menuitem", { name: "点击确认" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.change(screen.getByPlaceholderText("搜索笔记…"), { target: { value: "missing-query" } });
    expect(await screen.findByText("没有匹配的笔记。")).toBeInTheDocument();
    expect(screen.getByText("0 个匹配结果")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(screen.getByPlaceholderText("搜索笔记…")).toHaveValue("");
    act(() => setLocale("en"));
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(documentText()).toBe("An untranslated draft — Café 🔒");
    await act(requestClose);
    expect(files.get(alpha)).toBe("An untranslated draft — Café 🔒");
  });

  it("translates folder controls while preserving user folder names and metadata keys", async () => {
    setLocale("zh-CN");
    render(<EditorWindow />);
    const folder = await screen.findByRole("button", { name: /Inbox$/ });
    fireEvent.click(folder);
    fireEvent.click(screen.getByRole("button", { name: "更改 Inbox 的颜色和图标" }));
    fireEvent.click(screen.getByRole("button", { name: "蓝色文件夹颜色" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_settings", {
      settings: expect.objectContaining({ folder_colors: { Inbox: "blue" } }),
    }));
    fireEvent.click(screen.getByTitle("星形"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("save_settings", {
      settings: expect.objectContaining({ folder_icons: { Inbox: "star" } }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "在 Inbox 中新建子文件夹" }));
    const name = screen.getByPlaceholderText("文件夹名称…");
    fireEvent.change(name, { target: { value: "My 项目" } });
    await act(async () => { fireEvent.keyDown(name, { key: "Enter" }); });
    expect(invoke).toHaveBeenCalledWith("create_folder", { name: "Inbox/My 项目" });
    expect(screen.getByRole("button", { name: /My 项目$/ })).toBeInTheDocument();
  });

  it.each(["New note", "+ New folder"])("guides %s through explicit folder creation in an empty vault", async (action) => {
    folders = [];
    files.clear();
    await act(async () => { render(<EditorWindow />); });
    expect(invoke).not.toHaveBeenCalledWith("create_folder", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: action }));
    const name = screen.getByPlaceholderText("Folder name…");
    expect(name).toHaveFocus();
    fireEvent.change(name, { target: { value: "My notes" } });
    await act(async () => { fireEvent.keyDown(name, { key: "Enter" }); });
    expect(screen.getByRole("button", { name: /My notes/ })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "New note" })); });
    expect(documentText()).toContain("Untitled");
    edit("First note in my chosen folder");
    await act(requestClose);
    expect(files.get("/vault/My notes/new.md")).toBe("First note in my chosen folder");
  });

  it("does not create a folder when the empty-vault prompt is cancelled", async () => {
    folders = [];
    files.clear();
    await act(async () => { render(<EditorWindow />); });
    fireEvent.click(screen.getByRole("button", { name: "New note" }));
    const name = screen.getByPlaceholderText("Folder name…");
    fireEvent.change(name, { target: { value: "Cancelled folder" } });
    fireEvent.keyDown(name, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Folder name…")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("create_folder", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("save_note", expect.anything());
  });

  it("reloads the same note before editing a revision saved in another window", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    files.set(alpha, "# New revision\nSaved elsewhere");
    await act(async () => { native.focusHandler?.({ payload: true }); });
    await open("New revision");
    expect(documentText()).toContain("Saved elsewhere");
    expect(invoke).not.toHaveBeenCalledWith("update_note", expect.anything());
    const view = EditorView.findFromDOM(screen.getByRole("textbox", { name: "Start writing…" }))!;
    act(() => { view.dispatch({ changes: { from: view.state.doc.length, insert: "\nLatest edit" } }); });
    await act(requestClose);
    expect(files.get(alpha)).toBe("# New revision\nSaved elsewhere\nLatest edit");
  });

  it("retains the same-note draft when saving before reselection fails", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Unsaved revision");
    failSaves = true;
    await open("Alpha");
    expect(documentText()).toContain("Unsaved revision");
    expect(files.get(alpha)).toContain("Original A");
    failSaves = false;
    await open("Alpha");
    expect(documentText()).toContain("Unsaved revision");
    expect(files.get(alpha)).toBe("Unsaved revision");
  });

  it.each(["focus", "files-changed", "icloud-files-changed"])("refreshes the list on %s without replacing a live draft", async (event) => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Unsaved local draft");
    files.set(beta, "# Updated in another window\nNew body");
    await act(async () => {
      if (event === "focus") native.focusHandler?.({ payload: true });
      else native.fileHandlers.get(event)?.();
    });
    expect(screen.getByRole("button", { name: /^Updated in another window/ })).toBeInTheDocument();
    expect(documentText()).toContain("Unsaved local draft");
    await act(requestClose);
    expect(files.get(alpha)).toBe("Unsaved local draft");
  });

  it("refreshes an active search when returning from another window", async () => {
    render(<EditorWindow />);
    await screen.findByRole("button", { name: /^Alpha/ });
    fireEvent.change(screen.getByPlaceholderText("Search notes…"), { target: { value: "Alpha" } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
    expect(screen.getByRole("button", { name: /^Alpha/ })).toBeInTheDocument();
    files.set(alpha, "# Renamed elsewhere");
    await act(async () => { native.focusHandler?.({ payload: true }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
    expect(screen.queryByRole("button", { name: /^Alpha/ })).not.toBeInTheDocument();
  });

  it.each([
    { query: "searchable", draft: "# Alpha\nNew searchable draft", initiallyMatches: false },
    { query: "Alpha", draft: "# Renamed\nThe old title is gone", initiallyMatches: true },
  ])("refreshes unchanged query '$query' after autosave commits", async ({ query, draft, initiallyMatches }) => {
    const saved = deferred<void>();
    const implementation = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "update_note") await saved.promise;
      return implementation(command, args);
    });
    render(<EditorWindow />);
    await open("Alpha");
    vi.useFakeTimers();
    edit(draft);
    fireEvent.change(screen.getByPlaceholderText("Search notes…"), { target: { value: query } });
    // Drain both debounces while the write stays pending, including any
    // incorrectly scheduled pre-acknowledgment refresh. No wall-clock sleeps.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // React commits effects after act; drain any refresh scheduled by that commit
    // before allowing the pending storage write to finish.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(invoke).toHaveBeenCalledWith("update_note", {
      path: alpha, content: draft, preserveEmpty: true,
    });
    expect(invoke).toHaveBeenCalledWith("search_notes", { query, folder: "Inbox" });
    expect(Boolean(screen.queryByRole("button", { name: /^Alpha/ }))).toBe(initiallyMatches);
    await act(async () => { saved.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(Boolean(screen.queryByRole("button", { name: /^Alpha/ }))).toBe(!initiallyMatches);
    expect(screen.getByPlaceholderText("Search notes…")).toHaveValue(query);
    expect(documentText()).toContain(draft.split("\n")[1]);
  });

  it.each(["Rename", "Archive", "Delete"])("removes stale search matches after %s without pending edits", async (action) => {
    render(<EditorWindow />);
    await screen.findByRole("button", { name: /^Alpha/ });
    fireEvent.change(screen.getByPlaceholderText("Search notes…"), { target: { value: "Alpha" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("search_notes", { query: "Alpha", folder: "Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Actions for Alpha" }));
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: action })); });
    if (action === "Rename") {
      const input = screen.getAllByDisplayValue("Alpha").find(
        (element) => element !== screen.getByPlaceholderText("Search notes…"),
      )!;
      fireEvent.change(input, { target: { value: "Renamed" } });
      await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    } else if (action === "Delete") {
      await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Click to confirm" })); });
    }
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Alpha/ })).not.toBeInTheDocument());
    expect(screen.getByText(/No matches/)).toBeInTheDocument();
  });

  it("saves A before switching to and editing B inside the debounce interval", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Changed A");
    await open("Beta");
    edit("Changed B");
    await autosave();
    expect(files.get(alpha)).toBe("Changed A");
    expect(files.get(beta)).toBe("Changed B");
  });

  it("flushes pending text before native close", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Last keystroke");
    await act(requestClose);
    expect(files.get(alpha)).toBe("Last keystroke");
    expect(native.closed).toBe(true);
  });

  it("flushes before approving app quit and prevents further editing until exit", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Before quitting");
    await act(async () => { await native.quitHandler?.({ payload: { id: 1 } }); });
    expect(files.get(alpha)).toBe("Before quitting");
    expect(native.quitApproved).toBe(true);
    expect(document.body.inert).toBe(true);
  });

  it("rejects app quit on save failure and keeps the draft editable", async () => {
    const { container } = render(<EditorWindow />);
    await open("Alpha");
    edit("Keep this draft");
    failSaves = true;
    await act(async () => { await native.quitHandler?.({ payload: { id: 1 } }); });
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("complete_app_quit", { id: 1, saved: false });
    expect(native.quitApproved).toBe(false);
    expect(documentText()).toContain("Keep this draft");
    expect(container.firstElementChild).not.toHaveAttribute("inert");
    expect(document.body.inert).toBe(false);
  });

  it("keeps the note and window open when saving fails, then retries on close", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Unsaved draft");
    failSaves = true;
    await open("Beta");
    expect(documentText()).toContain("Unsaved draft");
    await act(requestClose);
    expect(native.closed).toBe(false);
    expect(files.get(alpha)).toContain("Original A");
    failSaves = false;
    await act(requestClose);
    expect(files.get(alpha)).toBe("Unsaved draft");
    expect(native.closed).toBe(true);
  });

  it("preserves an empty draft so later text still saves to the same note", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("");
    await autosave();
    expect(files.has(alpha)).toBe(true);
    expect(files.get(alpha)).toBe("");
    edit("Replacement text");
    await autosave();
    expect(files.get(alpha)).toBe("Replacement text");
  });

  it("refuses to open or rename a locked envelope", async () => {
    render(<EditorWindow />);
    await open("locked");
    expect(screen.queryByRole("textbox", { name: "Start writing…" })).not.toBeInTheDocument();
    expect(vi.mocked(invoke).mock.calls.filter(([name]) => name === "get_note_content")).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actions for locked" })); });
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.queryByDisplayValue("locked")).not.toBeInTheDocument();
    expect(files.get(locked)).toBe("---stik-locked---\nnonce: encrypted\nciphertext");
    expect(screen.getByText(/locked notes.*Browse Notes/i)).toBeInTheDocument();
  });

  it("ignores an older read after a newer note was selected", async () => {
    const slow = deferred<string>();
    const implementation = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => command === "get_note_content" && (args as { path: string }).path === alpha
      ? slow.promise as ReturnType<typeof invoke> : implementation(command, args));
    render(<EditorWindow />);
    await open("Alpha");
    await open("Beta");
    expect(documentText()).toContain("Original B");
    await act(async () => { slow.resolve("Old A response"); });
    expect(documentText()).toContain("Original B");
  });

  it("serializes a newer edit behind an in-flight save", async () => {
    const firstWrite = deferred<void>();
    const implementation = vi.mocked(invoke).getMockImplementation()!;
    let writes = 0;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "update_note" && ++writes === 1) await firstWrite.promise;
      return implementation(command, args);
    });
    render(<EditorWindow />);
    await open("Alpha");
    edit("First revision");
    await autosave();
    edit("Latest revision");
    await autosave();
    expect(writes).toBe(1);
    await act(async () => { firstWrite.resolve(); });
    expect(writes).toBe(2);
    expect(files.get(alpha)).toBe("Latest revision");
  });

  it.each(["Archive", "Delete"])("flushes text before %s", async (action) => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Latest before removal");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actions for Alpha" })); });
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: action })); });
    if (action === "Delete") {
      await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Click to confirm" })); });
    }
    expect(files.get(action === "Archive" ? "/vault/Archive/alpha.md" : "/trash/alpha.md")).toBe("Latest before removal");
    expect(files.has(alpha)).toBe(false);
  });

  it("flushes text before creating a new note", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Before new note");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "New note" })); });
    expect(files.get(alpha)).toBe("Before new note");
    expect(documentText()).toContain("Untitled");
  });

  it("renames the current draft without dropping its unsaved body", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("# Alpha\nLatest body");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actions for Alpha" })); });
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByDisplayValue("Alpha");
    fireEvent.change(input, { target: { value: "Renamed" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(files.get(alpha)).toBe("# Renamed\nLatest body");
    expect(documentText()).toContain("Latest body");
  });

  it("flushes the current draft before changing folders", async () => {
    render(<EditorWindow />);
    await open("Alpha");
    edit("Before folder change");
    fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
    await act(async () => { fireEvent.click(screen.getByText("Other", { selector: "span" }).closest("button")!); });
    expect(files.get(alpha)).toBe("Before folder change");
  });

  it("keeps the newest folder listing when an older request finishes later", async () => {
    const oldList = deferred<unknown>();
    const implementation = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation((command, args) => command === "list_notes" && (args as { folder: string }).folder === "Inbox"
      ? oldList.promise as ReturnType<typeof invoke> : implementation(command, args));
    files.set("/vault/Other/other.md", "# Other note");
    render(<EditorWindow />);
    const folderButton = await screen.findByRole("button", { name: /Inbox/ });
    fireEvent.click(folderButton);
    await act(async () => { fireEvent.click(screen.getByText("Other", { selector: "span" }).closest("button")!); });
    expect(screen.getByRole("button", { name: /^Other note/ })).toBeInTheDocument();
    await act(async () => { oldList.resolve([{ path: alpha, filename: "alpha.md", folder: "Inbox", content: "# Stale listing", created: "2026-09-05", locked: false }]); });
    expect(screen.queryByRole("button", { name: /^Stale listing/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Other note/ })).toBeInTheDocument();
  });
});
