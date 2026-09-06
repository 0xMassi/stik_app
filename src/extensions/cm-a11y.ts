/**
 * Screen-reader announcements for the editor (VoiceOver / NVDA).
 *
 * CodeMirror applies Backspace/Delete/Enter through its own transactions, so the
 * browser never fires the native input events screen readers use to speak deleted
 * characters or "new line". We read the change out of the transaction and push a
 * short message into CM6's built-in aria-live region (EditorView.announce), which
 * is invisible and silent for sighted users.
 *
 * Selection deletions are already announced by @codemirror/commands, so we only
 * speak caret-level deletions and newline insertions to avoid double announcements.
 */
import {
  EditorState,
  type Extension,
  type Transaction,
} from "@codemirror/state";
import { EditorView, placeholder as cmPlaceholder } from "@codemirror/view";

/** Turn a deleted/inserted run into something a screen reader can speak aloud. */
function speak(text: string): string {
  if (text === "\n") return "new line";
  if (text === " ") return "space";
  if (text === "\t") return "tab";
  return text.replace(/\n/g, " new line ").trim() || "blank";
}

/**
 * The message to announce for a transaction, or null to stay silent.
 * Exported for unit testing — pure, needs no DOM or EditorView.
 */
export function describeEdit(tr: Transaction): string | null {
  if (!tr.docChanged) return null;

  // Caret deletion. Non-empty selections (including cut) are already announced
  // by @codemirror/commands, so skip them to avoid speaking the same edit twice.
  if (tr.isUserEvent("delete")) {
    if (!tr.startState.selection.main.empty) return null;
    let removed = "";
    tr.changes.iterChanges((fromA, toA) => {
      if (toA > fromA) removed += tr.startState.doc.sliceString(fromA, toA);
    });
    return removed ? `deleted ${speak(removed)}` : null;
  }

  // Newline insertion (Enter).
  if (tr.isUserEvent("input")) {
    let inserted = "";
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, ins) => {
      inserted += ins.toString();
    });
    if (inserted === "\n") return "new line";
  }

  return null;
}

/** Appends an aria-live announcement to delete/newline transactions. */
const announceEdits = EditorState.transactionExtender.of((tr) => {
  const message = describeEdit(tr);
  return message ? { effects: EditorView.announce.of(message) } : null;
});

/**
 * Accessible placeholder + edit announcements for the editor.
 *
 * The placeholder is handed to CM6 as an element rather than a string: that makes
 * CM6 mark it aria-hidden AND skip the aria-placeholder attribute, so VoiceOver no
 * longer re-reads it on every pause. The field instead gets a stable accessible
 * name via aria-label, announced once when focus enters.
 */
export function accessibleEditor(
  placeholderText: string,
  accessibleName: string = placeholderText,
): Extension {
  const placeholderEl = document.createElement("span");
  placeholderEl.textContent = placeholderText;
  return [
    cmPlaceholder(placeholderEl),
    // Kept separate from the visible text: Zen mode draws no placeholder but
    // the field still has to announce itself to a screen reader.
    EditorView.contentAttributes.of({ "aria-label": accessibleName }),
    announceEdits,
  ];
}
