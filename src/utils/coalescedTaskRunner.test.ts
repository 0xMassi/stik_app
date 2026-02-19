import { describe, expect, it } from "vitest";
import { createCoalescedTaskRunner } from "./coalescedTaskRunner";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createCoalescedTaskRunner", () => {
  it("serializes work and only keeps the latest queued value", async () => {
    const seen: number[] = [];
    const first = deferred<void>();
    const second = deferred<void>();
    let calls = 0;

    const runner = createCoalescedTaskRunner(async (value: number) => {
      seen.push(value);
      calls += 1;
      if (calls === 1) {
        await first.promise;
      } else if (calls === 2) {
        await second.promise;
      }
    });

    runner.push(1);
    runner.push(2);
    runner.push(3);

    await Promise.resolve();
    expect(seen).toEqual([1]);

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([1, 3]);

    second.resolve();
    await runner.flush();
    expect(seen).toEqual([1, 3]);
  });

  it("flush resolves immediately when idle", async () => {
    const runner = createCoalescedTaskRunner(async () => {
      return;
    });

    await expect(runner.flush()).resolves.toBeUndefined();
  });
});
