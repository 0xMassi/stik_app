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
