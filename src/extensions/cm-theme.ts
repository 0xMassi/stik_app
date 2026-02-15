/**
 * CodeMirror theme for Stik — matches the existing design tokens.
 * Source-mode markdown editing with syntax highlighting.
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { highlightTag } from "./cm-highlight";

/** Base editor theme — layout, scrolling, placeholder */
export const stikEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--editor-font-size, 14px)",
    color: "rgb(var(--color-ink))",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "1.5",
  },
  ".cm-content": {
    padding: "12px 16px",
    caretColor: "rgb(var(--color-coral))",
    minHeight: "100%",
  },
  "&.cm-focused .cm-content": {
    outline: "none",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-cursor": {
    borderLeftColor: "rgb(var(--color-coral))",
    borderLeftWidth: "2px",
  },
  ".cm-dropCursor": {
    borderLeftColor: "rgba(var(--color-coral), 0.35)",
    borderLeftWidth: "1px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(232, 112, 95, 0.15) !important",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "rgba(232, 112, 95, 0.2) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-placeholder": {
    color: "var(--editor-placeholder)",
    fontStyle: "normal",
  },
  // Wiki-link decorations
  ".cm-wikilink": {
    color: "rgb(var(--color-coral))",
    textDecoration: "underline",
    textDecorationStyle: "dashed",
    textUnderlineOffset: "2px",
    textDecorationThickness: "1px",
    cursor: "pointer",
    padding: "0 1px",
    borderRadius: "2px",
    transition: "background-color 0.15s",
  },
  ".cm-wikilink:hover": {
    backgroundColor: "rgba(232, 112, 95, 0.1)",
  },
  // Autocomplete panel
  ".cm-tooltip-autocomplete": {
    border: "1px solid rgb(var(--color-line))",
    borderRadius: "10px",
    backgroundColor: "rgb(var(--color-bg))",
    boxShadow: "var(--shadow-stik)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete ul": {
    padding: "4px",
    maxHeight: "240px",
  },
  ".cm-tooltip-autocomplete ul li": {
    padding: "6px 10px",
    borderRadius: "6px",
    fontSize: "13px",
    color: "rgb(var(--color-ink))",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "rgb(var(--color-line))",
    color: "rgb(var(--color-ink))",
  },
  ".cm-completionLabel": {
    fontWeight: "500",
  },
  ".cm-completionDetail": {
    fontSize: "10px",
    fontWeight: "600",
    color: "rgb(var(--color-coral))",
    backgroundColor: "rgba(232, 112, 95, 0.1)",
    padding: "1px 6px",
    borderRadius: "99px",
    marginLeft: "8px",
  },
  // Search panel
  ".cm-panels": {
    backgroundColor: "rgb(var(--color-bg))",
    borderBottom: "1px solid rgb(var(--color-line))",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(232, 112, 95, 0.2)",
    borderRadius: "2px",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(232, 112, 95, 0.35)",
  },
  // Horizontal rule widget
  ".cm-hr-widget": {
    border: "none",
    borderTop: "1px solid rgb(var(--color-line))",
    margin: "8px 0",
  },
  // Table widget
  ".cm-table-widget": {
    position: "relative",
    border: "1px solid rgb(var(--color-line))",
    borderRadius: "6px",
    overflow: "hidden",
    margin: "4px 0",
  },
  ".cm-table-widget table": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "inherit",
  },
  ".cm-table-widget th": {
    backgroundColor: "rgba(var(--color-ink), 0.05)",
    fontWeight: "600",
    textAlign: "left",
    padding: "6px 12px",
    borderBottom: "1px solid rgb(var(--color-line))",
  },
  ".cm-table-widget td": {
    padding: "6px 12px",
    borderBottom: "1px solid rgb(var(--color-line))",
  },
  ".cm-table-widget tr:last-child td": {
    borderBottom: "none",
  },
  ".cm-table-widget th + th, .cm-table-widget td + td": {
    borderLeft: "1px solid rgb(var(--color-line))",
  },
  // Editable cell focus
  ".cm-table-cell:focus": {
    outline: "none",
    boxShadow: "inset 0 0 0 2px rgb(var(--color-coral))",
  },
  // Add row button — inside widget, full-width bar at bottom
  ".cm-table-add-row": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "28px",
    border: "none",
    borderTop: "1px solid rgb(var(--color-line))",
    backgroundColor: "transparent",
    color: "rgb(var(--color-stone))",
    fontSize: "14px",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 0.15s, background-color 0.15s",
  },
  ".cm-table-widget:hover .cm-table-add-row": {
    opacity: "1",
  },
  ".cm-table-add-row:hover": {
    backgroundColor: "rgba(232, 112, 95, 0.1)",
    color: "rgb(var(--color-coral))",
  },
  // Add column button — vertical bar on right edge
  ".cm-table-add-col": {
    position: "absolute",
    right: "0",
    top: "0",
    bottom: "0",
    width: "28px",
    border: "none",
    borderLeft: "1px solid rgb(var(--color-line))",
    backgroundColor: "transparent",
    color: "rgb(var(--color-stone))",
    fontSize: "14px",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 0.15s, background-color 0.15s",
  },
  ".cm-table-widget:hover .cm-table-add-col": {
    opacity: "1",
  },
  ".cm-table-add-col:hover": {
    backgroundColor: "rgba(232, 112, 95, 0.1)",
    color: "rgb(var(--color-coral))",
  },
  // Table context menu (right-click)
  ".cm-table-context-menu": {
    position: "absolute",
    zIndex: "1000",
    backgroundColor: "rgb(var(--color-bg))",
    border: "1px solid rgb(var(--color-line))",
    borderRadius: "8px",
    padding: "4px 0",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
    minWidth: "160px",
  },
  ".cm-table-menu-item": {
    display: "block",
    width: "100%",
    padding: "6px 12px",
    border: "none",
    backgroundColor: "transparent",
    color: "rgb(var(--color-ink))",
    fontSize: "12px",
    textAlign: "left",
    cursor: "pointer",
    lineHeight: "1.4",
  },
  ".cm-table-menu-item:hover": {
    backgroundColor: "rgba(232, 112, 95, 0.1)",
    color: "rgb(var(--color-coral))",
  },
  ".cm-table-menu-disabled": {
    opacity: "0.35",
    cursor: "default",
    pointerEvents: "none",
  },
  ".cm-table-menu-sep": {
    height: "1px",
    backgroundColor: "rgb(var(--color-line))",
    margin: "4px 0",
  },
});

