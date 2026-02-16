import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { insertLink } from "./cm-formatting";

function createMockView(doc: string, anchor: number, head = anchor): EditorView {
  let state = EditorState.create({
    doc,
    selection: { anchor, head },
  });

  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorView["dispatch"]>[0]) {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;

  return view;
}

describe("insertLink", () => {
  it("wraps selected text and selects only url placeholder", () => {
    const view = createMockView("Apple", 0, 5);
    insertLink(view);

    expect(view.state.doc.toString()).toBe("[Apple](url)");
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("url");
  });

  it("inserts template when there is no selection", () => {
    const view = createMockView("", 0);
    insertLink(view);

    expect(view.state.doc.toString()).toBe("[text](url)");
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe("text");
  });
});
