import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AnalyticsNotice from "./AnalyticsNotice";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

describe("AnalyticsNotice", () => {
  it("requires an explicit enable or decline choice", () => {
    const onChoice = vi.fn();
    render(<AnalyticsNotice onChoice={onChoice} />);

    fireEvent.click(screen.getByRole("button", { name: "Enable analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(onChoice).toHaveBeenNthCalledWith(1, true);
    expect(onChoice).toHaveBeenNthCalledWith(2, false);
  });

  it("is exposed as a named modal dialog", () => {
    render(<AnalyticsNotice onChoice={() => {}} />);

    expect(screen.getByRole("dialog", { name: "Analytics choice" })).toBeInTheDocument();
  });
});
