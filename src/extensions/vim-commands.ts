/**
 * Vim command functions for the Stik editor.
 * Uses tiptap commands where possible for reliable state management.
 * Falls back to ProseMirror transactions only when tiptap has no equivalent.
 */

import type { Editor } from "@tiptap/core";
import { TextSelection, Selection } from "@tiptap/pm/state";

// --- Movement ---

export function moveLeft(editor: Editor): boolean {
  // In vim, h doesn't cross line boundaries
  const { $head } = editor.state.selection;
  if ($head.parentOffset === 0) return true;
  const pos = $head.pos - 1;
  editor.commands.setTextSelection(pos);
  return true;
}

export function moveRight(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  // Vim l doesn't cross line boundaries, stop before end
  if ($head.pos >= $head.end()) return true;
  editor.commands.setTextSelection($head.pos + 1);
  return true;
}

export function moveDown(editor: Editor): boolean {
  // Use coordsAtPos for visual vertical movement
  const view = editor.view;
  const { $head } = view.state.selection;
  const coords = view.coordsAtPos($head.pos);
  // Go one full line-height below
  const lineHeight = parseFloat(getComputedStyle(view.dom).lineHeight) || 20;
  const below = view.posAtCoords({ left: coords.left, top: coords.bottom + lineHeight * 0.5 });
  if (below) {
    editor.commands.setTextSelection(below.pos);
  }
  return true;
}

export function moveUp(editor: Editor): boolean {
  const view = editor.view;
  const { $head } = view.state.selection;
  const coords = view.coordsAtPos($head.pos);
  const lineHeight = parseFloat(getComputedStyle(view.dom).lineHeight) || 20;
  const above = view.posAtCoords({ left: coords.left, top: coords.top - lineHeight * 0.5 });
  if (above) {
    editor.commands.setTextSelection(above.pos);
  }
  return true;
}

export function moveWordForward(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  const parentEnd = $head.end();
  const text = editor.state.doc.textBetween($head.pos, parentEnd, "\n");
  const match = text.match(/^\w*\W*\w/);
  if (match) {
    editor.commands.setTextSelection($head.pos + match[0].length - 1);
  } else {
    // Try to jump to start of next block
    const nextBlockPos = parentEnd + 2; // skip closing + opening tag
    if (nextBlockPos < editor.state.doc.content.size) {
      editor.commands.setTextSelection(nextBlockPos);
    } else {
      editor.commands.setTextSelection(parentEnd);
    }
  }
  return true;
}

export function moveWordBackward(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  const parentStart = $head.start();
  const text = editor.state.doc.textBetween(parentStart, $head.pos, "\n");
  const match = text.match(/\w+\W*$/);
  if (match) {
    editor.commands.setTextSelection(parentStart + text.length - match[0].length);
  } else {
    // Try to jump to end of previous block
    const prevBlockPos = parentStart - 2;
    if (prevBlockPos > 0) {
      editor.commands.setTextSelection(prevBlockPos);
    } else {
      editor.commands.setTextSelection(parentStart);
    }
  }
  return true;
}

export function moveToLineStart(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  editor.commands.setTextSelection($head.start());
  return true;
}

export function moveToLineEnd(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  editor.commands.setTextSelection($head.end());
  return true;
}

export function moveToDocStart(editor: Editor): boolean {
  const sel = Selection.atStart(editor.state.doc);
  const tr = editor.state.tr.setSelection(sel);
  editor.view.dispatch(tr);
  return true;
}

export function moveToDocEnd(editor: Editor): boolean {
  const sel = Selection.atEnd(editor.state.doc);
  const tr = editor.state.tr.setSelection(sel);
  editor.view.dispatch(tr);
  return true;
}

// --- Editing ---

export function deleteChar(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  if ($head.pos >= $head.end()) return true;
  editor.commands.deleteRange({ from: $head.pos, to: $head.pos + 1 });
  return true;
}

export function deleteLine(editor: Editor, yankRegister: { value: string }): boolean {
  const { state } = editor;
  const { $head } = state.selection;
  const blockRange = $head.blockRange();
  if (!blockRange) return true;

  yankRegister.value = state.doc.textBetween(blockRange.$from.pos, blockRange.$to.pos, "\n");

  // Delete the entire block node
  const from = blockRange.$from.before(blockRange.depth);
  const to = blockRange.$to.after(blockRange.depth);
  const tr = state.tr.delete(from, to);
  editor.view.dispatch(tr);

  // If document is now empty, ensure there's at least one paragraph
  if (editor.state.doc.content.size <= 2) {
    editor.commands.setContent("<p></p>");
  }
  return true;
}

export function yankLine(editor: Editor, yankRegister: { value: string }): boolean {
  const { $head } = editor.state.selection;
  const blockRange = $head.blockRange();
  if (!blockRange) return true;
  yankRegister.value = editor.state.doc.textBetween(blockRange.$from.pos, blockRange.$to.pos, "\n");
  return true;
}

