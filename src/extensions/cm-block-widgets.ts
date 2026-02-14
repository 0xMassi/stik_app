/**
 * Block-level widget rendering for CodeMirror — Obsidian-style live preview.
 *
 * - Horizontal rules: replaced with styled <hr>, raw on cursor
 * - Tables: always-rendered interactive widget with editable cells,
 *   add row/column buttons, and Tab navigation. Cell edits sync
 *   back to the underlying markdown document.
 *
 * CRITICAL: Multi-line replace decorations MUST use StateField, not ViewPlugin.
 * ViewPlugin decorations that cross line boundaries are silently ignored.
 */

import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import {
  StateField,
  StateEffect,
  RangeSet,
  type EditorState,
  type Range,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";

// ── Horizontal Rule ─────────────────────────────────────────────────

class HrWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-hr-widget";
    return hr;
  }

  ignoreEvent() {
    return false;
  }
}

const hrWidget = new HrWidget();

// ── Table helpers ───────────────────────────────────────────────────

function parseCells(text: string): string[] {
  return text
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function buildTableMarkdown(headers: string[], rows: string[][]): string {
  const headerLine = "| " + headers.join(" | ") + " |";
  const sepLine = "| " + headers.map(() => "---").join(" | ") + " |";
  const bodyLines = rows.map(
    (row) => "| " + headers.map((_, i) => row[i] ?? "").join(" | ") + " |",
  );
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

// ── View lookup from DOM ────────────────────────────────────────────

function getEditorView(el: HTMLElement): EditorView | null {
  const editor = el.closest(".cm-editor") as HTMLElement | null;
  if (!editor) return null;
  return EditorView.findFromDOM(editor) ?? null;
}

// ── Interactive Table Widget ────────────────────────────────────────

/** Effect to skip widget recreation when a cell edit syncs to the doc */
const tableCellEdit = StateEffect.define<void>();

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly tableFrom: number,
    readonly tableTo: number,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return this.source === other.source;
  }

  toDOM() {
    const lines = this.source.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return document.createElement("span");

    const headers = parseCells(lines[0]);
    const bodyLines = lines.slice(2);
    const numCols = headers.length;

    // Wrapper — contenteditable=false so CM6 ignores this area
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";
    wrapper.setAttribute("contenteditable", "false");

    // Store range for event handlers
    wrapper.dataset.tableFrom = String(this.tableFrom);
    wrapper.dataset.tableTo = String(this.tableTo);

    const table = document.createElement("table");

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const cell of headers) {
      const th = document.createElement("th");
      th.textContent = cell;
      th.setAttribute("contenteditable", "plaintext-only");
      th.className = "cm-table-cell";
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    for (const line of bodyLines) {
      const cells = parseCells(line);
      const tr = document.createElement("tr");
      for (let i = 0; i < numCols; i++) {
        const td = document.createElement("td");
        td.textContent = cells[i] ?? "";
        td.setAttribute("contenteditable", "plaintext-only");
        td.className = "cm-table-cell";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    if (bodyLines.length === 0) {
      const tr = document.createElement("tr");
      for (let i = 0; i < numCols; i++) {
        const td = document.createElement("td");
        td.setAttribute("contenteditable", "plaintext-only");
        td.className = "cm-table-cell";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);

    // ── Add row button (direct listener — fires before CM6) ────────
    const addRowBtn = document.createElement("button");
    addRowBtn.className = "cm-table-add-row";
    addRowBtn.title = "Add row below";
    addRowBtn.textContent = "+";
    addRowBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const view = getEditorView(wrapper);
      if (!view) return;

      const range = getTableRange(wrapper);
      if (!range) return;

      const { headers: h, rows: r } = readTableFromDOM(wrapper);
      r.push(h.map(() => ""));
      const md = buildTableMarkdown(h, r);

      view.dispatch({
        changes: { from: range.from, to: range.to, insert: md },
      });

      // Widget recreated — find fresh DOM for focus
      requestAnimationFrame(() => {
        const fresh = view.dom.querySelector(
          `.cm-table-widget[data-table-from="${range.from}"]`,
        );
        if (!fresh) return;
        const rows = fresh.querySelectorAll("tbody tr");
        const last = rows[rows.length - 1];
        const cell = last?.querySelector<HTMLElement>(".cm-table-cell");
        if (cell) focusCell(cell);
      });
    });
    wrapper.appendChild(addRowBtn);

    // ── Add column button (direct listener) ────────────────────────
    const addColBtn = document.createElement("button");
    addColBtn.className = "cm-table-add-col";
    addColBtn.title = "Add column to the right";
    addColBtn.textContent = "+";
    addColBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const view = getEditorView(wrapper);
      if (!view) return;

      const range = getTableRange(wrapper);
      if (!range) return;

      const { headers: h, rows: r } = readTableFromDOM(wrapper);
      h.push("");
      r.forEach((row) => row.push(""));
      const md = buildTableMarkdown(h, r);

      view.dispatch({
        changes: { from: range.from, to: range.to, insert: md },
      });

      // Focus the new column header
      requestAnimationFrame(() => {
        const fresh = view.dom.querySelector(
          `.cm-table-widget[data-table-from="${range.from}"]`,
        );
        if (!fresh) return;
        const ths = fresh.querySelectorAll<HTMLElement>("thead th");
        const lastTh = ths[ths.length - 1];
        if (lastTh) focusCell(lastTh);
      });
    });
    wrapper.appendChild(addColBtn);

    return wrapper;
  }

  ignoreEvent() {
    return true;
  }
}

