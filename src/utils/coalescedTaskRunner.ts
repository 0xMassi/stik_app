export interface CoalescedTaskRunner<T> {
  push(value: T): void;
  flush(): Promise<void>;
}

export function createCoalescedTaskRunner<T>(worker: (value: T) => Promise<void>): CoalescedTaskRunner<T> {
  let inFlight = false;
  let hasQueued = false;
  let queuedValue: T | undefined;
  let idleResolvers: Array<() => void> = [];

  const resolveIdle = () => {
    if (inFlight || hasQueued) {
      return;
    }
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  };

  const run = async () => {
    if (inFlight) {
      return;
    }

    inFlight = true;
    try {
      while (hasQueued) {
        const value = queuedValue as T;
        hasQueued = false;
        queuedValue = undefined;
        await worker(value);
      }
    } finally {
      inFlight = false;
      if (hasQueued) {
        void run();
      } else {
        resolveIdle();
      }
    }
  };

  return {
    push(value: T) {
      queuedValue = value;
      hasQueued = true;
      void run();
    },
    flush() {
      if (!inFlight && !hasQueued) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      });
    },
  };
}
