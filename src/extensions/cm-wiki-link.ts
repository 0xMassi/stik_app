/**
 * Wiki-link support for CodeMirror: [[slug]] autocomplete + decorations.
 *
 * - Autocomplete triggers on [[
 * - Decorations highlight [[...]] text with a distinct style
 * - Click handler for Cmd+Click or plain click on wiki-links
 */

import {
  ViewPlugin,
  Decoration,
  EditorView,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from "@codemirror/autocomplete";
import { RangeSetBuilder } from "@codemirror/state";

export interface WikiLinkCallbacks {
  onSearch: (query: string) => Promise<{ slug: string; path: string; folder: string }[]>;
  onClick: (slug: string, path: string) => void;
}

/** Regex to find [[...]] in text */
const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g;

/** Build decorations for all [[...]] occurrences in the document */
function buildWikiLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    let match;
    WIKI_LINK_RE.lastIndex = 0;
    while ((match = WIKI_LINK_RE.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to = from + match[0].length;
      builder.add(from, to, Decoration.mark({ class: "cm-wikilink" }));
    }
  }

  return builder.finish();
}

/** ViewPlugin that maintains wiki-link decorations */
export function wikiLinkDecorations() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildWikiLinkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildWikiLinkDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/** Click handler for wiki-links */
export function wikiLinkClickHandler(onClick: WikiLinkCallbacks["onClick"]) {
  return EditorView.domEventHandlers({
    click(event: MouseEvent, view: EditorView) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const line = view.state.doc.lineAt(pos);
      const offset = pos - line.from;
      const text = line.text;

      // Find if click is inside a [[...]]
      WIKI_LINK_RE.lastIndex = 0;
      let match;
      while ((match = WIKI_LINK_RE.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (offset >= start && offset < end) {
          const slug = match[1];
          // We need to resolve the path from slug — the onClick callback handles this
          onClick(slug, "");
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
  });
}

/** Autocomplete source for wiki-links: triggers on [[ */
export function wikiLinkCompletionSource(
  onSearch: WikiLinkCallbacks["onSearch"]
) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    // Check if we're inside [[...
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.slice(0, context.pos - line.from);

    // Find the last [[ that isn't closed
    const openIdx = textBefore.lastIndexOf("[[");
    if (openIdx === -1) return null;

    // Make sure there's no ]] between [[ and cursor
    const afterOpen = textBefore.slice(openIdx + 2);
    if (afterOpen.includes("]]")) return null;

    const query = afterOpen;
    const from = line.from + openIdx;

    // Don't trigger until user has typed at least 1 char after [[
    if (query.length < 1) return null;

    try {
      const results = await onSearch(query);
      if (!results.length) return null;

      const options: Completion[] = results.map((r) => ({
        label: r.slug,
        detail: r.folder,
        apply: (view: EditorView, _completion: Completion, fromPos: number, toPos: number) => {
          // Replace from [[ to cursor with [[slug]]
          const replacement = `[[${r.slug}]]`;
          view.dispatch({
            changes: { from: fromPos, to: toPos, insert: replacement },
            selection: { anchor: fromPos + replacement.length },
          });
        },
      }));

      return {
        from,
        to: context.pos,
        options,
        filter: false, // We already filtered server-side
      };
    } catch {
      return null;
    }
  };
}
