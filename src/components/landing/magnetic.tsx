"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Magnetic wrapper — the element gravitates toward the cursor with spring
 * physics, then snaps back. Desktop (fine pointer) only; touch devices
 * get normal behavior.
 */
export default function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 180, damping: 14, mass: 0.4 });
  const y = useSpring(my, { stiffness: 180, damping: 14, mass: 0.4 });

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (
      !ref.current ||
      (typeof window !== "undefined" &&
        !window.matchMedia("(pointer: fine)").matches)
    ) {
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    mx.set((e.clientX - rect.left - rect.width / 2) * strength);
    my.set((e.clientY - rect.top - rect.height / 2) * strength);
  }

  function handleLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x, y }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
