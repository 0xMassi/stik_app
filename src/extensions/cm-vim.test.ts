import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { getCM, Vim } from "@replit/codemirror-vim";
import { createVimExtension, handleVimArrowInVisualMode } from "./cm-vim";

function withVimView(run: (view: EditorView) => void): void {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc: "hello world",
    extensions: [markdown(), createVimExtension()],
  });
  const view = new EditorView({ state, parent });
  try {
    run(view);
  } finally {
    view.destroy();
    parent.remove();
  }
}

describe("handleVimArrowInVisualMode", () => {
  it("routes right arrow via vim and keeps visual mode", () => {
    withVimView((view) => {
      const cm = getCM(view);
      expect(cm).toBeTruthy();
      if (!cm) throw new Error("CodeMirror instance unavailable");

      Vim.handleKey(cm, "v", "user");
      expect(Boolean(cm.state.vim?.visualMode)).toBe(true);

      const handled = handleVimArrowInVisualMode(view, "ArrowRight");
      expect(handled).toBe(true);
      expect(Boolean(cm.state.vim?.visualMode)).toBe(true);
    });
  });

  it("does nothing outside visual mode", () => {
    withVimView((view) => {
      const handled = handleVimArrowInVisualMode(view, "ArrowRight");
      expect(handled).toBe(false);
    });
  });
});
