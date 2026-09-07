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
import { t } from "@/i18n";
import {
  StateField,
  Facet,
  RangeSet,
  type EditorState,
  type Range,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";
import { Lexer, type Tokens } from "marked";

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

// ── Inline Image ────────────────────────────────────────────────────

export const remoteImagesAllowed = Facet.define<boolean, boolean>({
  combine(values) {
    return values[values.length - 1] ?? false;
  },
});

export function isRemoteImageSource(src: string): boolean {
  const trimmed = src.trim();
  const looksNetworked = /^(?:https?:)?\/\//i.test(trimmed) || /^https?:/i.test(trimmed);
  if (!looksNetworked) return false;

  try {
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "asset.localhost"
    );
  } catch {
    // A malformed HTTP(S) URL must fail closed. Assigning it to `img.src`
    // would let the webview decide whether it is network-capable.
    return true;
  }
}

function remoteImageHost(src: string): string {
  const trimmed = src.trim();
  try {
    return new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed)
      .hostname;
  } catch {
    return t("image.externalServer");
  }
}

function appendImage(wrap: HTMLSpanElement, src: string, alt: string) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.draggable = false;

  img.onerror = () => {
    wrap.classList.add("cm-image-error");
    img.remove();
    const fallback = document.createElement("span");
    fallback.className = "cm-image-error-text";
    fallback.textContent = alt || t("image.failedToLoad");
    wrap.appendChild(fallback);
  };

  wrap.appendChild(img);
}

function blockedImageMessage(src: string, alt: string): string {
  const message = t("image.remoteBlocked", { domain: remoteImageHost(src) });
  return alt ? `${message}: ${alt}` : message;
}

/** Preserve image consent/loading and editable table DOM while changing labels. */
export function refreshBlockWidgetLabels(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".cm-image-widget").forEach((wrap) => {
    const alt = wrap.dataset.imageAlt || "";
    if (wrap.classList.contains("cm-image-blocked")) {
      const message = blockedImageMessage(wrap.dataset.imageSource || "", alt);
      wrap.setAttribute("aria-label", message);
      const text = wrap.querySelector(".cm-image-blocked-text");
      if (text) text.textContent = message;
      const button = wrap.querySelector(".cm-image-load-once");
      if (button) button.textContent = t("image.loadOnce");
    }
    const error = wrap.querySelector(".cm-image-error-text");
    if (error && !alt) error.textContent = t("image.failedToLoad");
  });
  for (const [selector, key] of [[".cm-table-add-row", "table.addRowBelow"], [".cm-table-add-col", "table.addColumnRight"]] as const) {
    root.querySelectorAll<HTMLElement>(selector).forEach((button) => { button.title = t(key); });
  }
}

export function createImageWidgetDom(
  src: string,
  alt: string,
  loadRemoteImages: boolean,
): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = "cm-image-widget";
  wrap.dataset.imageSource = src;
  wrap.dataset.imageAlt = alt;

  if (isRemoteImageSource(src) && !loadRemoteImages) {
    const blockedMessage = blockedImageMessage(src, alt);
    wrap.classList.add("cm-image-blocked");
    wrap.setAttribute("role", "group");
    wrap.setAttribute(
      "aria-label",
      blockedMessage,
    );

    const message = document.createElement("span");
    message.className = "cm-image-blocked-text";
    message.textContent = blockedMessage;

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "cm-image-load-once";
    loadButton.textContent = t("image.loadOnce");
    loadButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      wrap.replaceChildren();
      wrap.classList.remove("cm-image-blocked");
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-label");
      appendImage(wrap, src, alt);
    };

    wrap.append(message, loadButton);
    return wrap;
  }

  appendImage(wrap, src, alt);
  return wrap;
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly loadRemoteImages: boolean,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      this.src === other.src &&
      this.alt === other.alt &&
      this.loadRemoteImages === other.loadRemoteImages
    );
  }

  toDOM() {
    return createImageWidgetDom(
      this.src,
      this.alt,
      this.loadRemoteImages,
    );
  }

  ignoreEvent() {
    return false;
  }
}

// ── Table helpers ───────────────────────────────────────────────────

function encodeTableCell(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\\/g, "&#92;").replace(/\|/g, "\\|").replace(/\r\n?|\n/g, "<br>");
}

