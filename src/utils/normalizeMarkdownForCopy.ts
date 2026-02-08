export function normalizeMarkdownForCopy(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]*<br\s*\/?>[ \t]*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
