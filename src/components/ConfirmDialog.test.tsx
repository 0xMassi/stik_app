import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";
import { setLocale } from "@/i18n";

afterEach(() => {
  setLocale("en");
});

describe("ConfirmDialog", () => {
  it("renders the title", () => {
    render(
      <ConfirmDialog
        title="Delete theme?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Delete theme?")).toBeInTheDocument();
  });

  it("renders the description only when provided", () => {
    const { rerender } = render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.queryByText("This cannot be undone")).not.toBeInTheDocument();

    rerender(
      <ConfirmDialog
        title="T"
        description="This cannot be undone"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("This cannot be undone")).toBeInTheDocument();
  });

  it("defaults the confirm button to the translated Delete label", () => {
    render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("uses an explicit confirmLabel when given", () => {
    render(
      <ConfirmDialog
        title="T"
        confirmLabel="Remove font"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Remove font" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("fires onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="T" onConfirm={onConfirm} onCancel={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="T" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not confirm from a global Enter key", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="T" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("is a named modal and initially focuses the safe action", async () => {
    render(
      <ConfirmDialog
        title="Delete note?"
        description="This moves the note to Trash."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Delete note?" }),
    ).toHaveAttribute("aria-modal", "true");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    });
  });

  it("contains Tab focus within its controls", async () => {
    render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={() => {}} />,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete" });

    await waitFor(() => expect(cancel).toHaveFocus());
    confirm.focus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();

    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it("restores focus to the invoking control", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    });
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("makes background content inert until it closes", () => {
    const background = document.createElement("main");
    document.body.appendChild(background);
    const { unmount } = render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={() => {}} />,
    );

    expect(background.inert).toBe(true);
    unmount();
    expect(background.inert).not.toBe(true);
    background.remove();
  });

  it("ignores unrelated keys", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="T" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Tab" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("stops listening for keys once unmounted", () => {
    // The listener is registered on `window` in capture phase; leaking it
    // would let a dismissed dialog keep swallowing Escape for the whole app.
    const onCancel = vi.fn();
    const { unmount } = render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={onCancel} />,
    );

    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("renders its chrome in the active locale", () => {
    setLocale("zh-CN");
    render(
      <ConfirmDialog title="T" onConfirm={() => {}} onCancel={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });
});
