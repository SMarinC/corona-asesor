"use client";

import { useSyncExternalStore } from "react";

function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 1_000);
  return () => clearInterval(id);
}

/** Without a deadline nothing ticks, so the host does not re-render every second all session. */
const subscribeToNothing = () => () => {};

const nowInSeconds = () => Math.floor(Date.now() / 1_000);

/** Whole seconds left until `deadlineMs`, ticking once a second; null without a deadline. */
export function useCountdown(deadlineMs: number | null): number | null {
  const now = useSyncExternalStore(deadlineMs === null ? subscribeToNothing : subscribeToClock, nowInSeconds, () => 0);
  if (deadlineMs === null) return null;
  return Math.max(0, Math.ceil(deadlineMs / 1_000 - now));
}
