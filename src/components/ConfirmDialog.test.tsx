import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("confirms on Enter", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="T" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
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
