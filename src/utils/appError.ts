export interface AppError {
  message: string;
  code?: string;
  detail?: string;
  recoverable: boolean;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeAppError(error: unknown, fallback: string): AppError {
  if (typeof error === "string") {
    return { message: nonEmptyString(error) ?? fallback, recoverable: true };
  }

  if (error instanceof Error) {
    return {
      message: nonEmptyString(error.message) ?? fallback,
      recoverable: true,
    };
  }

  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message = nonEmptyString(value.message);
    if (message) {
      const normalized: AppError = {
        message,
        recoverable:
          typeof value.recoverable === "boolean" ? value.recoverable : true,
      };
      const code = nonEmptyString(value.code);
      const detail = nonEmptyString(value.detail);
      if (code) normalized.code = code;
      if (detail) normalized.detail = detail;
      return normalized;
    }
  }

  return { message: fallback, recoverable: true };
}

export function errorMessage(error: unknown, fallback: string): string {
  return normalizeAppError(error, fallback).message;
}
