/** Strip timestamp prefix and UUID suffix from filename -> human-readable slug */
export function filenameToSlug(filename: string): string {
  let slug = filename.replace(/\.md$/, "");
  slug = slug.replace(/^\d{8}-\d{6}-/, "");
  slug = slug.replace(/-[0-9a-f]{4,}$/, "");
  return slug;
}

/** Escape HTML special chars to prevent XSS */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
