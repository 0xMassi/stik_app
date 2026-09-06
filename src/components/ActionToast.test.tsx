import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActionToast from "./ActionToast";

describe("ActionToast", () => {
  it("announces its message as a polite status", () => {
    render(<ActionToast message="Note moved to Trash" onDone={() => {}} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Note moved to Trash",
    );
  });

  it("offers an action and dismisses after it is selected", () => {
    const onAction = vi.fn();
    const onDone = vi.fn();
    render(
      <ActionToast
        message="Note moved to Trash"
        actionLabel="Undo"
        onAction={onAction}
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
