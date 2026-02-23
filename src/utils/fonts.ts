export interface FontEntry {
  id: string;       // CSS font-family name (spaces allowed)
  label: string;    // Display label
  category: "sans" | "serif" | "mono";
  weights: number[];
}

export const FONTS: FontEntry[] = [
  // Sans-serif
  { id: "Inter", label: "Inter", category: "sans", weights: [400, 500] },
  { id: "Lato", label: "Lato", category: "sans", weights: [400, 700] },
  { id: "Plus Jakarta Sans", label: "Plus Jakarta Sans", category: "sans", weights: [400, 500] },
  // Serif
  { id: "Merriweather", label: "Merriweather", category: "serif", weights: [400, 700] },
  { id: "Crimson Pro", label: "Crimson Pro", category: "serif", weights: [400, 600] },
  { id: "Source Serif 4", label: "Source Serif 4", category: "serif", weights: [400, 600] },
  // Monospace
  { id: "JetBrains Mono", label: "JetBrains Mono", category: "mono", weights: [400, 500] },
  { id: "Fira Code", label: "Fira Code", category: "mono", weights: [400, 500] },
  { id: "IBM Plex Mono", label: "IBM Plex Mono", category: "mono", weights: [400, 500] },
];

const loadedFonts = new Set<string>();

/** Lazily inject a Google Fonts <link> tag — only once per session per font. */
export function loadGoogleFont(fontId: string): void {
  if (loadedFonts.has(fontId)) return;
  loadedFonts.add(fontId);
  const font = FONTS.find((f) => f.id === fontId);
  if (!font) return;
  const urlFamily = fontId.replace(/ /g, "+");
  const weights = font.weights.join(";");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${urlFamily}:wght@${weights}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Load a local font file via the browser FontFace API.
 * Uses Tauri's asset protocol (convertFileSrc) to serve the file.
 * Safe to call multiple times — loads only once per session per font name.
 */
export async function loadCustomFont(name: string, path: string): Promise<boolean> {
  const key = `custom:${name}`;
  if (loadedFonts.has(key)) return true;

  try {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const url = convertFileSrc(path);
    const face = new FontFace(name, `url("${url}")`);
    await face.load();
    document.fonts.add(face);
    loadedFonts.add(key);
    return true;
  } catch {
    return false; // file missing or format unsupported — caller handles gracefully
  }
}

/** Derive a font family name from a font file's basename (strips extension). */
export function fontNameFromPath(path: string): string {
  const basename = path.split("/").pop() ?? path;
  return basename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}