/** Syntax highlighting for markdown source mode.
 *
 * Key insight: @lezer/markdown uses "/..." selectors (e.g. "BulletList/...")
 * which tag ALL descendants, not just markers. So `tags.list` applies to the
 * entire list item content. We intentionally DON'T style `tags.list` to avoid
 * coloring all list text. List markers (-, *, 1.) are separately tagged as
 * `tags.processingInstruction` and get muted styling there.
 */
export const stikHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    // Headings — bold, slightly larger
    { tag: tags.heading1, fontWeight: "700", fontSize: "1.43em" },
    { tag: tags.heading2, fontWeight: "600", fontSize: "1.21em" },
    { tag: tags.heading3, fontWeight: "600", fontSize: "1.07em" },
    // Markdown syntax markers (#, **, *, ~~, `, [, ], -, 1.)
    // No fontWeight override — let markers inherit weight from their context
    // (e.g. # inside a heading stays bold, ** stays normal)
    { tag: tags.processingInstruction, color: "rgb(var(--color-stone))" },
    // Bold
    { tag: tags.strong, fontWeight: "700" },
    // Italic
    { tag: tags.emphasis, fontStyle: "italic" },
    // Strikethrough
    {
      tag: tags.strikethrough,
      textDecoration: "line-through",
      color: "var(--editor-strikethrough)",
    },
    // Inline code
    {
      tag: tags.monospace,
      fontFamily: "Monaco, Consolas, monospace",
      fontSize: "0.86em",
      backgroundColor: "var(--editor-code-bg)",
      padding: "1px 4px",
      borderRadius: "3px",
    },
    // Links
    { tag: tags.link, color: "var(--editor-link)", textDecoration: "underline" },
    { tag: tags.url, color: "var(--editor-link)" },
    // Block quote content (all descendants of Blockquote)
    { tag: tags.quote, color: "var(--editor-blockquote-text)", fontStyle: "italic" },
    // ==highlight== text
    {
      tag: highlightTag,
      backgroundColor: "rgba(232, 112, 95, 0.15)",
      borderRadius: "2px",
    },
    // Task markers: [ ] and [x]
    { tag: tags.atom, color: "rgb(var(--color-stone))" },
    // Meta / syntax chars
    { tag: tags.meta, color: "rgb(var(--color-stone))" },
    // HTML angle brackets
    { tag: tags.angleBracket, color: "rgb(var(--color-stone))" },
    // Code language labels (```javascript)
    { tag: tags.labelName, color: "rgb(var(--color-stone))" },
  ])
);
