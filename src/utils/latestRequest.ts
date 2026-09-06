export interface LatestRequestGate {
  begin: () => number;
  invalidate: () => void;
  isLatest: (token: number) => boolean;
}

/**
 * Monotonic request generations for async UI work that cannot be cancelled.
 * A result may update state only while its token is still the newest one.
 */
export function createLatestRequestGate(): LatestRequestGate {
  let generation = 0;

  return {
    begin() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isLatest(token) {
      return token === generation;
    },
  };
}
