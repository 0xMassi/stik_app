/**
 * Convert a Stik filename-derived date string (YYYYMMDD-HHMMSS) into a
 * human-friendly relative label: "Just now", "5 min ago", "2 hours ago",
 * "Yesterday", day-of-week for the last 7 days, or DD/MM/YY for older.
 */
export function formatRelativeDate(created: string): string {
  const match = created.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!match) return created; // fallback — return as-is

  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMs / 3_600_000);

  // Future or just created
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHrs < 24 && isSameDay(now, date)) return `${diffHrs}h ago`;

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(yesterday, date)) return "Yesterday";

  // Within last 7 days — show day name
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  // Older — DD/MM/YY
  const dd = d;
  const mm = mo;
  const yy = y.slice(2);
  return `${dd}/${mm}/${yy}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