export function pasteAfter(editor: Editor, yankRegister: { value: string }): boolean {
  if (!yankRegister.value) return true;

  const { $head } = editor.state.selection;
  const blockEnd = $head.after($head.depth);
  const node = editor.state.schema.nodes.paragraph.create(
    null,
    editor.state.schema.text(yankRegister.value)
  );
  const tr = editor.state.tr.insert(blockEnd, node);
  // Move cursor into the new paragraph
  const newPos = blockEnd + 1;
  tr.setSelection(TextSelection.create(tr.doc, newPos));
  editor.view.dispatch(tr);
  return true;
}

// --- Change commands (delete + enter insert mode) ---

export function changeWord(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  const parentEnd = $head.end();
  const text = editor.state.doc.textBetween($head.pos, parentEnd, "\n");
  const match = text.match(/^\w+/);
  const endPos = match ? $head.pos + match[0].length : Math.min($head.pos + 1, parentEnd);

  if (endPos > $head.pos) {
    editor.commands.deleteRange({ from: $head.pos, to: endPos });
  }
  return true;
}

export function changeLine(editor: Editor, yankRegister: { value: string }): boolean {
  const { $head } = editor.state.selection;
  const start = $head.start();
  const end = $head.end();

  yankRegister.value = editor.state.doc.textBetween(start, end, "\n");
  if (end > start) {
    editor.commands.deleteRange({ from: start, to: end });
  }
  return true;
}

export function changeToEnd(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  const end = $head.end();
  if (end > $head.pos) {
    editor.commands.deleteRange({ from: $head.pos, to: end });
  }
  return true;
}

// --- Text object helpers ---

function findWordBounds(editor: Editor): { from: number; to: number } | null {
  const { $head } = editor.state.selection;
  const start = $head.start();
  const end = $head.end();
  const text = editor.state.doc.textBetween(start, end, "\n");
  const offset = $head.pos - start;

  // Find the word surrounding the cursor
  let wordStart = offset;
  let wordEnd = offset;

  // Expand left to word boundary
  while (wordStart > 0 && /\w/.test(text[wordStart - 1])) wordStart--;
  // Expand right to word boundary
  while (wordEnd < text.length && /\w/.test(text[wordEnd])) wordEnd++;

  if (wordStart === wordEnd) return null;
  return { from: start + wordStart, to: start + wordEnd };
}

function findSurroundingPair(
  editor: Editor,
  open: string,
  close: string,
): { from: number; to: number } | null {
  const { $head } = editor.state.selection;
  const start = $head.start();
  const end = $head.end();
  const text = editor.state.doc.textBetween(start, end, "\n");
  const offset = $head.pos - start;

  // Search left for opening delimiter
  let openIdx = -1;
  for (let i = offset - 1; i >= 0; i--) {
    if (text[i] === open) { openIdx = i; break; }
    if (text[i] === close && i !== offset) break; // hit a closer first
  }
  if (openIdx === -1) return null;

  // Search right for closing delimiter
  let closeIdx = -1;
  for (let i = open === close ? offset : openIdx + 1; i < text.length; i++) {
    if (text[i] === close && i > openIdx) { closeIdx = i; break; }
  }
  if (closeIdx === -1) return null;

  // Return inner range (between delimiters, not including them)
  return { from: start + openIdx + 1, to: start + closeIdx };
}

export function changeInnerWord(editor: Editor): boolean {
  const bounds = findWordBounds(editor);
  if (bounds && bounds.to > bounds.from) {
    editor.commands.deleteRange(bounds);
  }
  return true;
}

export function deleteInnerWord(editor: Editor): boolean {
  const bounds = findWordBounds(editor);
  if (bounds && bounds.to > bounds.from) {
    editor.commands.deleteRange(bounds);
  }
  return true;
}

export function changeInsidePair(editor: Editor, open: string, close: string): boolean {
  const bounds = findSurroundingPair(editor, open, close);
  if (bounds && bounds.to > bounds.from) {
    editor.commands.deleteRange(bounds);
  }
  return true;
}

export function deleteInsidePair(editor: Editor, open: string, close: string): boolean {
  const bounds = findSurroundingPair(editor, open, close);
  if (bounds && bounds.to > bounds.from) {
    editor.commands.deleteRange(bounds);
  }
  return true;
}

// --- Insert mode entry helpers ---

export function insertAfterCursor(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  if ($head.pos < $head.end()) {
    editor.commands.setTextSelection($head.pos + 1);
  }
  return true;
}

export function insertAtLineEnd(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  editor.commands.setTextSelection($head.end());
  return true;
}

export function openLineBelow(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  const blockEnd = $head.after($head.depth);
  const node = editor.state.schema.nodes.paragraph.create();
  const tr = editor.state.tr.insert(blockEnd, node);
  tr.setSelection(TextSelection.create(tr.doc, blockEnd + 1));
  editor.view.dispatch(tr);
  return true;
}

export function openLineAbove(editor: Editor): boolean {
  const { $head } = editor.state.selection;
  const blockStart = $head.before($head.depth);
  const node = editor.state.schema.nodes.paragraph.create();
  const tr = editor.state.tr.insert(blockStart, node);
  tr.setSelection(TextSelection.create(tr.doc, blockStart + 1));
  editor.view.dispatch(tr);
  return true;
}
