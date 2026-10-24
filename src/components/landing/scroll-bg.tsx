"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { animate, motion, useMotionValue, useMotionValueEvent } from "framer-motion";

export type SectionTheme = "dark" | "light" | "lime";

export const SECTION_COLORS = {
  ink: "#0E0E13",
  ink2: "#121218",
  cream: "#F4F1E9",
  paper: "#EFEBDF",
  paper2: "#E9E4D4",
  lime: "#D9F450",
} as const;

const SectionThemeContext = createContext<SectionTheme>("dark");

/** Current active section theme — consumed by the nav to adapt its colors. */
export function useSectionTheme() {
  return useContext(SectionThemeContext);
}

/**
 * The signature animejs.com-style effect: a fixed background layer whose
 * color smoothly morphs as sections annotated with `data-bg` cross the
 * middle band of the viewport.
 *
 * Sections declare: <section data-bg="#hex" data-theme="dark|light|lime">
 */
export default function ScrollBackground({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<SectionTheme>("dark");
  const bg = useMotionValue<string>(SECTION_COLORS.ink);

  // Keep <body> in sync so overscroll rubber-banding never flashes the wrong color.
  useMotionValueEvent(bg, "change", (v) => {
    document.body.style.backgroundColor = v as string;
  });

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-bg]")
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When several entries fire at once the last intersecting one wins.
        let winner: HTMLElement | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) winner = entry.target as HTMLElement;
        }
        if (!winner) return;

        const target = winner.dataset.bg;
        if (target) {
          animate(bg, target, {
            duration: 0.9,
            ease: [0.22, 1, 0.36, 1],
          });
        }
        const nextTheme = winner.dataset.theme as SectionTheme | undefined;
        if (nextTheme) setTheme(nextTheme);
      },
      // A thin horizontal band around the viewport middle — only one stacked
      // section can cover it at a time, which gives clean hand-offs.
      { rootMargin: "-42% 0px -52% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [bg]);

  return (
    <SectionThemeContext.Provider value={theme}>
      <motion.div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{ backgroundColor: bg }}
      />
      {children}
    </SectionThemeContext.Provider>
  );
}
