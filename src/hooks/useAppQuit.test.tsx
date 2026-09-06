import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useAppQuit } from "./useAppQuit";

const events = vi.hoisted(() => new Map<string, (event: { payload: { id: number } }) => Promise<void> | void>());
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, handler) => {
    events.set(name, handler);
    return () => { events.delete(name); };
  }),
}));

function Participant({ save, onError }: { save: () => Promise<void>; onError: (error: unknown) => void }) {
  useAppQuit(save, onError);
  return <textarea defaultValue="Unsaved draft" />;
}

beforeEach(() => { events.clear(); vi.mocked(invoke).mockClear(); document.body.inert = false; });
afterEach(cleanup);

it("registers after listening, saves before acknowledgement, and stays frozen until cancellation", async () => {
  let finish!: () => void;
  let durable = "";
  const onError = vi.fn();
  render(<Participant save={async () => {
    await new Promise<void>((resolve) => { finish = resolve; });
    durable = "Unsaved draft";
  }} onError={onError} />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("register_quit_participant"));
  let pending!: Promise<void> | void;
  act(() => { pending = events.get("app-quit-requested")!({ payload: { id: 1 } }); });
  expect(document.body.inert).toBe(true);
  expect(durable).toBe("");
  expect(invoke).not.toHaveBeenCalledWith("complete_app_quit", expect.anything());
  await act(async () => { finish(); await pending; });
  expect(durable).toBe("Unsaved draft");
  expect(invoke).toHaveBeenCalledWith("complete_app_quit", { id: 1, saved: true });
  expect(document.body.inert).toBe(true);
  act(() => { events.get("app-quit-cancelled")!({ payload: { id: 1 } }); });
  expect(document.body.inert).toBe(false);
  expect(onError).not.toHaveBeenCalled();
});

it("rejects a failed save, preserves the draft, and allows retry after cancellation", async () => {
  let failed = true;
  let durable = "";
  const onError = vi.fn();
  render(<Participant save={async () => {
    if (failed) throw new Error("Disk full");
    durable = "Unsaved draft";
  }} onError={onError} />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("register_quit_participant"));
  await act(async () => { await events.get("app-quit-requested")!({ payload: { id: 1 } }); });
  expect(invoke).toHaveBeenCalledWith("complete_app_quit", { id: 1, saved: false });
  expect(onError).toHaveBeenCalledWith(new Error("Disk full"));
  expect(document.querySelector("textarea")?.value).toBe("Unsaved draft");
  act(() => { events.get("app-quit-cancelled")!({ payload: { id: 1 } }); });
  expect(document.body.inert).toBe(false);
  failed = false;
  await act(async () => { await events.get("app-quit-requested")!({ payload: { id: 2 } }); });
  expect(durable).toBe("Unsaved draft");
  expect(invoke).toHaveBeenCalledWith("complete_app_quit", { id: 2, saved: true });
});

it("does not acknowledge a cancelled generation when its slow save finishes", async () => {
  let finish!: () => void;
  render(<Participant save={() => new Promise<void>((resolve) => { finish = resolve; })} onError={vi.fn()} />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("register_quit_participant"));
  let pending!: Promise<void> | void;
  act(() => { pending = events.get("app-quit-requested")!({ payload: { id: 1 } }); });
  act(() => { events.get("app-quit-cancelled")!({ payload: { id: 1 } }); });
  await act(async () => { finish(); await pending; });
  expect(invoke).not.toHaveBeenCalledWith("complete_app_quit", expect.anything());
  expect(document.body.inert).toBe(false);
});
