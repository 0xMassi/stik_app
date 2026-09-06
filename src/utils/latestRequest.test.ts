import { describe, expect, it } from "vitest";
import { createLatestRequestGate } from "./latestRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("latest request gate", () => {
  it("rejects an older request that resolves after the newest one", async () => {
    const gate = createLatestRequestGate();
    const first = deferred<string>();
    const second = deferred<string>();
    const committed: string[] = [];

    const firstToken = gate.begin();
    const firstWork = first.promise.then((value) => {
      if (gate.isLatest(firstToken)) committed.push(value);
    });

    const secondToken = gate.begin();
    const secondWork = second.promise.then((value) => {
      if (gate.isLatest(secondToken)) committed.push(value);
    });

    second.resolve("second");
    await secondWork;
    first.resolve("first");
    await firstWork;

    expect(committed).toEqual(["second"]);
  });

  it("can invalidate in-flight work when search is cleared", () => {
    const gate = createLatestRequestGate();
    const token = gate.begin();

    gate.invalidate();

    expect(gate.isLatest(token)).toBe(false);
  });
});
