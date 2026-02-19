export function rgbToHex(rgb: string): string {
  const parts = rgb.trim().split(/\s+/).map(Number);
  if (parts.length < 3) return "#000000";
  return (
    "#" +
    parts
      .slice(0, 3)
      .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToRgb(hex: string): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
