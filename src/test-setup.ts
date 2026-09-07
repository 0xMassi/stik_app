/// <reference types="vitest/jsdom" />
/// Vitest setup — jest-dom matchers plus React unmounting between tests so DOM
/// state cannot leak from one case into the next.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Node 25 exposes process-level storage even when no storage file is configured.
// Browser tests need jsdom's isolated, working Storage implementation instead.
vi.stubGlobal("localStorage", jsdom.window.localStorage);

afterEach(() => {
  cleanup();
  localStorage.clear();
});
