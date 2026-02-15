/**
 * Custom markdown parser extension for ==highlight== syntax.
 * The @lezer/markdown parser doesn't include this by default.
 * Modeled after the built-in Strikethrough extension (~~text~~).
 */

import { Tag, tags } from "@lezer/highlight";

/** Custom tag for ==highlight== — referenced in cm-theme.ts */
export const highlightTag = Tag.define();

const Punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };

/**
 * Pass to markdown({ extensions: [highlightExtension] }) to enable
 * ==highlighted text== parsing with syntax highlighting.
 */
export const highlightExtension = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": highlightTag } },
    { name: "HighlightMark", style: tags.processingInstruction },
  ],
  parseInline: [{
    name: "Highlight",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse(cx: any, next: number, pos: number) {
      // = is char code 61; require exactly two = (not three+)
      if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;

      const before = cx.slice(pos - 1, pos);
      const after = cx.slice(pos + 2, pos + 3);
      const sBefore = /\s|^$/.test(before);
      const sAfter = /\s|^$/.test(after);
      const pBefore = Punctuation.test(before);
      const pAfter = Punctuation.test(after);

      return cx.addDelimiter(
        HighlightDelim, pos, pos + 2,
        !sAfter && (!pAfter || sBefore || pBefore),
        !sBefore && (!pBefore || sAfter || pAfter),
      );
    },
    after: "Emphasis",
  }],
};
