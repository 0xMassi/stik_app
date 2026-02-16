import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { hideMarkersPlugin } from "./cm-hide-markers";

function withView(
  doc: string,
  anchor: number,
  run: (view: EditorView) => void
): void {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown(), hideMarkersPlugin],
  });
  const view = new EditorView({ state, parent });
  try {
    run(view);
  } finally {
    view.destroy();
    parent.remove();
  }
}

describe("hideMarkersPlugin links", () => {
  it("hides markdown link url/markers when cursor is outside link", () => {
    const doc = "[Apple](https://apple.com)\n";
    withView(doc, doc.length, (view) => {
      const rendered = view.contentDOM.textContent ?? "";
      expect(rendered).toContain("Apple");
      expect(rendered).not.toContain("https://apple.com");
      expect(rendered).not.toContain("[");
      expect(rendered).not.toContain("]");
    });
  });

  it("reveals raw markdown link when cursor is inside link", () => {
    const doc = "[Apple](https://apple.com)\n";
    withView(doc, 3, (view) => {
      const rendered = view.contentDOM.textContent ?? "";
      expect(rendered).toContain("[Apple](https://apple.com)");
    });
  });
});
