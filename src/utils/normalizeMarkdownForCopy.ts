export function normalizeMarkdownForCopy(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function isMarkdownEffectivelyEmpty(markdown: string): boolean {
  return normalizeMarkdownForCopy(markdown).trim().length === 0;
}
