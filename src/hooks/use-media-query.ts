"use client";

import { useSyncExternalStore } from "react";

/**
 * Reactive media-query hook (SSR-safe via useSyncExternalStore).
 * Used to enable drag interactions only on fine-pointer devices.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function useFinePointer(): boolean {
  return useMediaQuery("(pointer: fine)");
}
