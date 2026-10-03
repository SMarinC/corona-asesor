"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { CoronaUIMessage } from "@/lib/agent/agent";
import { createTimingStore, type TimingStore, type Timings } from "@/lib/ui/trace";

/** Step timestamps for every assistant message, recorded as the stream arrives. */
export function useTurnTimings(messages: CoronaUIMessage[], streaming: boolean): { timings: Timings; store: TimingStore } {
  const [store] = useState(() => createTimingStore());
  useEffect(() => store.observe(messages, streaming), [store, messages, streaming]);
  const timings = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { timings, store };
}
