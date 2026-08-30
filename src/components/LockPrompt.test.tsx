import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LockPrompt from "./LockPrompt";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("LockPrompt", () => {
  it("is a named modal with safe initial focus and Escape cancellation", async () => {
    const onCancel = vi.fn();
    render(<LockPrompt onAuthenticated={() => {}} onCancel={onCancel} />);

    expect(screen.getByRole("dialog", { name: /locked note/i })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
