/**
 * Interactive task list checkboxes and bullet rendering for CodeMirror.
 *
 * - Replaces bullet markers (-, *, +) with rendered bullet points
 * - Replaces - [ ] / - [x] in task items with styled checkbox widgets
 * - Clicking checkboxes toggles the character in the document
 * - Checked tasks get a line-level class for strikethrough styling
 * - Cursor-aware: shows raw markdown when cursor is on the line
 * - Viewport-scoped: only processes visible lines for performance
 */

import {
  ViewPlugin,
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Range } from "@codemirror/state";

const TASK_RE = /^(\s*)([-*+]) \[([ xX])\]/;
const BULLET_RE = /^(\s*)([-*+]) /;

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = `cm-task-checkbox${this.checked ? " cm-task-checkbox-checked" : ""}`;
    span.setAttribute("aria-label", this.checked ? "Completed task" : "Incomplete task");
    span.setAttribute("role", "checkbox");
    span.setAttribute("aria-checked", String(this.checked));
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-bullet";
    span.textContent = "\u2022";
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

// Reuse widget instances to avoid unnecessary DOM updates
const bulletWidget = new BulletWidget();
const uncheckedWidget = new CheckboxWidget(false);
const checkedWidget = new CheckboxWidget(true);

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const doc = view.state.doc;
  const { selection } = view.state;

  for (const { from, to } of view.visibleRanges) {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;

    for (let i = startLine; i <= endLine; i++) {
      const line = doc.line(i);

      // When cursor is on this line, show raw markdown for editing
      const cursorOnLine = selection.ranges.some(
        (r) => r.head >= line.from && r.head <= line.to,
      );
      if (cursorOnLine) continue;

      const taskMatch = TASK_RE.exec(line.text);
      if (taskMatch) {
        const isChecked = taskMatch[3] !== " ";

        if (isChecked) {
          decos.push(Decoration.line({ class: "cm-task-checked" }).range(line.from));
        }

        // Replace "- [x]" with checkbox widget (preserving leading indentation)
        const markerPos = line.from + taskMatch[1].length;
        const endPos = line.from + taskMatch[0].length;
        decos.push(
          Decoration.replace({
            widget: isChecked ? checkedWidget : uncheckedWidget,
          }).range(markerPos, endPos),
        );
        continue;
      }

      const bulletMatch = BULLET_RE.exec(line.text);
      if (bulletMatch) {
        // Replace "-" / "*" / "+" marker with bullet point
        const markerPos = line.from + bulletMatch[1].length;
        decos.push(
          Decoration.replace({ widget: bulletWidget }).range(markerPos, markerPos + 1),
        );
      }
    }
  }

  return Decoration.set(decos, true);
}

/** ViewPlugin that renders checkbox and bullet widgets */
export const taskCheckboxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Click handler — toggles [ ] <-> [x] when a checkbox widget is clicked */
export const taskCheckboxHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("cm-task-checkbox")) {
      return false;
    }

    event.preventDefault();

    const pos = view.posAtDOM(target);
    const line = view.state.doc.lineAt(pos);
    const match = TASK_RE.exec(line.text);
    if (!match) return false;

    // Check char position: indentation + marker + " [" = +3 from marker start
    const checkCharPos = line.from + match[1].length + 3;
    const isChecked = match[3] !== " ";

    view.dispatch({
      changes: { from: checkCharPos, to: checkCharPos + 1, insert: isChecked ? " " : "x" },
    });

    return true;
  },
});
