/**
 * Returns the external URL under a line offset, if any.
 * Supports markdown links: [text](https://...)
 * and bare URLs: https://...
 */
export function findExternalLinkAtOffset(
  lineText: string,
  offset: number
): string | null {
  const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = markdownLinkRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset < end) {
      return match[2];
    }
  }

  const urlRegex = /https?:\/\/[^\s)]+/g;
  while ((match = urlRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset < end) {
      return match[0];
    }
  }

  return null;
}

interface CmdLinkCursorParams {
  metaKey: boolean;
  lineText: string;
  offset: number;
}

export function shouldShowCmdLinkCursor({
  metaKey,
  lineText,
  offset,
}: CmdLinkCursorParams): boolean {
  if (!metaKey) return false;
  return findExternalLinkAtOffset(lineText, offset) !== null;
}
