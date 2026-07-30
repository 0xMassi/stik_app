/**
 * DOM-level verification that the accessibility wiring produces the right
 * accessible tree — not just the right strings. If the announcement text lands
 * in CodeMirror's aria-live region, a screen reader will speak it.
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { accessibleEditor } from "./cm-a11y";

function mount(doc: string, anchor = doc.length) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [accessibleEditor("Type a thought...")],
    }),
    parent,
  });
  return {
    view,
    cleanup: () => {
      view.destroy();
      parent.remove();
    },
  };
}

const announced = (view: EditorView): string =>
  view.dom.querySelector(".cm-announced")?.textContent ?? "";

describe("accessibleEditor — accessible DOM", () => {
  it("gives the editor a stable aria-label and NO repeating aria-placeholder", () => {
    const { view, cleanup } = mount("");
    try {
      expect(view.contentDOM.getAttribute("aria-label")).toBe(
        "Type a thought...",
      );
      // Passing an element (not a string) means CM6 omits aria-placeholder —
      // this is what stops VoiceOver re-reading the hint on every pause.
      expect(view.contentDOM.getAttribute("aria-placeholder")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("renders the placeholder hidden from assistive tech (aria-hidden)", () => {
    const { view, cleanup } = mount(""); // empty doc → placeholder shows
    try {
      const ph = view.dom.querySelector(".cm-placeholder");
      expect(ph).not.toBeNull();
      expect(ph?.getAttribute("aria-hidden")).toBe("true");
    } finally {
      cleanup();
    }
  });

  it("announces a deleted character into the aria-live region", () => {
    const { view, cleanup } = mount("abc", 3);
    try {
      view.dispatch({
        changes: { from: 2, to: 3 },
        selection: { anchor: 2 },
        userEvent: "delete.backward",
      });
      expect(announced(view)).toContain("deleted c");
    } finally {
      cleanup();
    }
  });

  it("announces a newline into the aria-live region", () => {
    const { view, cleanup } = mount("ab", 2);
    try {
      view.dispatch({
        changes: { from: 2, insert: "\n" },
        selection: { anchor: 3 },
        userEvent: "input",
      });
      expect(announced(view)).toContain("new line");
    } finally {
      cleanup();
    }
  });

  it("uses a polite live region so it won't interrupt typing", () => {
    const { view, cleanup } = mount("abc", 3);
    try {
      const region = view.dom.querySelector(".cm-announced");
      expect(region?.getAttribute("aria-live")).toBe("polite");
    } finally {
      cleanup();
    }
  });
});
