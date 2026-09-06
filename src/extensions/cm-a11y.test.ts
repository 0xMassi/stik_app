import { describe, it, expect } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { describeEdit } from "./cm-a11y";

/** Build a transaction from a starting doc/selection so describeEdit can read it. */
function makeTr(
  doc: string,
  spec: TransactionSpec,
  selection?: { anchor: number; head: number },
) {
  return EditorState.create({ doc, selection }).update(spec);
}

describe("describeEdit", () => {
  it("announces a single deleted character", () => {
    const tr = makeTr("abc", {
      changes: { from: 2, to: 3 },
      userEvent: "delete.backward",
    });
    expect(describeEdit(tr)).toBe("deleted c");
  });

  it("announces a deleted word (Option-Backspace)", () => {
    const tr = makeTr("hello world", {
      changes: { from: 6, to: 11 },
      userEvent: "delete.backward",
    });
    expect(describeEdit(tr)).toBe("deleted world");
  });

  it("names a deleted space", () => {
    const tr = makeTr("a b", {
      changes: { from: 1, to: 2 },
      userEvent: "delete.backward",
    });
    expect(describeEdit(tr)).toBe("deleted space");
  });

  it("announces deleting a line break", () => {
    const tr = makeTr("a\nb", {
      changes: { from: 1, to: 2 },
      userEvent: "delete.backward",
    });
    expect(describeEdit(tr)).toBe("deleted new line");
  });

  it("announces a newline insertion (Enter)", () => {
    const tr = makeTr("ab", {
      changes: { from: 2, insert: "\n" },
      userEvent: "input",
    });
    expect(describeEdit(tr)).toBe("new line");
  });

  it("stays silent for typed characters", () => {
    const tr = makeTr("ab", {
      changes: { from: 2, insert: "c" },
      userEvent: "input",
    });
    expect(describeEdit(tr)).toBeNull();
  });

  it("stays silent for selection deletions (commands announces those)", () => {
    const tr = makeTr(
      "abc",
      { changes: { from: 0, to: 2 }, userEvent: "delete.backward" },
      { anchor: 0, head: 2 },
    );
    expect(describeEdit(tr)).toBeNull();
  });

  it("stays silent for non-document transactions", () => {
    const tr = makeTr("abc", { selection: { anchor: 1 } });
    expect(describeEdit(tr)).toBeNull();
  });
});
