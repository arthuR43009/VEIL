"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";
import { SECTION_COLORS } from "./scroll-bg";
import { EASE, MonoTag, Reveal } from "./reveal";

/* ── Count-up number (springs into view) ─────────────────── */
function CountUp({
  from = 0,
  to,
  duration = 2.4,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
}: {
  from?: number;
  to: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [val, setVal] = useState(from);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(from, to, {
      duration,
      ease: EASE,
      onUpdate: setVal,
    });
    return () => controls.stop();
  }, [inView, from, to, duration]);

  return <span ref={ref}>{format(val)}</span>;
}

const STATS: {
  value: React.ReactNode;
  label: string;
  desc: string;
  accent?: boolean;
}[] = [
  {
    value: <CountUp to={1248393} />,
    label: "MESSAGES BURNED TODAY",
    desc: "And counting. By the time you finish reading this, more are ash.",
  },
  {
    value: <CountUp from={420} to={0} format={(n) => String(Math.round(n))} />,
    label: "ACCOUNTS CREATED. EVER.",
    desc: "There is no signup. There is no database of users. There is no you.",
    accent: true,
  },
  {
    value: <CountUp to={100} format={(n) => `${Math.round(n)}%`} />,
    label: "END-TO-END ENCRYPTED",
    desc: "Keys are born in your tab, live in your tab, and die with your tab.",
  },
  {
    value: <CountUp to={72} format={(n) => `${Math.round(n)}ms`} />,
    label: "MEDIAN TIME TO A STRANGER",
    desc: "From cold landing to live conversation. Faster than courage.",
  },
];

export default function Stats() {
  return (
    <section
      data-bg={SECTION_COLORS.ink2}
      data-theme="dark"
      className="relative border-y border-cream/10 py-20 md:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <Reveal className="mb-12 md:mb-16">
          <MonoTag className="text-cream/40">04 — PROOF, NOT PROMISES</MonoTag>
        </Reveal>

        <div className="grid gap-y-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
          {STATS.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 0.1}
              className={`px-0 lg:px-8 ${
                i > 0 ? "lg:border-l lg:border-cream/10" : ""
              } ${i % 2 === 1 ? "sm:border-l sm:border-cream/10 sm:pl-8 lg:pl-8" : ""}`}
            >
              <p
                className={`font-display text-5xl font-bold tracking-tight md:text-6xl ${
                  s.accent ? "text-coral" : "text-cream"
                }`}
              >
                {s.value}
              </p>
              <p className="mt-3 font-tech text-[10px] tracking-[0.28em] text-lime">
                {s.label}
              </p>
              <p className="mt-3 max-w-[26ch] text-sm leading-relaxed text-cream/45">
                {s.desc}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
