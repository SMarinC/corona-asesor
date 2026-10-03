"use client";

import { useEffect, useState } from "react";

/**
 * True once `deadlineMs` has passed; a single timer, so the host re-renders once at the deadline, not every second.
 * Without a deadline it is false.
 */
export function useDeadlinePassed(deadlineMs: number | null): boolean {
  const [passedFor, setPassedFor] = useState<number | null>(null);
  useEffect(() => {
    if (deadlineMs === null) return;
    const id = setTimeout(() => setPassedFor(deadlineMs), Math.max(0, deadlineMs - Date.now()));
    return () => clearTimeout(id);
  }, [deadlineMs]);
  return deadlineMs !== null && passedFor === deadlineMs;
}
