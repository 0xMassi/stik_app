/**
 * Markdown-to-HTML converter for clipboard "Copy as Rich Text".
 *
 * Uses `marked` for proper CommonMark + GFM rendering (nested lists, tables,
 * task lists, strikethrough, autolinks) with custom extensions for Stik-specific
 * syntax: ==highlight== and [[wiki-links]].
 */

import { Marked } from "marked";

// ── Custom extensions ────────────────────────────────────────────

/** ==text== → <mark>text</mark> */
const highlightExtension = {
  name: "highlight",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("==");
  },
  tokenizer(src: string) {
    const match = src.match(/^==([^=]+)==/);
    if (match) {
      return {
        type: "highlight",
        raw: match[0],
        text: match[1],
      };
    }
    return undefined;
  },
  renderer(token: { text: string }) {
    return `<mark>${token.text}</mark>`;
  },
};

/** [[slug]] → plain text (strip brackets for clipboard) */
const wikiLinkExtension = {
  name: "wikiLink",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("[[");
  },
  tokenizer(src: string) {
    const match = src.match(/^\[\[([^\]]+)\]\]/);
    if (match) {
      return {
        type: "wikiLink",
        raw: match[0],
        text: match[1],
      };
    }
    return undefined;
  },
  renderer(token: { text: string }) {
    return token.text;
  },
};

// ── Configured marked instance ───────────────────────────────────

const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [highlightExtension, wikiLinkExtension],
});

// ── Exports ──────────────────────────────────────────────────────

export function markdownToHtml(md: string): string {
  const result = marked.parse(md);
  // marked.parse() is synchronous when no async extensions are used
  return result as string;
}

/**
 * Strip markdown syntax, returning clean plain text for clipboard.
 * Used as text/plain content for "Copy as Rich Text" so pasting into
 * plain text contexts (chat, terminal) gives readable text without markers.
 */
export function markdownToPlainText(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    let text = line;

    // Heading markers
    text = text.replace(/^#{1,6}\s+/, "");

    // Blockquote markers
    text = text.replace(/^>\s?/, "");

    // Task list markers -> checkbox symbols
    text = text.replace(/^(\s*)[-*+]\s+\[x\]\s*/i, "$1\u2611 ");
    text = text.replace(/^(\s*)[-*+]\s+\[ \]\s*/, "$1\u2610 ");

    // Bullet markers -> bullet symbol
    text = text.replace(/^(\s*)[-*+]\s+/, "$1\u2022 ");

    // Inline formatting (strip markers, keep content)
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
    text = text.replace(/\*\*(.+?)\*\*/g, "$1");
    text = text.replace(/\*(.+?)\*/g, "$1");
    text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1");
    text = text.replace(/~~(.+?)~~/g, "$1");
    text = text.replace(/==(.+?)==/g, "$1");
    text = text.replace(/`(.+?)`/g, "$1");

    // Links [text](url) -> text
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Wiki-links [[slug]] -> slug
    text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");

    // Empty bold/italic pairs
    text = text.replace(/\*{2,}/g, "");

    result.push(text);
  }

  return result.join("\n").trimEnd();
}
