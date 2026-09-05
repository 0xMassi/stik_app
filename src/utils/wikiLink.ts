/** Strip timestamp prefix and UUID suffix from filename -> human-readable slug */
export function filenameToSlug(filename: string): string {
  let slug = filename.replace(/\.md$/, "");
  slug = slug.replace(/^\d{8}-\d{6}-/, "");
  slug = slug.replace(/-[0-9a-f]{4,}$/, "");
  return slug;
}
