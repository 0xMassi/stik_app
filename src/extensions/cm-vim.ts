/**
 * Vim mode wrapper for CodeMirror using @replit/codemirror-vim.
 * Exposes mode change callbacks and :wq/:q! command hooks.
 */

import { vim, Vim, getCM } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";

export type VimMode = "normal" | "insert" | "visual" | "visual-line" | "command";

export const vimCompartment = new Compartment();

/** Create the vim extension */
export function createVimExtension() {
  return vim({
    status: true,
  });
}

/** Set up vim mode change listener on an EditorView */
export function setupVimModeListener(
  view: EditorView,
  onModeChange: (mode: VimMode) => void,
) {
  const cm = getCM(view);
  if (!cm) return;

  cm.on("vim-mode-change", (event: { mode: string; subMode?: string }) => {
    let mode: VimMode;
    switch (event.mode) {
      case "normal":
        mode = "normal";
        break;
      case "insert":
        mode = "insert";
        break;
      case "visual":
        mode = event.subMode === "linewise" ? "visual-line" : "visual";
        break;
      default:
        mode = "normal";
    }
    onModeChange(mode);
  });
}

/** Register :wq, :x, :q! commands */
export function registerVimCommands(callbacks: {
  onSaveAndClose: () => void;
  onCloseWithoutSaving: () => void;
  onCommandMode: () => void;
}) {
  // :wq — save and close
  Vim.defineEx("wq", "wq", () => {
    callbacks.onSaveAndClose();
  });

  // :x — same as :wq
  Vim.defineEx("x", "x", () => {
    callbacks.onSaveAndClose();
  });

  // :q! — close without saving
  Vim.defineEx("q!", "q!", () => {
    callbacks.onCloseWithoutSaving();
  });

  // :q — close (same as :q! for simplicity, since we auto-save)
  Vim.defineEx("q", "q", () => {
    callbacks.onCloseWithoutSaving();
  });
}

const VIM_ARROW_KEYMAP: Record<string, string> = {
  ArrowLeft: "<Left>",
  ArrowRight: "<Right>",
  ArrowUp: "<Up>",
  ArrowDown: "<Down>",
};

/**
 * Defensive shim: ensure arrow keys are routed through Vim while in visual mode.
 * Returns true when the key was handled by Vim.
 */
export function handleVimArrowInVisualMode(
  view: EditorView,
  key: string
): boolean {
  const vimKey = VIM_ARROW_KEYMAP[key];
  if (!vimKey) return false;

  const cm = getCM(view);
  if (!cm) return false;
  if (!cm.state.vim?.visualMode) return false;

  return Boolean(Vim.handleKey(cm, vimKey, "user"));
}

/** Programmatically set vim mode on an EditorView */
export function setVimModeOnView(view: EditorView, mode: VimMode): void {
  const cm = getCM(view);
  if (!cm) return;

  switch (mode) {
    case "normal":
      // Pressing Escape transitions to normal mode
      Vim.handleKey(cm, "<Esc>", "mapping");
      break;
    case "insert":
      Vim.handleKey(cm, "i", "mapping");
      break;
  }
}
