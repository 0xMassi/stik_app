/**
 * Markdown formatting helpers for CodeMirror.
 * Wraps/unwraps selected text or current line with markdown syntax.
 */

import type { EditorView } from "@codemirror/view";

/** Wrap or unwrap the selection with inline markers (**, *, ~~, ==, `) */
export function toggleInlineFormat(view: EditorView, marker: string): void {
  const { state } = view;
  const { from, to } = state.selection.main;

  if (from === to) return; // No selection — nothing to wrap

  const selected = state.sliceDoc(from, to);

  // Check if already wrapped
  const mLen = marker.length;
  const before = state.sliceDoc(Math.max(0, from - mLen), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + mLen));

  if (before === marker && after === marker) {
    // Unwrap: remove markers surrounding the selection
    view.dispatch({
      changes: [
        { from: from - mLen, to: from, insert: "" },
        { from: to, to: to + mLen, insert: "" },
      ],
      selection: { anchor: from - mLen, head: to - mLen },
    });
  } else if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= mLen * 2) {
    // Selection includes markers — remove them
    const inner = selected.slice(mLen, -mLen);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    });
  } else {
    // Wrap selection
    const wrapped = `${marker}${selected}${marker}`;
    view.dispatch({
      changes: { from, to, insert: wrapped },
      selection: { anchor: from, head: from + wrapped.length },
    });
  }
}

/** Toggle a line prefix (>, -, 1., - [ ], #, ##, ###) on the current line(s) */
export function toggleLinePrefix(view: EditorView, prefix: string): void {
  const { state } = view;
  const { from, to } = state.selection.main;

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to);

  const changes: { from: number; to: number; insert: string }[] = [];
  let selDelta = 0;

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = state.doc.line(lineNum);
    const trimmed = line.text;

    // For headings, handle cycling: if already has this prefix, remove it
    if (trimmed.startsWith(prefix + " ")) {
      // Remove prefix
      changes.push({
        from: line.from,
        to: line.from + prefix.length + 1,
        insert: "",
      });
      if (lineNum === startLine.number) selDelta -= prefix.length + 1;
    } else if (prefix.startsWith("#")) {
      // Remove any existing heading prefix first
      const headingMatch = trimmed.match(/^#{1,3}\s/);
      if (headingMatch) {
        changes.push({
          from: line.from,
          to: line.from + headingMatch[0].length,
          insert: prefix + " ",
        });
        if (lineNum === startLine.number) selDelta += prefix.length + 1 - headingMatch[0].length;
      } else {
        changes.push({ from: line.from, to: line.from, insert: prefix + " " });
        if (lineNum === startLine.number) selDelta += prefix.length + 1;
      }
    } else if (prefix === ">" || prefix === "-" || prefix === "- [ ]") {
      // Check for existing prefix of same type
      const bulletMatch = trimmed.match(/^- \[[ x]\]\s/);
      const quoteMatch = trimmed.match(/^>\s/);
      const listMatch = trimmed.match(/^-\s/);
      const olMatch = trimmed.match(/^\d+\.\s/);

      let removeLen = 0;
      if (prefix === "- [ ]" && bulletMatch) {
        removeLen = bulletMatch[0].length;
      } else if (prefix === ">" && quoteMatch) {
        removeLen = quoteMatch[0].length;
      } else if (prefix === "-" && listMatch && !bulletMatch) {
        removeLen = listMatch[0].length;
      }

      if (removeLen > 0) {
        // Remove existing prefix
        changes.push({ from: line.from, to: line.from + removeLen, insert: "" });
        if (lineNum === startLine.number) selDelta -= removeLen;
      } else {
        // Remove any conflicting prefix, then add new one
        let existingLen = 0;
        if (bulletMatch) existingLen = bulletMatch[0].length;
        else if (quoteMatch) existingLen = quoteMatch[0].length;
        else if (listMatch) existingLen = listMatch[0].length;
        else if (olMatch) existingLen = olMatch[0].length;

        changes.push({
          from: line.from,
          to: line.from + existingLen,
          insert: prefix + " ",
        });
        if (lineNum === startLine.number) selDelta += prefix.length + 1 - existingLen;
      }
    } else {
      // Ordered list: 1.
      const olMatch = trimmed.match(/^\d+\.\s/);
      if (olMatch) {
        changes.push({ from: line.from, to: line.from + olMatch[0].length, insert: "" });
        if (lineNum === startLine.number) selDelta -= olMatch[0].length;
      } else {
        changes.push({ from: line.from, to: line.from, insert: prefix + " " });
        if (lineNum === startLine.number) selDelta += prefix.length + 1;
      }
    }
  }

  if (changes.length > 0) {
    view.dispatch({
      changes,
      selection: { anchor: Math.max(0, from + selDelta) },
    });
  }
}

