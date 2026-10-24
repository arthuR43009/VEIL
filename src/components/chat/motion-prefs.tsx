"use client";

/**
 * MotionPrefs — the accessibility spine (v5).
 *
 * A tri-state motion preference (SYSTEM / REDUCED / FULL) that:
 *  - persists in localStorage (veil.motion)
 *  - flips a `reduce-motion` class on <html> that kills every CSS
 *    animation exactly like the prefers-reduced-motion media query
 *  - feeds framer-motion via <MotionConfig> so transform/layout
 *    animations soften too
 *
 * Wraps the whole app from layout.tsx; <MotionToggle /> is the little
 * cycle button surfaces (gate, rules screen) use to change it.
 */
import { useEffect, useSyncExternalStore } from "react";
import { MotionConfig, useReducedMotion } from "framer-motion";

export type MotionMode = "system" | "reduce" | "full";
const KEY = "veil.motion";

let mode: MotionMode = "system";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const apply = (next: MotionMode, persist: boolean) => {
  mode = next;
  if (persist) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the session keeps the choice anyway */
    }
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("reduce-motion", next === "reduce");
  }
  emit();
};

export function setMotionMode(next: MotionMode) {
  apply(next, true);
}

/** the current preference (reactive) */
export function useMotionMode(): MotionMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => mode,
    () => "system" as MotionMode,
  );
}

/** final verdict combining the manual toggle with the OS setting */
export function useVeilReducedMotion(): boolean {
  const m = useMotionMode();
  const system = useReducedMotion();
  if (m === "reduce") return true;
  if (m === "full") return false;
  return !!system;
}

export function MotionPrefs({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "system" || saved === "reduce" || saved === "full") {
        apply(saved, false);
      }
    } catch {
      /* no storage, no problem */
    }
  }, []);

  const m = useMotionMode();
  return (
    <MotionConfig reducedMotion={m === "reduce" ? "always" : m === "full" ? "never" : "user"}>
      {children}
    </MotionConfig>
  );
}

const LABEL: Record<MotionMode, string> = {
  system: "SYSTEM",
  reduce: "REDUCED",
  full: "FULL",
};
const NEXT: Record<MotionMode, MotionMode> = {
  system: "reduce",
  reduce: "full",
  full: "system",
};

/** small cycle button — SYSTEM → REDUCED → FULL */
export function MotionToggle({ className = "" }: { className?: string }) {
  const m = useMotionMode();
  return (
    <button
      type="button"
      onClick={() => setMotionMode(NEXT[m])}
      aria-label={`Motion preference: ${LABEL[m]}. Tap to change.`}
      title="Motion preference"
      className={`font-tech text-[9px] tracking-[0.24em] text-cream/50 underline-offset-4 transition-colors hover:text-lime hover:underline ${className}`}
    >
      MOTION — {LABEL[m]}
    </button>
  );
}