function decodeTableCell(text: string): string {
  // Decode only our text serialization, never render cell content as HTML.
  const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#92;": "\\", "&#124;": "|" };
  return text.replace(/<br\s*\/?>/gi, "\n")
    .replace(/&(?:amp|lt|gt|#92|#124);/g, (entity) => entities[entity]);
}

function buildTableMarkdown(headers: string[], rows: string[][]): string {
  const headerLine = "| " + headers.map(encodeTableCell).join(" | ") + " |";
  const sepLine = "| " + headers.map(() => "---").join(" | ") + " |";
  const bodyLines = rows.map(
    (row) => "| " + headers.map((_, i) => encodeTableCell(row[i] ?? "")).join(" | ") + " |",
  );
  return [headerLine, sepLine, ...bodyLines].join("\n");
}

// ── View lookup from DOM ────────────────────────────────────────────

function getEditorView(el: HTMLElement): EditorView | null {
  const editor = el.closest(".cm-editor") as HTMLElement | null;
  if (!editor) return null;
  return EditorView.findFromDOM(editor) ?? null;
}

// ── Table context menu ──────────────────────────────────────────────

function dismissTableMenu() {
  document.querySelector(".cm-table-context-menu")?.remove();
}

interface MenuAction {
  label: string;
  disabled?: boolean;
  separator?: boolean;
  action: () => void;
}

function showTableContextMenu(
  x: number,
  y: number,
  wrapper: HTMLElement,
  cell: HTMLElement,
  view: EditorView,
) {
  dismissTableMenu();

  const range = getTableRange(wrapper);
  if (!range) return;

  const table = wrapper.querySelector("table")!;
  const isHeader = cell.closest("thead") !== null;
  const tr = cell.closest("tr")!;

  // Column index
  const cellsInRow = Array.from(tr.querySelectorAll("th, td"));
  const colIdx = cellsInRow.indexOf(cell);

  // Row index (body only)
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  const rowIdx = bodyRows.indexOf(tr);

  const { headers, rows } = readTableFromDOM(wrapper);

  const rebuild = (h: string[], r: string[][]) => {
    const md = buildTableMarkdown(h, r);
    view.dispatch({ changes: { from: range.from, to: range.to, insert: md } });
  };

  const actions: MenuAction[] = [
    {
      label: t("table.insertRowAbove"),
      disabled: isHeader,
      action: () => {
        rows.splice(Math.max(rowIdx, 0), 0, headers.map(() => ""));
        rebuild(headers, rows);
      },
    },
    {
      label: t("table.insertRowBelow"),
      action: () => {
        const insertAt = isHeader ? 0 : rowIdx + 1;
        rows.splice(insertAt, 0, headers.map(() => ""));
        rebuild(headers, rows);
      },
    },
    { label: "", separator: true, action: () => {} },
    {
      label: t("table.insertColumnLeft"),
      action: () => {
        headers.splice(colIdx, 0, "");
        rows.forEach((row) => row.splice(colIdx, 0, ""));
        rebuild(headers, rows);
      },
    },
    {
      label: t("table.insertColumnRight"),
      action: () => {
        headers.splice(colIdx + 1, 0, "");
        rows.forEach((row) => row.splice(colIdx + 1, 0, ""));
        rebuild(headers, rows);
      },
    },
    { label: "", separator: true, action: () => {} },
    {
      label: t("table.deleteRow"),
      disabled: isHeader || rows.length <= 1,
      action: () => {
        rows.splice(rowIdx, 1);
        rebuild(headers, rows);
      },
    },
    {
      label: t("table.deleteColumn"),
      disabled: headers.length <= 1,
      action: () => {
        headers.splice(colIdx, 1);
        rows.forEach((row) => row.splice(colIdx, 1));
        rebuild(headers, rows);
      },
    },
  ];

  // Build menu DOM
  const menu = document.createElement("div");
  menu.className = "cm-table-context-menu";

  for (const item of actions) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "cm-table-menu-sep";
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.className = "cm-table-menu-item";
    btn.textContent = item.label;
    if (item.disabled) {
      btn.classList.add("cm-table-menu-disabled");
    } else {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissTableMenu();
        item.action();
      });
    }
    menu.appendChild(btn);
  }

  // Position relative to the editor
  const editorRect = view.dom.getBoundingClientRect();
  menu.style.left = `${x - editorRect.left}px`;
  menu.style.top = `${y - editorRect.top}px`;
  view.dom.appendChild(menu);

  // Clamp to viewport
  requestAnimationFrame(() => {
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth - 8) {
      menu.style.left = `${parseInt(menu.style.left) - (menuRect.right - window.innerWidth + 8)}px`;
    }
    if (menuRect.bottom > window.innerHeight - 8) {
      menu.style.top = `${parseInt(menu.style.top) - (menuRect.bottom - window.innerHeight + 8)}px`;
    }
  });

  // Dismiss on click outside or Escape
  const dismiss = (e: Event) => {
    if (!menu.contains(e.target as Node)) {
      dismissTableMenu();
      cleanup();
    }
  };
  const dismissKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      dismissTableMenu();
      cleanup();
    }
  };
  const cleanup = () => {
    document.removeEventListener("mousedown", dismiss, true);
    document.removeEventListener("keydown", dismissKey, true);
  };
  document.addEventListener("mousedown", dismiss, true);
  document.addEventListener("keydown", dismissKey, true);
}

