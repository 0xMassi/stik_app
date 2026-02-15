export function isCaptureSlashQuery(content: string): boolean {
  if (!content.startsWith("/")) return false;
  if (content.includes(" ")) return false;
  if (content.includes("\n")) return false;
  return content.length < 15;
}
