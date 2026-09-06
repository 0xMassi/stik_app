import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import SpeechButton from "./SpeechButton";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const status = { installed_models: ["tiny"], active_model: "tiny", downloading: null };

beforeEach(() => {
  document.body.inert = false;
  vi.mocked(invoke).mockReset().mockImplementation(async (command) => {
    if (command === "dictation_get_status") return status;
    return null;
  });
});

afterEach(() => { cleanup(); document.body.inert = false; });

describe("dictation during app quit", () => {
  it.each([1, 2])("does not start recording when shutdown begins during status check %s", async (delayedCheck) => {
    render(<SpeechButton activeModel="tiny" onPartialText={vi.fn()} onTranscription={vi.fn()} getInsertOrigin={() => 0} />);
    await act(async () => {}); // Complete the independent mount-time status check.
    let resolve!: (value: typeof status) => void;
    const delayed = new Promise<typeof status>((done) => { resolve = done; });
    let checks = 0;
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "dictation_get_status") return ++checks === delayedCheck ? delayed : status;
      return null;
    });
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(checks).toBe(delayedCheck));
    document.body.inert = true;
    await act(async () => { resolve(status); });
    expect(invoke).not.toHaveBeenCalledWith("dictation_start", expect.anything());
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    // Cancelling quit must leave the ordinary start interaction usable.
    document.body.inert = false;
    fireEvent.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"));
    expect(invoke).toHaveBeenCalledWith("dictation_start", { language: null, modelId: "tiny" });
  });
});
