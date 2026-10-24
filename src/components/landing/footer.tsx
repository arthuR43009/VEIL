"use client";

import { SECTION_COLORS } from "./scroll-bg";
import { GhostMark } from "./ghost";
import { Reveal } from "./reveal";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "PRODUCT",
    links: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how" },
      { label: "Live demo", href: "#demo" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "PRINCIPLES",
    links: [
      { label: "No logs, ever", href: "#features" },
      { label: "E2E encryption", href: "#features" },
      { label: "RAM-only relays", href: "#how" },
      { label: "Open roadmap", href: "#start" },
    ],
  },
  {
    title: "SIGNAL",
    links: [
      { label: "GitHub", href: "#top" },
      { label: "X / Twitter", href: "#top" },
      { label: "RSS", href: "#top" },
      { label: "Canary", href: "#top" },
    ],
  },
];

export default function Footer() {
  return (
    <footer
      data-bg={SECTION_COLORS.ink}
      data-theme="dark"
      className="relative overflow-hidden pt-20 md:pt-28"
    >
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal>
          <div className="grid gap-12 pb-16 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-8">
            <div>
              <div className="flex items-center gap-2.5">
                <GhostMark className="h-8 w-8 text-lime" />
                <span className="font-display text-xl font-bold tracking-tight text-cream">
                  VEIL<span className="text-coral">.</span>
                </span>
              </div>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-cream/50">
                Chat like nobody&rsquo;s watching. Because nobody is.
              </p>
              <p className="mt-7 font-tech text-[10px] tracking-[0.25em] text-cream/35">
                [ WARRANT CANARY: ALIVE ]
              </p>
            </div>

            {COLS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h3 className="font-tech text-[10px] tracking-[0.3em] text-cream/40">
                  {col.title}
                </h3>
                <ul className="mt-5 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-sm text-cream/60 transition-colors duration-300 hover:text-lime"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </Reveal>

        <div className="flex flex-col justify-between gap-3 border-t border-cream/10 py-6 font-tech text-[9px] tracking-[0.22em] text-cream/35 md:flex-row">
          <span>© 2025 VEIL — NOTHING WAS EVER HERE.</span>
          <span>V0.1.0 · STRUCTURE PHASE · BUILT FOR THE UNHEARD</span>
        </div>
      </div>

      {/* giant outlined wordmark, cropped by the page edge */}
      <div aria-hidden className="select-none overflow-hidden">
        <p className="text-stroke-faint -mb-[0.16em] text-center font-display text-[27vw] font-bold leading-[0.78] tracking-[-0.02em]">
          VEIL
        </p>
      </div>
    </footer>
  );
}
