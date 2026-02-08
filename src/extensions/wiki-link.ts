/**
 * Wiki-Link extension for Stik — [[slug]] inline note references.
 *
 * Atom node rendered as clickable span. Markdown stored as literal [[slug]].
 * Autocomplete via @tiptap/suggestion triggered by [[.
 * Custom markdown-it inline rule for parse roundtrip.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";

export interface WikiLinkOptions {
  suggestion: Partial<SuggestionOptions<WikiLinkItem>>;
  onLinkClick?: (slug: string, path: string) => void;
}

export interface WikiLinkItem {
  slug: string;
  path: string;
  folder: string;
  snippet: string;
}

/** Strip timestamp prefix and UUID suffix from filename → human-readable slug */
export function filenameToSlug(filename: string): string {
  // Remove .md extension
  let slug = filename.replace(/\.md$/, "");
  // Remove timestamp prefix like "20250115-143022-"
  slug = slug.replace(/^\d{8}-\d{6}-/, "");
  // Remove trailing UUID-like suffix like "-a1b2c3d4" (8+ hex chars at end)
  slug = slug.replace(/-[0-9a-f]{4,}$/, "");
  return slug;
}

export const WikiLinkPluginKey = new PluginKey("wikiLink");

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      suggestion: {
        char: "[[",
        pluginKey: WikiLinkPluginKey,
        allowSpaces: true,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: this.name, attrs: { slug: props.slug, path: props.path } },
              { type: "text", text: " " },
            ])
            .run();
        },
      },
      onLinkClick: undefined,
    };
  },

  addAttributes() {
    return {
      slug: { default: null },
      path: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (el) => ({
          slug: (el as HTMLElement).getAttribute("data-slug"),
          path: (el as HTMLElement).getAttribute("data-path"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "",
        "data-slug": HTMLAttributes.slug,
        "data-path": HTMLAttributes.path || "",
        class: "wiki-link",
      }),
      `[[${HTMLAttributes.slug}]]`,
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement("span");
      dom.className = "wiki-link";
      dom.setAttribute("data-wiki-link", "");
      dom.textContent = `[[${node.attrs.slug}]]`;

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ext = editor.extensionManager.extensions.find(
          (e) => e.name === "wikiLink"
        );
        ext?.options?.onLinkClick?.(node.attrs.slug, node.attrs.path);
      });

      return { dom };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[[${node.attrs.slug}]]`);
        },
        parse: {
          setup(md: any) {
            // Inline rule: detect [[...]] and emit wikiLink token
            md.inline.ruler.after("link", "wiki_link", wikiLinkRule);
            // Renderer: output HTML that parseHTML can pick up
            md.renderer.rules.wiki_link = wikiLinkRenderer;
          },
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

/**
 * markdown-it inline rule: matches [[slug]] and creates a wiki_link token.
 */
function wikiLinkRule(state: any, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;

  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) {
    return false; // not [[
  }

  const closeIdx = src.indexOf("]]", pos + 2);
  if (closeIdx === -1) return false;

  const slug = src.slice(pos + 2, closeIdx);
  if (!slug || slug.includes("\n")) return false;

  if (!silent) {
    const token = state.push("wiki_link", "", 0);
    token.content = slug;
    token.markup = "[[]]";
  }

  state.pos = closeIdx + 2;
  return true;
}

/**
 * markdown-it renderer for wiki_link tokens.
 * Outputs HTML that the WikiLink node's parseHTML can match.
 */
function wikiLinkRenderer(tokens: any[], idx: number): string {
  const slug = tokens[idx].content;
  return `<span data-wiki-link data-slug="${slug}">[[${slug}]]</span>`;
}
