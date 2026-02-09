const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const IMAGE_FORMATS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
]);

export function isImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (IMAGE_EXTENSIONS.test(url.pathname)) {
      return true;
    }

    const format = url.searchParams.get("format")?.toLowerCase();
    if (format && IMAGE_FORMATS.has(format)) {
      return true;
    }

    const filename = url.searchParams.get("filename") ?? url.searchParams.get("file");
    if (filename && IMAGE_EXTENSIONS.test(filename)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Promote standalone image URLs and markdown links in a line into markdown image syntax.
 * This keeps legacy notes (saved as links) rendering as images when reopened.
 */
export function normalizeImageLinksForMarkdown(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      const markdownLinkMatch = trimmed.match(/^\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
      if (markdownLinkMatch) {
        const [, label, url] = markdownLinkMatch;
        if (isImageUrl(url)) {
          const alt = label === url ? "" : label;
          return line.replace(trimmed, `![${alt}](${url})`);
        }
      }

      const autoLinkMatch = trimmed.match(/^<((?:https?:\/\/)[^>\s]+)>$/);
      if (autoLinkMatch && isImageUrl(autoLinkMatch[1])) {
        return line.replace(trimmed, `![](${autoLinkMatch[1]})`);
      }

      if (isImageUrl(trimmed)) {
        return line.replace(trimmed, `![](${trimmed})`);
      }

      return line;
    })
    .join("\n");
}