/** Insert a link template [text](url) around selection or at cursor */
export function insertLink(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected) {
    const link = `[${selected}](url)`;
    view.dispatch({
      changes: { from, to, insert: link },
      // Place cursor inside the (url) part for easy editing
      selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
    });
  } else {
    const link = "[text](url)";
    view.dispatch({
      changes: { from, to: from, insert: link },
      selection: { anchor: from + 1, head: from + 5 },
    });
  }
}

/**
 * Detect active formatting state at the cursor position.
 * Checks the current line and surrounding markers.
 */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  heading: 0 | 1 | 2 | 3;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  link: boolean;
  hasSelection: boolean;
}

export function detectFormatState(view: EditorView): FormatState {
  const { state } = view;
  const { from, to } = state.selection.main;
  const hasSelection = from !== to;
  const line = state.doc.lineAt(from);
  const lineText = line.text;

  // Line-level detection
  const headingMatch = lineText.match(/^(#{1,3})\s/);
  const heading = headingMatch ? (headingMatch[1].length as 1 | 2 | 3) : 0;
  const blockquote = /^>\s/.test(lineText);
  const bulletList = /^-\s/.test(lineText) && !/^- \[[ x]\]/.test(lineText);
  const orderedList = /^\d+\.\s/.test(lineText);
  const taskList = /^- \[[ x]\]\s/.test(lineText);

  // Inline detection: check if cursor is inside markers
  const cursorOffset = from - line.from;

  // Get a generous chunk around cursor for inline detection
  const contextFrom = Math.max(0, from - 200);
  const contextTo = Math.min(state.doc.length, to + 200);
  const context = state.sliceDoc(contextFrom, contextTo);
  const relPos = from - contextFrom;

  const bold = isInsideMarker(context, relPos, "**");
  const italic = isInsideMarker(context, relPos, "*") && !bold;
  const strike = isInsideMarker(context, relPos, "~~");
  const code = isInsideMarker(context, relPos, "`");
  const highlightMark = isInsideMarker(context, relPos, "==");
  const link = isInsideMarkdownLink(lineText, cursorOffset);

  return {
    bold,
    italic: italic || isInsideMarker(context, relPos, "_"),
    strike,
    code,
    highlight: highlightMark,
    heading,
    blockquote,
    bulletList,
    orderedList,
    taskList,
    link,
    hasSelection,
  };
}

/** Check if position is between opening and closing marker pairs */
function isInsideMarker(text: string, pos: number, marker: string): boolean {
  const mLen = marker.length;
  let inside = false;
  let i = 0;

  while (i < text.length) {
    if (text.substring(i, i + mLen) === marker) {
      if (inside) {
        // Closing marker
        if (pos <= i) return true;
        inside = false;
        i += mLen;
        continue;
      }
      // Opening marker
      inside = true;
      i += mLen;
      if (pos < i) return false; // cursor is on the marker itself
      continue;
    }
    i++;
  }
  return false;
}

/** Check if cursor is inside a [text](url) markdown link */
function isInsideMarkdownLink(lineText: string, offset: number): boolean {
  const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
  let match;
  while ((match = linkRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) return true;
  }
  return false;
}
