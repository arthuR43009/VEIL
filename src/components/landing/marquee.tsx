"use client";

import { SECTION_COLORS } from "./scroll-bg";
import { GhostMark } from "./ghost";

const ITEMS = [
  "NO ACCOUNTS",
  "NO LOGS",
  "NO TRACKERS",
  "END-TO-END ENCRYPTED",
  "SELF-DESTRUCTING MESSAGES",
  "RANDOM GHOST IDS",
  "ZERO METADATA",
  "INSTANT ROOMS",
];

export default function Marquee() {
  return (
    <section
      data-bg={SECTION_COLORS.ink}
      data-theme="dark"
      aria-label="Veil principles"
      className="relative overflow-hidden border-y border-cream/10 py-6 md:py-8"
    >
      <div
        className="marquee-track flex items-center"
        style={{ "--marquee-duration": "34s" } as React.CSSProperties}
      >
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= ITEMS.length}
            className="flex shrink-0 items-center"
          >
            <span className="whitespace-nowrap pr-8 font-display text-xl font-medium tracking-tight text-cream/85 md:pr-12 md:text-3xl">
              {item}
            </span>
            <GhostMark className="h-4 w-4 shrink-0 text-lime md:h-5 md:w-5" />
          </span>
        ))}
      </div>
    </section>
  );
}
