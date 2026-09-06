import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
import { getCM, Vim } from "@replit/codemirror-vim";
import Editor, { type EditorRef } from "./Editor";
import { setLocale } from "@/i18n";

// Editor pulls in Tauri APIs through its image/link handlers; stub the bridge
// so the component can mount under jsdom.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
    label: "postit",
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  setLocale("en");
});

/// Regression guard for the placeholder surviving a language switch.
///
/// The editor is created once with empty deps, so the placeholder used to be
/// frozen at whatever the locale was at mount. Switching to English left the
/// Chinese string on screen until the window was recreated.
describe("Editor placeholder", () => {
  it("follows the active locale without remounting", async () => {
    setLocale("en");

    render(<Editor onChange={() => {}} initialContent="" />);

    // CodeMirror renders the placeholder into .cm-placeholder
    const readPlaceholder = () =>
      document.querySelector(".cm-placeholder")?.textContent ?? "";

    expect(readPlaceholder()).toBe("Start typing...");

    await act(async () => {
      setLocale("zh-CN");
    });
    expect(readPlaceholder()).toBe("开始输入…");

    // The bug: switching back left the previous string in place.
    await act(async () => {
      setLocale("en");
    });
    expect(readPlaceholder()).toBe("Start typing...");
  });

  it("prefers an explicit placeholder prop over the default", () => {
    setLocale("en");
    render(<Editor onChange={() => {}} initialContent="" placeholder="Custom text" />);
    expect(document.querySelector(".cm-placeholder")?.textContent).toBe("Custom text");
  });
});

describe("Editor Vim commands", () => {
  it.each(["wq", "x", "q", "q!"])("routes :%s to the current callback after a re-render", (command) => {
    const ref = createRef<EditorRef>();
    const originalCallback = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(
      <Editor ref={ref} onChange={() => {}} vimEnabled
        onVimSaveAndClose={originalCallback} onVimCloseWithoutSaving={originalCallback} />,
    );
    const view = ref.current!.getView()!;
    rerender(
      <Editor ref={ref} onChange={() => {}} vimEnabled
        onVimSaveAndClose={onSave} onVimCloseWithoutSaving={onClose} />,
    );

    const cm = getCM(view);
    if (!cm?.state.vim) throw new Error("Vim state was not initialized");
    // handleEx requires Vim state; getCM's type also permits non-Vim editors.
    act(() => Vim.handleEx(cm as Parameters<typeof Vim.handleEx>[0], command));

    expect(ref.current!.getView()).toBe(view);
    expect(originalCallback).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(command === "wq" || command === "x" ? 1 : 0);
    expect(onClose).toHaveBeenCalledTimes(command === "q" || command === "q!" ? 1 : 0);
  });

  it("reports mode changes from the Vim editor", () => {
    const ref = createRef<EditorRef>();
    const onModeChange = vi.fn();
    render(<Editor ref={ref} onChange={() => {}} vimEnabled onVimModeChange={onModeChange} />);

    act(() => Vim.handleKey(getCM(ref.current!.getView()!)!, "i", "user"));

    expect(onModeChange).toHaveBeenLastCalledWith("insert");
  });
});

describe("Editor link shortcut", () => {
  it("inserts a link around the selected text through the editor keymap", () => {
    const ref = createRef<EditorRef>();
    render(<Editor ref={ref} onChange={() => {}} initialContent="Stik" />);
    const view = ref.current!.getView()!;
    act(() => view.dispatch({ selection: { anchor: 0, head: 4 } }));

    fireEvent.keyDown(view.contentDOM, { key: "k", code: "KeyK", ctrlKey: true });

    expect(view.state.doc.toString()).toBe("[Stik](url)");
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe("url");
  });
});
