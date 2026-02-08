/**
 * Highlight extension for Stik — renders ==text== as <mark>.
 *
 * Extends @tiptap/extension-highlight with tiptap-markdown roundtrip:
 * - Serialize: wraps marked text in ==...==
 * - Parse: registers markdown-it-mark plugin so ==text== → <mark>
 */

import Highlight from "@tiptap/extension-highlight";
import markdownItMark from "markdown-it-mark";

export const StikHighlight = Highlight.extend({
  // Don't spread the mark when typing at its boundary or splitting the block
  inclusive: false,

  addStorage() {
    return {
      markdown: {
        serialize: { open: "==", close: "==" },
        parse: {
          setup(md: any) {
            md.use(markdownItMark);
          },
        },
      },
    };
  },
});