// ── Read cell values from the widget DOM ────────────────────────────

function readTableFromDOM(wrapper: Element): {
  headers: string[];
  rows: string[][];
} {
  const ths = wrapper.querySelectorAll("thead th");
  const headers = Array.from(ths).map((th) => th.textContent ?? "");

  const bodyRows = wrapper.querySelectorAll("tbody tr");
  const rows = Array.from(bodyRows).map((tr) => {
    const tds = tr.querySelectorAll("td");
    return Array.from(tds).map((td) => td.textContent ?? "");
  });

  return { headers, rows };
}

// ── Read table range from data attributes ───────────────────────────

function getTableRange(
  wrapper: HTMLElement,
): { from: number; to: number } | null {
  const from = wrapper.dataset.tableFrom;
  const to = wrapper.dataset.tableTo;
  if (from == null || to == null) return null;
  return { from: parseInt(from, 10), to: parseInt(to, 10) };
}

// ── Cell navigation ─────────────────────────────────────────────────

function focusCell(cell: HTMLElement) {
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function getAdjacentCell(
  table: Element,
  current: Element,
  direction: "next" | "prev" | "down" | "up",
): HTMLElement | null {
  const allCells = Array.from(
    table.querySelectorAll<HTMLElement>(".cm-table-cell"),
  );
  const idx = allCells.indexOf(current as HTMLElement);
  if (idx === -1) return null;

  const numCols = table.querySelectorAll("thead th").length;

  switch (direction) {
    case "next":
      return allCells[idx + 1] ?? null;
    case "prev":
      return allCells[idx - 1] ?? null;
    case "down":
      return allCells[idx + numCols] ?? null;
    case "up":
      return allCells[idx - numCols] ?? null;
  }
}

// ── Build decorations ───────────────────────────────────────────────

function buildBlockDecorations(state: EditorState): Range<Decoration>[] {
  const decorations: Range<Decoration>[] = [];
  const [cursor] = state.selection.ranges;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "HorizontalRule" && node.name !== "Table") return;

      if (node.name === "HorizontalRule") {
        if (cursor.from >= node.from && cursor.to <= node.to) return false;
        decorations.push(
          Decoration.replace({ widget: hrWidget }).range(node.from, node.to),
        );
        return false;
      }

      if (node.name === "Table") {
        const source = state.doc.sliceString(node.from, node.to);
        decorations.push(
          Decoration.replace({
            widget: new TableWidget(source, node.from, node.to),
            block: true,
          }).range(node.from, node.to),
        );
        return false;
      }
    },
  });

  return decorations;
}

// ── StateField ──────────────────────────────────────────────────────

const blockDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return RangeSet.of(buildBlockDecorations(state), true);
  },

  update(decorations, transaction) {
    if (transaction.effects.some((e) => e.is(tableCellEdit))) {
      return decorations.map(transaction.changes);
    }
    return RangeSet.of(buildBlockDecorations(transaction.state), true);
  },

  provide(field) {
    return EditorView.decorations.from(field);
  },
});

// ── Event handlers (cell editing + keyboard nav) ────────────────────

const blockWidgetEvents = EditorView.domEventHandlers({
  // Cell editing: sync contenteditable changes to document
  input(event: Event, view: EditorView) {
    const target = event.target as HTMLElement;
    const wrapper = target.closest(".cm-table-widget") as HTMLElement | null;
    if (!wrapper) return false;

    const range = getTableRange(wrapper);
    if (!range) return false;

    const { headers, rows } = readTableFromDOM(wrapper);
    const newMarkdown = buildTableMarkdown(headers, rows);

    view.dispatch({
      changes: { from: range.from, to: range.to, insert: newMarkdown },
      effects: tableCellEdit.of(undefined),
    });

    // Keep data attrs in sync (widget DOM preserved by tableCellEdit)
    wrapper.dataset.tableTo = String(range.from + newMarkdown.length);

    return true;
  },

  // Keyboard: Tab, Enter, Escape inside table cells
  keydown(event: KeyboardEvent, _view: EditorView) {
    const target = event.target as HTMLElement;
    if (!target.closest(".cm-table-widget")) return false;

    const table = target.closest("table");
    const cell = target.closest(".cm-table-cell");
    if (!table || !cell) return true;

    if (event.key === "Tab") {
      event.preventDefault();
      const next = getAdjacentCell(
        table,
        cell,
        event.shiftKey ? "prev" : "next",
      );
      if (next) focusCell(next);
      return true;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const below = getAdjacentCell(table, cell, "down");
      if (below) focusCell(below);
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      (cell as HTMLElement).blur();
      const view = getEditorView(target);
      if (view) view.focus();
      return true;
    }

    return true;
  },
});

// ── Export ───────────────────────────────────────────────────────────

export const blockWidgetPlugin = [blockDecorationField, blockWidgetEvents];
