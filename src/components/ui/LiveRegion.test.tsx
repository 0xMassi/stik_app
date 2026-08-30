import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LiveRegion from "./LiveRegion";

describe("LiveRegion", () => {
  it("announces polite status updates atomically", () => {
    render(<LiveRegion message="4 results found" />);

    expect(screen.getByRole("status")).toHaveTextContent("4 results found");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  });

  it("uses an alert for assertive failures", () => {
    render(<LiveRegion message="Save failed" priority="assertive" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
  });
});
