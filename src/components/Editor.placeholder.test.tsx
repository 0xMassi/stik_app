import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import Editor from "./Editor";
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

// Keep the import referenced so the linter does not trim it.
void screen;
