/// Vitest setup — jest-dom matchers plus React unmounting between tests so DOM
/// state cannot leak from one case into the next.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
