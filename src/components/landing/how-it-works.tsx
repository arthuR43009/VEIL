"use client";

import { SECTION_COLORS } from "./scroll-bg";
import { LineMask, MonoTag, Reveal } from "./reveal";

const STEPS = [
  {
    act: "ACT I — IDENTITY",
    title: "Become nobody",
    desc: "Open Veil and a ghost identity is minted on the spot — a random handle, a one-time keypair, and exactly zero questions asked.",
  },
  {
    act: "ACT II — CONNECTION",
    title: "Slip into a room",
    desc: "Follow a room link, pick a topic, or let pairing drop you somewhere unexpected. Rooms live in memory, only while someone is in them.",
  },
  {
    act: "ACT III — ERASURE",
    title: "Watch it burn",
    desc: "Close the tab and the fuse lights. Messages, keys, room state — everything is destroyed on schedule and on exit. There is no history to hack.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how"
      data-bg={SECTION_COLORS.paper}
      data-theme="light"
      className="relative py-24 md:py-36"
    >
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <header className="mb-14 text-center md:mb-24">
          <Reveal>
            <MonoTag className="text-ink/40">02 — HOW IT WORKS</MonoTag>
          </Reveal>
          <h2 className="mt-6 font-display text-[clamp(2.6rem,6.5vw,5.8rem)] font-bold leading-[0.95] tracking-[-0.03em] text-ink">
            <LineMask delay={0.1}>THREE ACTS.</LineMask>
            <LineMask delay={0.2}>
              <span className="text-stroke-ink">ZERO TRACE.</span>
            </LineMask>
          </h2>
        </header>

        <div className="relative grid gap-14 lg:grid-cols-3 lg:gap-10">
          {/* dashed connector */}
          <div
            aria-hidden
            className="absolute left-[12%] right-[12%] top-[4.4rem] hidden border-t-2 border-dashed border-ink/20 lg:block"
          />
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.14} className="relative">
              <div className="relative inline-block bg-paper pr-4 lg:bg-transparent">
                <span className="font-display text-[5.6rem] font-bold leading-none text-stroke-ink md:text-[7rem]">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {step.title}
              </h3>
              <p className="mt-4 max-w-sm leading-relaxed text-ink/55">
                {step.desc}
              </p>
              <p className="mt-7 font-tech text-[10px] tracking-[0.28em] text-ink/40">
                [ {step.act} ]
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
