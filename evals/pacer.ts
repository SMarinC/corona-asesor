const WINDOW_MS = 60_000;

/**
 * A sliding 60 s window over the model calls already made. `waitForTurn` returns once the calls still in the window
 * plus one worst-case turn fit under the requests-per-minute limit, so a run can never exceed the free tier's rate.
 */
export function createPacer({ rpm, worstCase }: { rpm: number; worstCase: number }) {
  const calls: number[] = [];
  const room = rpm - worstCase;
  return {
    /** Records `count` calls as made now (a turn's calls, conservatively stamped at its end). */
    record(count: number) {
      const now = Date.now();
      for (let i = 0; i < count; i++) calls.push(now);
    },
    async waitForTurn() {
      for (;;) {
        const now = Date.now();
        while (calls.length > 0 && calls[0] <= now - WINDOW_MS) calls.shift();
        if (calls.length <= room) return;
        // The oldest calls that must age out for the rest to fit.
        const releasesAt = calls[calls.length - room - 1] + WINDOW_MS;
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, releasesAt - now)));
      }
    },
  };
}
