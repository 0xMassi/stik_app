const BREAK_PLACEHOLDER_RE = /<br\s*\/?>/gi;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const AUTOLINK_RE = /<((?:https?:\/\/|mailto:|tel:)[^>\s]+)>/g;
const HEADING_PREFIX_RE = /^\s{0,3}#{1,6}\s+/;
const INLINE_MARK_RE = /[*_`~]/g;

export function normalizeNoteTitle(value: string): string {
  let line = value;
  line = line.replace(BREAK_PLACEHOLDER_RE, " ");
  line = line.replace(HEADING_PREFIX_RE, "");
  line = line.replace(MARKDOWN_IMAGE_RE, (_match, alt: string, url: string) =>
    (alt || url || "").trim()
  );
  line = line.replace(MARKDOWN_LINK_RE, "$1");
  line = line.replace(AUTOLINK_RE, "$1");
  line = line.replace(INLINE_MARK_RE, "");
  return line.replace(/\s+/g, " ").trim();
}

export function extractNoteTitle(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const normalized = normalizeNoteTitle(line);
    if (normalized.length > 0) {
      return normalized.slice(0, 120);
    }
  }
  return "Untitled";
}

export function normalizeNoteSnippet(value: string): string {
  let snippet = value;
  snippet = snippet.replace(BREAK_PLACEHOLDER_RE, " ");
  snippet = snippet.replace(MARKDOWN_IMAGE_RE, (_match, alt: string, url: string) =>
    (alt || url || "").trim()
  );
  snippet = snippet.replace(MARKDOWN_LINK_RE, "$1");
  snippet = snippet.replace(AUTOLINK_RE, "$1");
  return snippet.replace(/\s+/g, " ").trim();
}
