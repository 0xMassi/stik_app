const IMAGE_FILE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/**
 * Finder drag/drop can provide image files with an empty MIME type.
 * Accept image MIME types first, then fall back to filename extension.
 */
export function isImageFile(file: Pick<File, "type" | "name">): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType.startsWith("image/")) {
    return true;
  }

  if (mimeType && mimeType !== "application/octet-stream") {
    return false;
  }

  return IMAGE_FILE_EXTENSIONS.test(file.name);
}
