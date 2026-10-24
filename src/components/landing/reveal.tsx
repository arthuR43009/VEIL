"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/** Signature easing — fast start, long silky settle. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ── Reveal: fade + rise on scroll into view ─────────────── */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ── LineMask: the animejs-style line-wipe headline reveal ──
 * NOTE: `whileInView` must live on the OUTER span. An element fully
 * clipped by an `overflow-hidden` ancestor has zero intersection with
 * the viewport, so an observer on the inner (translated) span never
 * fires. The outer span is never clipped, and variants propagate down. */
export function LineMask({
  children,
  delay = 0,
  className,
  innerClassName,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <motion.span
      className={`block overflow-hidden ${className ?? ""}`}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: 0.1, delayChildren: delay },
        },
      }}
    >
      <motion.span
        className={`block will-change-transform ${innerClassName ?? ""}`}
        variants={{
          hidden: { y: "112%" },
          show: {
            y: "0%",
            transition: { duration: 1.05, ease: EASE },
          },
        }}
      >
        {children}
      </motion.span>
    </motion.span>
  );
}

/* ── Stagger containers ──────────────────────────────────── */
const containerVariants: Variants = {
  hidden: {},
  show: (gap: number) => ({
    transition: { staggerChildren: gap, delayChildren: 0.05 },
  }),
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: EASE },
  },
};

export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      custom={gap}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

/* ── MonoTag: the technical `[ 01 — SECTION ]` label ─────── */
export function MonoTag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-tech text-[11px] tracking-[0.3em] uppercase ${className ?? ""}`}
    >
      [ {children} ]
    </span>
  );
}
