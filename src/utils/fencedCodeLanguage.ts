/** True when Markdown contains a fenced block with a language/info name. */
export function hasNamedFencedCodeBlock(markdown: string): boolean {
  return /^ {0,3}(?:`{3,}|~{3,})[ \t]*[^\s`~]+/m.test(markdown);
}
