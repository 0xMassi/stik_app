/**
 * RTL / bidirectional text support for CodeMirror 6.
 *
 * Three modes:
 *   "ltr"  — No-op (LTR is CM6's default).
 *   "rtl"  — Forces the entire editor to RTL via contentAttributes.
 *   "auto" — Per-line auto-detection for mixed-direction content (e.g.
 *            Arabic paragraphs interleaved with English). Enables CM6's
 *            built-in per-line text direction and adds a ViewPlugin that
 *            applies `dir="auto"` line decorations to every visible line,
 *            letting the browser's Unicode Bidi Algorithm choose direction
 *            based on the first strong character in each line.
 *
 * The "auto" approach follows Marijn Haverbeke's recommendation on the
 * CM6 discuss forum and the pattern used by Joplin's CM6 editor.
 *
 * @see https://discuss.codemirror.net/t/bidirectional-text/4176
 * @see https://github.com/laurent22/joplin/blob/dev/packages/editor/CodeMirror/utils/useLineSorting.ts
 */

import {
  ViewPlugin,
  Decoration,
  EditorView,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Extension, Range } from "@codemirror/state";

// Reusable line decoration — `dir="auto"` delegates direction to the browser's
// Unicode Bidi Algorithm, which inspects the first strong directional character.
const dirAutoLine = Decoration.line({ attributes: { dir: "auto" } });

/**
 * ViewPlugin that applies `dir="auto"` to every visible line.
 * Rebuilds on document changes or viewport scrolls so new/modified lines
 * always get the attribute.
 */
const autoDirectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Walk visible ranges and tag every line with `dir="auto"`. */
function buildLineDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      ranges.push(dirAutoLine.range(line.from));
      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

/**
 * Create a CM6 extension for bidirectional text support.
 *
 * @param direction - "auto" for per-line detection, "rtl" to force RTL,
 *                    "ltr" for no-op (default CM6 behavior).
 */
export function bidiSupport(direction: "auto" | "ltr" | "rtl"): Extension {
  switch (direction) {
    case "rtl":
      return EditorView.contentAttributes.of({ dir: "rtl" });

    case "auto":
      return [
        EditorView.perLineTextDirection.of(true),
        autoDirectionPlugin,
      ];

    case "ltr":
    default:
      return [];
  }
}
