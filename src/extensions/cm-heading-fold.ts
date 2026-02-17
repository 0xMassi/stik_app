/**
 * Heading fold/collapse for CodeMirror 6.
 *
 * Uses CM6's built-in fold infrastructure (foldService + codeFolding) for
 * the actual fold mechanics, with a custom inline chevron widget for the UI.
 * Gutters are globally hidden (cm-theme.ts:53), so we render the chevron as
 * an inline widget with absolute CSS positioning to avoid text shift.
 *
 * Fold range: from end of heading line to just before next heading of
 * same-or-higher level (or EOF). Detected via line-by-line regex — the
 * lezer markdown tree has no "section" nodes.
 */

import {
  ViewPlugin,
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Range, EditorState } from "@codemirror/state";
import {
  foldService,
  codeFolding,
  foldEffect,
  unfoldEffect,
  foldedRanges,
} from "@codemirror/language";

// ── Heading detection ───────────────────────────────────────────────

const headingRe = /^(#{1,3})\s/;

function headingLevel(lineText: string): number {
  const m = headingRe.exec(lineText);
  return m ? m[1].length : 0;
}

// ── Fold range provider ─────────────────────────────────────────────

/**
 * Compute fold range for a heading line.
 * Returns { from: endOfHeadingLine, to: endOfSection } or null.
 */
function headingFoldRange(
  state: EditorState,
  lineStart: number,
) {
  const line = state.doc.lineAt(lineStart);
  const level = headingLevel(line.text);
  if (!level) return null;

  const foldFrom = line.to;
  let foldTo = state.doc.line(state.doc.lines).to; // default: EOF

  for (let i = line.number + 1; i <= state.doc.lines; i++) {
    const next = state.doc.line(i);
    const nextLevel = headingLevel(next.text);
    if (nextLevel && nextLevel <= level) {
      // Fold up to end of previous line (exclude trailing newline before next heading)
      foldTo = state.doc.line(i - 1).to;
      break;
    }
  }

  // Nothing to fold
  if (foldFrom >= foldTo) return null;

  return { from: foldFrom, to: foldTo };
}

const headingFoldService = foldService.of((state, lineStart, _lineEnd) =>
  headingFoldRange(state, lineStart),
);

// ── Fold placeholder ────────────────────────────────────────────────

const foldConfig = codeFolding({
  placeholderDOM(_view, onclick) {
    const el = document.createElement("span");
    el.className = "cm-heading-fold-placeholder";
    el.textContent = "...";
    el.title = "Unfold";
    el.setAttribute("aria-label", "Folded content. Click to unfold.");
    el.addEventListener("click", onclick);
    return el;
  },
});

// ── Chevron widget ──────────────────────────────────────────────────

class ChevronWidget extends WidgetType {
  constructor(readonly folded: boolean) {
    super();
  }

  eq(other: ChevronWidget) {
    return this.folded === other.folded;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-heading-chevron";
    if (this.folded) span.classList.add("cm-heading-chevron-folded");
    span.setAttribute("aria-label", this.folded ? "Unfold section" : "Fold section");
    span.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1.5L7 5L3 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

// ── View plugin: chevron decorations ────────────────────────────────

const chevronPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)),
        )
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const ranges: Range<Decoration>[] = [];
      const folded = foldedRanges(view.state);

      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const level = headingLevel(line.text);

          if (level) {
            const range = headingFoldRange(view.state, line.from);
            if (range) {
              // Check if this heading's range is currently folded
              let isFolded = false;
              folded.between(range.from, range.from + 1, () => {
                isFolded = true;
              });

              ranges.push(
                Decoration.line({ class: "cm-heading-line" }).range(line.from),
              );
              ranges.push(
                Decoration.widget({
                  widget: new ChevronWidget(isFolded),
                  side: -1,
                }).range(line.from),
              );
            }
          }

          pos = line.to + 1;
        }
      }

      return Decoration.set(ranges, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// ── Click handler ───────────────────────────────────────────────────

const chevronClickHandler = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    const target = event.target as HTMLElement;
    const chevron = target.closest(".cm-heading-chevron");
    if (!chevron) return false;

    event.preventDefault();
    event.stopPropagation();

    // Find the heading line this chevron belongs to
    const lineBlock = view.lineBlockAtHeight(
      chevron.getBoundingClientRect().top - view.documentTop + view.defaultLineHeight / 2,
    );
    const range = headingFoldRange(view.state, lineBlock.from);
    if (!range) return true;

    const folded = foldedRanges(view.state);
    let isFolded = false;
    folded.between(range.from, range.from + 1, () => {
      isFolded = true;
    });

    if (isFolded) {
      // Unfold: find the exact folded range to remove
      folded.between(range.from, range.from + 1, (from, to) => {
        view.dispatch({ effects: unfoldEffect.of({ from, to }) });
      });
    } else {
      view.dispatch({ effects: foldEffect.of(range) });
    }

    return true;
  },
});

// ── Theme ───────────────────────────────────────────────────────────

const headingFoldTheme = EditorView.theme({
  ".cm-heading-line": {
    position: "relative",
  },
  ".cm-heading-chevron": {
    position: "absolute",
    left: "-15px",
    top: "50%",
    transform: "translateY(-50%) rotate(90deg)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "14px",
    height: "14px",
    cursor: "pointer",
    opacity: "0",
    color: "rgb(var(--color-stone))",
    transition: "opacity 0.15s, transform 0.15s, color 0.15s",
    borderRadius: "3px",
  },
  ".cm-heading-chevron:hover": {
    backgroundColor: "rgba(var(--color-ink), 0.06)",
  },
  ".cm-heading-line:hover .cm-heading-chevron": {
    opacity: "1",
  },
  // Folded: always visible, coral, no rotation (points right)
  ".cm-heading-chevron-folded": {
    opacity: "1",
    color: "rgb(var(--color-coral))",
    transform: "translateY(-50%) rotate(0deg)",
  },
  // Fold placeholder pill
  ".cm-heading-fold-placeholder": {
    display: "inline-block",
    padding: "0 6px",
    margin: "0 2px",
    fontSize: "0.8em",
    color: "rgb(var(--color-stone))",
    backgroundColor: "rgba(var(--color-ink), 0.05)",
    borderRadius: "4px",
    cursor: "pointer",
    verticalAlign: "middle",
    transition: "background-color 0.15s",
  },
  ".cm-heading-fold-placeholder:hover": {
    backgroundColor: "rgba(var(--color-ink), 0.1)",
  },
});

// ── Export ───────────────────────────────────────────────────────────

export const headingFoldPlugin = [
  headingFoldService,
  foldConfig,
  chevronPlugin,
  chevronClickHandler,
  headingFoldTheme,
];
