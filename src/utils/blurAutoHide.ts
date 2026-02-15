import { isCaptureSlashQuery } from "./slashQuery";

interface BlurAutoHideInput {
  content: string;
  nowMs: number;
  ignoreUntilMs: number;
}

export function shouldHideCaptureOnBlur(input: BlurAutoHideInput): boolean {
  if (input.nowMs < input.ignoreUntilMs) return false;

  const trimmed = input.content.trim();
  if (trimmed.length === 0) return true;
  return isCaptureSlashQuery(trimmed);
}
