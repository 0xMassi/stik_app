/** Read the user-facing message from native, JavaScript, or Tauri errors. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    error = (error as { message?: unknown }).message;
  }
  return typeof error === "string" && error.trim() ? error.trim() : fallback;
}
