const IMAGE_PATH_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function hasImageExtension(path: string): boolean {
  return IMAGE_PATH_EXTENSIONS.test(path);
}

/**
 * Extract a local absolute image file path from a drop payload string.
 * Supports `file://` URLs and direct absolute POSIX paths.
 */
export function extractDroppedImagePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("file://")) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "file:") return null;
      if (parsed.hostname && parsed.hostname !== "localhost") return null;

      let pathname = decodeURIComponent(parsed.pathname);
      if (/^\/[A-Za-z]:\//.test(pathname)) {
        pathname = pathname.slice(1);
      }

      return hasImageExtension(pathname) ? pathname : null;
    } catch {
      return null;
    }
  }

  if (!trimmed.startsWith("/")) {
    return null;
  }

  return hasImageExtension(trimmed) ? trimmed : null;
}
