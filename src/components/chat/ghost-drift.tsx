"use client";

/**
 * GhostDrift — the house ghost, drifting through whatever screen
 * has gone quiet. Feed it `show` (usually from useIdle) and a line
 * of mono copy; it fades in, crosses the area forever, and leaves
 * the moment there is life again.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GhostMark } from "@/components/landing/ghost";

/**
 * useIdle — true after `ms` of silence, false the instant any of the
 * `deps` signals change. Uses the render-phase adjustment pattern so
 * no setState ever fires synchronously inside an effect.
 */
export function useIdle(ms: number, deps: unknown[]): boolean {
  const key = deps.map((d) => String(d)).join("¦");
  const [state, setState] = useState({ key, idle: false });

  // adjust during render when activity was seen (official React pattern)
  if (state.key !== key) setState({ key, idle: false });

  useEffect(() => {
    const t = setTimeout(() => setState({ key, idle: true }), ms);
    return () => clearTimeout(t);
  }, [ms, key]);

  return state.idle;
}

export function GhostDrift({
  show,
  label,
  className = "absolute inset-0",
}: {
  show: boolean;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          aria-hidden
          className={`pointer-events-none z-20 overflow-hidden ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: "easeOut" } }}
          transition={{ duration: 1.2 }}
        >
          {reduce ? (
            /* reduced motion: the ghost hovers instead of crossing */
            <motion.div
              className="absolute left-1/2 top-[36%] -translate-x-1/2"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            >
              <GhostMark className="h-16 w-16 text-cream/12 md:h-24 md:w-24" eyeClass="fill-lime/15" />
            </motion.div>
          ) : (
            <div className="ghost-cross absolute top-[36%]">
              <motion.div
                animate={{ y: [0, -16, 0], rotate: [-4, 4, -4] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <GhostMark className="h-16 w-16 text-cream/12 md:h-24 md:w-24" eyeClass="fill-lime/15" />
              </motion.div>
            </div>
          )}

          <motion.p
            className="absolute inset-x-0 bottom-6 px-6 text-center font-tech text-[10px] leading-relaxed tracking-[0.3em] text-cream/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 1.6 }}
          >
            {label}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
