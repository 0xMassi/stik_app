/**
 * Cursor-range overlap detection for live preview decorations.
 * Shared by marker hiding and task toggle plugins.
 *
 * Pattern from SilverBullet's isCursorInRange / Zettlr's rangeInSelection.
 */

import type { EditorSelection } from "@codemirror/state";

/**
 * Returns true if any selection range overlaps [rangeFrom, rangeTo].
 * With includeAdjacent=true (default), cursor touching a boundary counts —
 * this means markers are revealed when cursor is right next to them.
 */
export function rangeInSelection(
  selection: EditorSelection,
  rangeFrom: number,
  rangeTo: number,
  includeAdjacent = true,
): boolean {
  return selection.ranges.some((range) =>
    includeAdjacent
      ? range.to >= rangeFrom && range.from <= rangeTo
      : range.to > rangeFrom && range.from < rangeTo,
  );
}
