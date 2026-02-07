/**
 * Tiptap Vim Mode Extension for Stik.
 *
 * Uses ProseMirror plugin with handleKeyDown (not handleDOMEvents) for reliable
 * key interception — returning true from handleKeyDown fully prevents text insertion.
 * handleTextInput as secondary safeguard.
 *
 * State lives in editor.storage.vimMode (mutable, avoids unnecessary transactions).
 * Block cursor rendered via ProseMirror DecorationSet (inline decoration on the
 * character under cursor, widget at end-of-line).
 *
 * Caret visibility is controlled by the cursor PluginView (not CSS classes) so that
 * native caret hide/show and block decoration add/remove happen in the same render pass.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import {
  moveLeft, moveRight, moveUp, moveDown,
  moveWordForward, moveWordBackward,
  moveToLineStart, moveToLineEnd,
  moveToDocStart, moveToDocEnd,
  deleteChar, deleteLine, yankLine, pasteAfter,
  changeWord, changeLine, changeToEnd,
  changeInnerWord, deleteInnerWord,
  changeInsidePair, deleteInsidePair,
  insertAfterCursor, insertAtLineEnd,
  openLineBelow, openLineAbove,
} from "./vim-commands";
import type { Editor } from "@tiptap/core";

export type VimMode = "normal" | "insert" | "command" | "visual" | "visual-line";

interface VimStorage {
  mode: VimMode;
  keyBuffer: string;
  bufferTimeout: ReturnType<typeof setTimeout> | null;
  yankRegister: { value: string };
  lastCommand: (() => boolean) | null;
  visualAnchorPos: number | null;
  visualLineAnchor: { from: number; to: number } | null;
}

const VIM_PLUGIN_KEY = new PluginKey("vimMode");
const CURSOR_PLUGIN_KEY = new PluginKey("vimCursor");
const BUFFER_TIMEOUT_MS = 500;

const BUFFERED_PREFIXES = new Set(["d", "y", "c", "g", "ci", "di"]);

type CommandEntry = {
  fn: (editor: Editor, storage: VimStorage) => boolean;
  toInsert?: boolean;
};

function buildCommandMap(): Record<string, CommandEntry> {
  return {
    h: { fn: (e) => moveLeft(e) },
    l: { fn: (e) => moveRight(e) },
    j: { fn: (e) => moveDown(e) },
    k: { fn: (e) => moveUp(e) },
    w: { fn: (e) => moveWordForward(e) },
    b: { fn: (e) => moveWordBackward(e) },
    "0": { fn: (e) => moveToLineStart(e) },
    $: { fn: (e) => moveToLineEnd(e) },
    gg: { fn: (e) => moveToDocStart(e) },
    G: { fn: (e) => moveToDocEnd(e) },

    x: { fn: (e) => deleteChar(e) },
    dd: { fn: (e, s) => deleteLine(e, s.yankRegister) },
    yy: { fn: (e, s) => yankLine(e, s.yankRegister) },
    p: { fn: (e, s) => pasteAfter(e, s.yankRegister) },
    u: { fn: (e) => { e.commands.undo(); return true; } },

    cw: { fn: (e) => changeWord(e), toInsert: true },
    ciw: { fn: (e) => changeInnerWord(e), toInsert: true },
    'ci"': { fn: (e) => changeInsidePair(e, '"', '"'), toInsert: true },
    "ci'": { fn: (e) => changeInsidePair(e, "'", "'"), toInsert: true },
    "ci(": { fn: (e) => changeInsidePair(e, "(", ")"), toInsert: true },
    "ci{": { fn: (e) => changeInsidePair(e, "{", "}"), toInsert: true },
    cc: { fn: (e, s) => changeLine(e, s.yankRegister), toInsert: true },
    C: { fn: (e) => changeToEnd(e), toInsert: true },

    diw: { fn: (e) => deleteInnerWord(e) },
    'di"': { fn: (e) => deleteInsidePair(e, '"', '"') },
    "di'": { fn: (e) => deleteInsidePair(e, "'", "'") },
    "di(": { fn: (e) => deleteInsidePair(e, "(", ")") },
    "di{": { fn: (e) => deleteInsidePair(e, "{", "}") },

    i: { fn: () => true, toInsert: true },
    a: { fn: (e) => insertAfterCursor(e), toInsert: true },
    A: { fn: (e) => insertAtLineEnd(e), toInsert: true },
    o: { fn: (e) => openLineBelow(e), toInsert: true },
    O: { fn: (e) => openLineAbove(e), toInsert: true },
  };
}

const COMMAND_MAP = buildCommandMap();

const MOVEMENT_KEYS = new Set(["h", "l", "j", "k", "w", "b", "0", "$", "gg", "G"]);

function clearBuffer(storage: VimStorage) {
  storage.keyBuffer = "";
  if (storage.bufferTimeout) {
    clearTimeout(storage.bufferTimeout);
    storage.bufferTimeout = null;
  }
}

function setMode(
  storage: VimStorage,
  mode: VimMode,
  editor: Editor,
  onModeChange?: (mode: VimMode) => void,
) {
  storage.mode = mode;
  onModeChange?.(mode);
  // Dispatch so the cursor plugin re-evaluates decorations AND caret-color
  // in the same render pass. setMeta ensures it isn't treated as a no-op.
  editor.view.dispatch(editor.state.tr.setMeta(CURSOR_PLUGIN_KEY, mode));
}

// --- Visual Mode ---

function enterVisualMode(
  storage: VimStorage,
  mode: "visual" | "visual-line",
  editor: Editor,
  onModeChange?: (mode: VimMode) => void,
) {
  const { $head } = editor.state.selection;

  if (mode === "visual") {
    storage.visualAnchorPos = $head.pos;
    storage.visualLineAnchor = null;
  } else {
    storage.visualAnchorPos = null;
    storage.visualLineAnchor = { from: $head.start(), to: $head.end() };
    // Select the full line
    const tr = editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, $head.start(), $head.end()),
    );
    editor.view.dispatch(tr);
  }

  setMode(storage, mode, editor, onModeChange);
}

function exitVisualMode(
  storage: VimStorage,
  editor: Editor,
  onModeChange?: (mode: VimMode) => void,
) {
  storage.visualAnchorPos = null;
  storage.visualLineAnchor = null;
  // Collapse selection to head
  const { $head } = editor.state.selection;
  const tr = editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, $head.pos),
  );
  editor.view.dispatch(tr);
  setMode(storage, "normal", editor, onModeChange);
}

function extendVisualSelection(
  editor: Editor,
  storage: VimStorage,
) {
  const { $head } = editor.state.selection;
  const doc = editor.state.doc;

  if (storage.mode === "visual" && storage.visualAnchorPos != null) {
    const tr = editor.state.tr.setSelection(
      TextSelection.create(doc, storage.visualAnchorPos, $head.pos),
    );
    editor.view.dispatch(tr);
  } else if (storage.mode === "visual-line" && storage.visualLineAnchor) {
    const anchorFrom = storage.visualLineAnchor.from;
    const anchorTo = storage.visualLineAnchor.to;
    const headFrom = $head.start();
    const headTo = $head.end();
    const from = Math.min(anchorFrom, headFrom);
    const to = Math.max(anchorTo, headTo);
    const tr = editor.state.tr.setSelection(
      TextSelection.create(doc, from, to),
    );
    editor.view.dispatch(tr);
  }
}

function getVisualRange(
  editor: Editor,
  storage: VimStorage,
): { from: number; to: number } {
  const { $head, $anchor } = editor.state.selection;

  if (storage.mode === "visual-line" && storage.visualLineAnchor) {
    const anchorFrom = storage.visualLineAnchor.from;
    const anchorTo = storage.visualLineAnchor.to;
    const headFrom = $head.start();
    const headTo = $head.end();
    return { from: Math.min(anchorFrom, headFrom), to: Math.max(anchorTo, headTo) };
  }

  // Character-wise: vim selection is inclusive of both anchor and head
  const from = Math.min($anchor.pos, $head.pos);
  const to = Math.max($anchor.pos, $head.pos) + 1;
  return { from, to: Math.min(to, $head.end()) };
}

function handleVisualKey(
  event: KeyboardEvent,
  editor: Editor,
  storage: VimStorage,
  onModeChange?: (mode: VimMode) => void,
): boolean {
  // Let system shortcuts pass through
  if (event.metaKey || event.altKey || event.ctrlKey) return false;
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return false;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return false;

  const key = event.key;

  // Escape → exit
  if (key === "Escape") {
    exitVisualMode(storage, editor, onModeChange);
    return true;
  }

  // v / V toggling
  if (key === "v") {
    if (storage.mode === "visual") {
      exitVisualMode(storage, editor, onModeChange);
    } else {
      // visual-line → visual: keep anchor at start of anchor line
      const anchor = storage.visualLineAnchor;
      storage.visualLineAnchor = null;
      storage.visualAnchorPos = anchor ? anchor.from : editor.state.selection.$head.pos;
      setMode(storage, "visual", editor, onModeChange);
    }
    return true;
  }
  if (key === "V") {
    if (storage.mode === "visual-line") {
      exitVisualMode(storage, editor, onModeChange);
    } else {
      // visual → visual-line: expand anchor to full line
      const { $head } = editor.state.selection;
      const anchorPos = storage.visualAnchorPos ?? $head.pos;
      const $anchor = editor.state.doc.resolve(anchorPos);
      storage.visualAnchorPos = null;
      storage.visualLineAnchor = { from: $anchor.start(), to: $anchor.end() };
      setMode(storage, "visual-line", editor, onModeChange);
      extendVisualSelection(editor, storage);
    }
    return true;
  }

  // Movement keys
  const movementFn: Record<string, (e: Editor) => boolean> = {
    h: moveLeft, l: moveRight, j: moveDown, k: moveUp,
    w: moveWordForward, b: moveWordBackward,
    "0": moveToLineStart, $: moveToLineEnd,
    G: moveToDocEnd,
  };

  // Handle gg (needs buffer)
  if (key === "g") {
    storage.keyBuffer += "g";
    if (storage.keyBuffer === "gg") {
      clearBuffer(storage);
      moveToDocStart(editor);
      extendVisualSelection(editor, storage);
    }
    return true;
  }

  // Clear any partial buffer (e.g. single "g" followed by non-g)
  if (storage.keyBuffer === "g") {
    clearBuffer(storage);
  }

  if (movementFn[key]) {
    movementFn[key](editor);
    extendVisualSelection(editor, storage);
    return true;
  }

  // Operators: d/x, y, c
  if (key === "d" || key === "x") {
    const range = getVisualRange(editor, storage);
    storage.yankRegister.value = editor.state.doc.textBetween(range.from, range.to, "\n");
    editor.commands.deleteRange(range);
    storage.visualAnchorPos = null;
    storage.visualLineAnchor = null;
    setMode(storage, "normal", editor, onModeChange);
    return true;
  }

  if (key === "y") {
    const range = getVisualRange(editor, storage);
    storage.yankRegister.value = editor.state.doc.textBetween(range.from, range.to, "\n");
    exitVisualMode(storage, editor, onModeChange);
    return true;
  }

  if (key === "c") {
    const range = getVisualRange(editor, storage);
    storage.yankRegister.value = editor.state.doc.textBetween(range.from, range.to, "\n");
    editor.commands.deleteRange(range);
    storage.visualAnchorPos = null;
    storage.visualLineAnchor = null;
    setMode(storage, "insert", editor, onModeChange);
    return true;
  }

  // Consume all other keys
  return true;
}

function handleNormalKey(
  event: KeyboardEvent,
  editor: Editor,
  storage: VimStorage,
  onModeChange?: (mode: VimMode) => void,
): boolean {
  // Ctrl+r → redo
  if (event.ctrlKey && event.key === "r") {
    editor.commands.redo();
    storage.lastCommand = () => { editor.commands.redo(); return true; };
    return true;
  }

  // Let system shortcuts pass through (Cmd+C, Cmd+V, etc.)
  if (event.metaKey || event.altKey) return false;
  if (event.ctrlKey) return false;

  // Ignore bare modifier keys
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return false;

  // Escape in Normal mode — consume (no-op). Window close is via :q/:wq.
  if (event.key === "Escape") return true;

  // `:` opens command bar
  if (event.key === ":") {
    clearBuffer(storage);
    setMode(storage, "command", editor, onModeChange);
    return true;
  }

  // `.` repeat
  if (event.key === ".") {
    storage.lastCommand?.();
    return true;
  }

  // Visual mode entry
  if (event.key === "v") {
    enterVisualMode(storage, "visual", editor, onModeChange);
    return true;
  }
  if (event.key === "V") {
    enterVisualMode(storage, "visual-line", editor, onModeChange);
    return true;
  }

  // Arrows — pass through to ProseMirror's native handling
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return false;

  // Tab, Enter — consume in normal mode
  if (event.key === "Tab" || event.key === "Enter") return true;

  const key = event.key;
  storage.keyBuffer += key;

  // Exact match
  const cmd = COMMAND_MAP[storage.keyBuffer];
  if (cmd) {
    const buffer = storage.keyBuffer;
    clearBuffer(storage);
    cmd.fn(editor, storage);

    if (!cmd.toInsert && !MOVEMENT_KEYS.has(buffer)) {
      storage.lastCommand = () => cmd.fn(editor, storage);
    }
    if (cmd.toInsert) {
      if (["cw", "cc", "C"].includes(buffer)) {
        storage.lastCommand = () => { cmd.fn(editor, storage); return true; };
      }
      setMode(storage, "insert", editor, onModeChange);
    }
    return true;
  }

  // Prefix — wait for more keys
  const isPrefix = BUFFERED_PREFIXES.has(storage.keyBuffer) ||
    Object.keys(COMMAND_MAP).some(k => k.startsWith(storage.keyBuffer) && k !== storage.keyBuffer);
  if (isPrefix) {
    if (storage.bufferTimeout) clearTimeout(storage.bufferTimeout);
    storage.bufferTimeout = setTimeout(() => clearBuffer(storage), BUFFER_TIMEOUT_MS);
    return true;
  }

  // Unknown key — consume and clear
  clearBuffer(storage);
  return true;
}

export const VimMode = Extension.create({
  name: "vimMode",
  priority: 200,

  addOptions() {
    return {
      enabled: true,
      onModeChange: undefined as ((mode: VimMode) => void) | undefined,
    };
  },

  addStorage() {
    return {
      mode: "normal" as VimMode,
      keyBuffer: "",
      bufferTimeout: null as ReturnType<typeof setTimeout> | null,
      yankRegister: { value: "" },
      lastCommand: null as (() => boolean) | null,
      visualAnchorPos: null as number | null,
      visualLineAnchor: null as { from: number; to: number } | null,
    } satisfies VimStorage;
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const extensionThis = this;

    const cursorPlugin = new Plugin({
      key: CURSOR_PLUGIN_KEY,

      // PluginView: syncs caret-color on the DOM in the same render pass
      // as decoration updates — no race condition between native caret and block cursor.
      view() {
        return {
          update(view: EditorView) {
            const storage = editor.storage.vimMode as VimStorage | undefined;
            const mode = storage?.mode;
            const hideNativeCaret = mode === "normal" || mode === "visual" || mode === "visual-line";
            view.dom.style.caretColor = hideNativeCaret ? "transparent" : "";
            view.dom.classList.toggle("vim-visual-active", mode === "visual" || mode === "visual-line");
          },
          destroy() {},
        };
      },

      props: {
        decorations(state) {
          const storage = editor.storage.vimMode as VimStorage | undefined;
          if (!storage) return DecorationSet.empty;

          const mode = storage.mode;
          const { $head } = state.selection;
          const pos = $head.pos;
          const endPos = $head.end();

          // Visual modes: selection highlight + block cursor at head
          if (mode === "visual" || mode === "visual-line") {
            const decos: Decoration[] = [];
            const { $anchor } = state.selection;

            // Selection highlight (use resolved anchor/head for correct range)
            const from = Math.min($anchor.pos, $head.pos);
            const to = Math.max($anchor.pos, $head.pos);
            if (to > from) {
              decos.push(Decoration.inline(from, to, { class: "vim-visual-selection" }));
            }

            // Block cursor at head
            if (pos < endPos) {
              decos.push(Decoration.inline(pos, pos + 1, { class: "vim-cursor-block" }));
            } else {
              decos.push(Decoration.widget(pos, () => {
                const span = document.createElement("span");
                span.className = "vim-cursor-eol";
                span.textContent = "\u00A0";
                return span;
              }, { side: 0, key: "vim-cursor-eol" }));
            }

            return DecorationSet.create(state.doc, decos);
          }

          // Normal mode: block cursor only
          if (mode !== "normal") return DecorationSet.empty;

          if (pos < endPos) {
            return DecorationSet.create(state.doc, [
              Decoration.inline(pos, pos + 1, { class: "vim-cursor-block" }),
            ]);
          }

          return DecorationSet.create(state.doc, [
            Decoration.widget(pos, () => {
              const span = document.createElement("span");
              span.className = "vim-cursor-eol";
              span.textContent = "\u00A0";
              return span;
            }, { side: 0, key: "vim-cursor-eol" }),
          ]);
        },
      },
    });

    const mainPlugin = new Plugin({
      key: VIM_PLUGIN_KEY,

      props: {
        handleKeyDown: (_view, event) => {
          const storage = editor.storage.vimMode as VimStorage;

          // Command mode — all keys go to the React command bar input
          if (storage.mode === "command") return false;

          if (storage.mode === "insert") {
            if (event.key === "Escape") {
              clearBuffer(storage);
              setMode(storage, "normal", editor, extensionThis.options.onModeChange);
              return true;
            }
            return false;
          }

          // Visual modes
          if (storage.mode === "visual" || storage.mode === "visual-line") {
            return handleVisualKey(event, editor, storage, extensionThis.options.onModeChange);
          }

          // Normal mode
          return handleNormalKey(event, editor, storage, extensionThis.options.onModeChange);
        },

        handleTextInput: () => {
          const storage = editor.storage.vimMode as VimStorage;
          return storage.mode !== "insert" && storage.mode !== "command";
        },
      },
    });

    return [mainPlugin, cursorPlugin];
  },

  onCreate() {
    // Set initial caret-color (PluginView.update runs after first transaction, not on create)
    this.editor.view.dom.style.caretColor = "transparent";
    this.options.onModeChange?.("normal");
  },

  onDestroy() {
    const storage = this.storage as VimStorage;
    clearBuffer(storage);
    this.editor.view.dom.style.caretColor = "";
  },
});
