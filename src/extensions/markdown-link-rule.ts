/**
 * Input rule that converts typed [text](url) into a proper link.
 *
 * TipTap's Link extension handles pasted URLs and autolinks, but doesn't
 * convert markdown link syntax typed inline. This extension fills that gap.
 */

import { Extension } from "@tiptap/core";
import { InputRule } from "@tiptap/core";

/** Prepend https:// if the URL has no protocol */
export function normalizeUrl(url: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return url; // already has protocol
  return `https://${url}`;
}

export const MarkdownLinkRule = Extension.create({
  name: "markdownLinkRule",

  addInputRules() {
    const linkType = this.editor.schema.marks.link;
    if (!linkType) return [];

    return [
      new InputRule({
        // Match [text](url) at end of input — url must not contain spaces
        find: /\[([^\]]+)\]\(([^)\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, text, rawUrl] = match;
          if (!text || !rawUrl) return null;

          const href = normalizeUrl(rawUrl);
          const { tr } = state;
          const mark = linkType.create({ href });
          tr.replaceWith(range.from, range.to, state.schema.text(text, [mark]));
        },
      }),
    ];
  },
});
