"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server HTML and during hydration, true from the first client render after it. Until then the page
 * has no event handlers, so a control that only works through React should not look clickable.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
