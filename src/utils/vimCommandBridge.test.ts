import { describe, expect, it, vi } from "vitest";
import { createVimCommandCallbacks } from "./vimCommandBridge";

describe("createVimCommandCallbacks", () => {
  it("routes :wq/:x to save-and-close callback", () => {
    const onSaveAndClose = vi.fn();
    const onCloseWithoutSaving = vi.fn();
    const onModeChange = vi.fn();
    const callbacks = createVimCommandCallbacks({
      onSaveAndClose,
      onCloseWithoutSaving,
      onModeChange,
    });

    callbacks.onSaveAndClose();

    expect(onSaveAndClose).toHaveBeenCalledTimes(1);
    expect(onCloseWithoutSaving).not.toHaveBeenCalled();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("routes :q/:q! to close-without-saving callback", () => {
    const onSaveAndClose = vi.fn();
    const onCloseWithoutSaving = vi.fn();
    const onModeChange = vi.fn();
    const callbacks = createVimCommandCallbacks({
      onSaveAndClose,
      onCloseWithoutSaving,
      onModeChange,
    });

    callbacks.onCloseWithoutSaving();

    expect(onCloseWithoutSaving).toHaveBeenCalledTimes(1);
    expect(onSaveAndClose).not.toHaveBeenCalled();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("routes command-mode transition to mode change callback", () => {
    const onSaveAndClose = vi.fn();
    const onCloseWithoutSaving = vi.fn();
    const onModeChange = vi.fn();
    const callbacks = createVimCommandCallbacks({
      onSaveAndClose,
      onCloseWithoutSaving,
      onModeChange,
    });

    callbacks.onCommandMode();

    expect(onModeChange).toHaveBeenCalledWith("command");
    expect(onSaveAndClose).not.toHaveBeenCalled();
    expect(onCloseWithoutSaving).not.toHaveBeenCalled();
  });
});