// ── Interactive Table Widget ────────────────────────────────────────

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly tableFrom: number,
    readonly tableTo: number,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return this.source === other.source && this.tableFrom === other.tableFrom && this.tableTo === other.tableTo;
  }

  updateDOM(dom: HTMLElement) {
    const { headers, rows } = readTableFromDOM(dom);
    if (buildTableMarkdown(headers, rows) !== this.source) return false;
    // Cell input already changed this DOM. Keep its focus/selection and update
    // write offsets, including when edits in an earlier table move this one.
    dom.dataset.tableFrom = String(this.tableFrom);
    dom.dataset.tableTo = String(this.tableTo);
    return true;
  }

  toDOM() {
    const parsed = Lexer.lex(this.source).find((token): token is Tokens.Table => token.type === "table");
    if (!parsed) return document.createElement("span");
    const headers = parsed.header.map((cell) => decodeTableCell(cell.text));
    const bodyRows = parsed.rows.map((row) => row.map((cell) => decodeTableCell(cell.text)));
    const numCols = headers.length;

    // Wrapper — contenteditable=false so CM6 ignores this area
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";
    wrapper.setAttribute("contenteditable", "false");

    // Store range for event handlers
    wrapper.dataset.tableFrom = String(this.tableFrom);
    wrapper.dataset.tableTo = String(this.tableTo);

    // The widget owns editable cell DOM; ignoreEvent keeps CodeMirror's text
    // keymap/observer out. Route cell events directly, like the table buttons.
    wrapper.addEventListener("input", (event) => {
      const view = getEditorView(wrapper);
      if (view) handleTableInput(event, view);
    });
    wrapper.addEventListener("keydown", (event) => {
      const view = getEditorView(wrapper);
      if (view && handleTableKeydown(event, view)) event.stopPropagation();
    });

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
    for (const cells of bodyRows) {
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
    if (bodyRows.length === 0) {
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

    // ── Right-click context menu (direct listener — before browser menu) ──
    wrapper.addEventListener("contextmenu", (e) => {
      const target = e.target as HTMLElement;
      const cell = target.closest(".cm-table-cell") as HTMLElement | null;
      if (!cell) return;

      e.preventDefault();
      e.stopPropagation();

      const view = getEditorView(wrapper);
      if (!view) return;

      showTableContextMenu(e.clientX, e.clientY, wrapper, cell, view);
    });

    // ── Add row button (direct listener — fires before CM6) ────────
    const addRowBtn = document.createElement("button");
    addRowBtn.className = "cm-table-add-row";
    addRowBtn.title = t("table.addRowBelow");
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
    addColBtn.title = t("table.addColumnRight");
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
  const loadRemoteImages = state.facet(remoteImagesAllowed);

  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name !== "HorizontalRule" &&
        node.name !== "Table" &&
        node.name !== "Image"
      )
        return;

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

      if (node.name === "Image") {
        if (cursor.from >= node.from && cursor.to <= node.to) return false;

        const urlChildren = node.node.getChildren("URL");
        if (urlChildren.length === 0) return false;
        const src = state.doc.sliceString(
          urlChildren[0].from,
          urlChildren[0].to,
        );
        if (!src) return false;

        // Alt text sits between the first [ and ] markers
        const marks = node.node.getChildren("LinkMark");
        let alt = "";
        if (marks.length >= 2) {
          // marks[0] = "![", marks[1] = "]"
          alt = state.doc.sliceString(marks[0].to, marks[1].from);
        }

        decorations.push(
          Decoration.replace({
            widget: new ImageWidget(src, alt, loadRemoteImages),
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

  update(_decorations, transaction) {
    return RangeSet.of(buildBlockDecorations(transaction.state), true);
  },

  provide(field) {
    return EditorView.decorations.from(field);
  },
});

// ── Event handlers (cell editing + keyboard nav + context menu) ──────

// Cell editing: sync contenteditable changes to document.
function handleTableInput(event: Event, view: EditorView) {
    const target = event.target as HTMLElement;
    const wrapper = target.closest(".cm-table-widget") as HTMLElement | null;
    if (!wrapper) return false;

    const range = getTableRange(wrapper);
    if (!range) return false;

    const { headers, rows } = readTableFromDOM(wrapper);
    const newMarkdown = buildTableMarkdown(headers, rows);

    view.dispatch({
      changes: { from: range.from, to: range.to, insert: newMarkdown },
    });

    return true;
}

// Let the browser handle ordinary editing/composition inside each cell.
function handleTableKeydown(event: KeyboardEvent, view: EditorView) {
    if (event.isComposing || event.keyCode === 229) return false;
    const target = event.target as HTMLElement;
    const wrapper = target.closest(".cm-table-widget") as HTMLElement | null;
    if (!wrapper) return false;

    const table = target.closest("table");
    const cell = target.closest(".cm-table-cell");
    if (!table || !cell) return true;

    // WebKit's nested editing host otherwise selects the entire note. Keep
    // replacement typing/paste scoped to the cell the user is editing.
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(cell);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || (event.shiftKey && event.key !== "Tab")) return false;

    // Exit table: blur cell, place CM6 cursor after the table
    const exitTable = () => {
      (cell as HTMLElement).blur();
      const range = getTableRange(wrapper);
      if (!range) { view.focus(); return; }
      // Place cursor on the line after the table
      const afterPos = Math.min(range.to + 1, view.state.doc.length);
      view.dispatch({ selection: { anchor: afterPos } });
      view.focus();
    };

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
      if (below) {
        focusCell(below);
      } else {
        // Last row — exit table
        exitTable();
      }
      return true;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const below = getAdjacentCell(table, cell, "down");
      if (below) {
        focusCell(below);
      } else {
        exitTable();
      }
      return true;
    }

    if (event.key === "ArrowUp") {
      const above = getAdjacentCell(table, cell, "up");
      if (!above) {
        // First row — exit table, place cursor before
        event.preventDefault();
        (cell as HTMLElement).blur();
        const range = getTableRange(wrapper);
        if (range) {
          const beforePos = Math.max(range.from - 1, 0);
          view.dispatch({ selection: { anchor: beforePos } });
        }
        view.focus();
        return true;
      }
      event.preventDefault();
      focusCell(above);
      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      exitTable();
      return true;
    }

    return false;
}

// ── Ensure editable line after trailing block widget ─────────────────
// Replace decorations consume entire lines including newlines.
// If a Table or Image node reaches the end of the document, there's no
// CM6 line left for the cursor. This listener appends a newline when needed.

const ensureTrailingLine = EditorView.updateListener.of((update) => {
  const { state } = update;
  const docLen = state.doc.length;
  if (docLen === 0) return;

  let needsTrailingLine = false;
  syntaxTree(state).iterate({
    enter(node) {
      if (
        (node.name === "Table" || node.name === "Image") &&
        node.to >= docLen
      ) {
        needsTrailingLine = true;
      }
    },
  });

  if (needsTrailingLine) {
    update.view.dispatch({
      changes: { from: docLen, insert: "\n" },
    });
  }
});

// ── Export ───────────────────────────────────────────────────────────

export const blockWidgetPlugin = [
  blockDecorationField,
  ensureTrailingLine,
];
