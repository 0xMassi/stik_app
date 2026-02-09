function isAssetProtocolUrl(url: string): boolean {
  return (
    url.startsWith("asset://localhost/") ||
    url.startsWith("http://asset.localhost/") ||
    url.startsWith("https://asset.localhost/") ||
    url.startsWith("file:///")
  );
}

/**
 * Convert asset protocol URLs back to relative `.assets/` paths for storage.
 * Handles both legacy `asset://localhost/...` and `https://asset.localhost/...`.
 */
export function unresolveImagePaths(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, rawUrl) => {
    if (!isAssetProtocolUrl(rawUrl)) {
      return match;
    }

    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      // Keep raw URL when decoding fails.
    }

    const marker = "/.assets/";
    const markerIndex = decodedUrl.toLowerCase().lastIndexOf(marker);
    if (markerIndex === -1) {
      return match;
    }

    const filename = decodedUrl
      .slice(markerIndex + marker.length)
      .replace(/^[/\\]+/, "");
    if (!filename) {
      return match;
    }

    return `![${alt}](.assets/${filename})`;
  });
}

/**
 * Convert relative `.assets/` paths in markdown to asset protocol URLs for display.
 * Also normalizes legacy persisted asset protocol URLs to relative first.
 */
export function resolveImagePaths(
  markdown: string,
  folderPath: string,
  toFileSrc: (absolutePath: string) => string
): string {
  const normalized = unresolveImagePaths(markdown);
  return normalized.replace(
    /!\[([^\]]*)\]\(\.assets\/([^)]+)\)/g,
    (_match, alt, filename) => {
      const absPath = `${folderPath}/.assets/${filename}`;
      return `![${alt}](${toFileSrc(absPath)})`;
    }
  );
}
