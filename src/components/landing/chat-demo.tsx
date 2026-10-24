"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { Flame, Send } from "lucide-react";
import { SECTION_COLORS } from "./scroll-bg";
import { GhostMark } from "./ghost";
import { EASE, LineMask, MonoTag, Reveal, Stagger, StaggerItem } from "./reveal";

/* ── Scripted conversation ───────────────────────────────── */
type Side = "L" | "R";
const MESSAGES: { side: Side; text: string }[] = [
  { side: "L", text: "psst. you made it in." },
  { side: "R", text: "who is this?" },
  { side: "L", text: "exactly who you needed." },
  { side: "R", text: "okay. say something you would never sign." },
  { side: "L", text: "i have never told anyone this before—" },
];

type Phase = {
  typing: Side | null;
  visible: number;
  burning: boolean;
  ended: boolean;
};

const INITIAL: Phase = { typing: null, visible: 0, burning: false, ended: false };

type Event = { t: number; set: Partial<Phase> };

const EVENTS: Event[] = [
  { t: 600, set: { typing: "L" } },
  { t: 1600, set: { typing: null, visible: 1 } },
  { t: 2800, set: { typing: "R" } },
  { t: 3900, set: { typing: null, visible: 2 } },
  { t: 5100, set: { typing: "L" } },
  { t: 5900, set: { typing: null, visible: 3 } },
  { t: 7100, set: { typing: "R" } },
  { t: 8000, set: { typing: null, visible: 4 } },
  { t: 9400, set: { typing: "L" } },
  { t: 10200, set: { typing: null, visible: 5 } },
  { t: 11800, set: { burning: true } },
  { t: 13800, set: { ended: true } },
  { t: 18400, set: { typing: null, visible: 0, burning: false, ended: false } },
];

const ANNOTATIONS = [
  "identities are minted per room",
  "keys live in your tab — nowhere else",
  "close the tab and the fuse lights itself",
];

export default function ChatDemo() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const inView = useInView(phoneRef, { margin: "-18% 0px -18% 0px" });
  const [phase, setPhase] = useState<Phase>(INITIAL);

  /* Timeline runner — plays while the phone is on screen, pauses off-screen. */
  useEffect(() => {
    if (!inView) return;

    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;
    const total = EVENTS[EVENTS.length - 1].t;

    const step = () => {
      const ev = EVENTS[idx];
      setPhase((p) => ({ ...p, ...ev.set }));
      idx = (idx + 1) % EVENTS.length;
      const next = EVENTS[idx];
      const delta = next.t > ev.t ? next.t - ev.t : total - ev.t + EVENTS[0].t;
      timer = setTimeout(step, delta);
    };

    // Reset asynchronously (never setState synchronously in the effect body).
    const begin = () => {
      setPhase(INITIAL);
      timer = setTimeout(step, EVENTS[0].t);
    };

    timer = setTimeout(begin, 60);
    return () => clearTimeout(timer);
  }, [inView]);

  const fuseLabel = phase.burning || phase.ended ? "BURNED" : "FUSE 00:30";

  return (
    <section
      id="demo"
      data-bg={SECTION_COLORS.paper2}
      data-theme="light"
      className="relative overflow-hidden py-24 md:py-36"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 md:px-10 lg:grid-cols-2">
        {/* copy column */}
        <div>
          <Reveal>
            <MonoTag className="text-ink/40">03 — LIVE DEMO</MonoTag>
          </Reveal>
          <h2 className="mt-6 font-display text-[clamp(2.6rem,6.5vw,5.8rem)] font-bold leading-[0.95] tracking-[-0.03em] text-ink">
            <LineMask delay={0.1}>WATCH IT</LineMask>
            <LineMask delay={0.2}>
              <span className="text-coral">BURN.</span>
            </LineMask>
          </h2>
          <Reveal delay={0.25}>
            <p className="mt-7 max-w-md leading-relaxed text-ink/60">
              A simulation of a real Veil room: two strangers, one fuse, zero
              survivors. Every message self-destructs — this demo just shows
              you what your tab does the moment you close it.
            </p>
          </Reveal>
          <Stagger className="mt-9 space-y-3" gap={0.12}>
            {ANNOTATIONS.map((a) => (
              <StaggerItem key={a}>
                <p className="flex items-center gap-3 font-tech text-xs tracking-[0.12em] text-ink/55">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime-2" />
                  {a}
                </p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        {/* phone column */}
        <Reveal delay={0.15} y={40}>
          <div className="mx-auto w-full max-w-[380px]" ref={phoneRef}>
            <div className="rounded-[2.2rem] border-2 border-ink bg-cream p-3 shadow-[14px_14px_0_0_rgba(14,14,19,1)] transition-transform duration-500">
              {/* room header */}
              <div className="flex items-center justify-between rounded-[1.7rem] rounded-b-none border-b border-ink/10 px-4 pb-3 pt-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-lime">
                    <GhostMark className="h-5 w-5 text-ink" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-semibold leading-tight text-ink">
                      room /r/3f9a2c
                    </p>
                    <p className="flex items-center gap-1.5 font-tech text-[10px] text-ink/45">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-lime-2" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-2" />
                      </span>
                      2 GHOSTS ONLINE
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 font-tech text-[9px] tracking-[0.15em] transition-colors duration-300 ${
                    phase.burning || phase.ended
                      ? "border-coral bg-coral text-cream"
                      : "border-ink/20 text-ink/50"
                  }`}
                >
                  {fuseLabel}
                </span>
              </div>

              {/* messages */}
              <div className="flex min-h-[380px] flex-col gap-2.5 overflow-hidden p-4">
                <AnimatePresence>
                  {!phase.ended &&
                    MESSAGES.slice(0, phase.visible).map((m, i) => (
                      <motion.div
                        key={m.text}
                        layout
                        initial={{ opacity: 0, y: 18, scale: 0.92 }}
                        animate={
                          phase.burning
                            ? {
                                opacity: 0,
                                y: -12,
                                scale: 0.88,
                                filter: "blur(10px)",
                              }
                            : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
                        }
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
                        transition={
                          phase.burning
                            ? {
                                duration: 0.55,
                                ease: "easeIn",
                                // newest messages burn first
                                delay: (phase.visible - 1 - i) * 0.11,
                              }
                            : { type: "spring", stiffness: 320, damping: 24 }
                        }
                        className={`max-w-[78%] px-3.5 py-2.5 text-sm leading-snug ${
                          m.side === "L"
                            ? "self-start rounded-2xl rounded-bl-sm bg-ink text-cream"
                            : "self-end rounded-2xl rounded-br-sm bg-lime text-ink"
                        }`}
                      >
                        {m.side === "L" && i === 0 && (
                          <span className="mb-1 block font-tech text-[9px] uppercase tracking-[0.2em] text-cream/40">
                            ghost_4f2a
                          </span>
                        )}
                        {m.text}
                      </motion.div>
                    ))}

                  {/* typing indicator */}
                  {phase.typing && !phase.ended && (
                    <motion.div
                      key="typing"
                      initial={{ opacity: 0, y: 12, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                      transition={{ type: "spring", stiffness: 380, damping: 26 }}
                      className={`flex w-fit items-center gap-1.5 px-4 py-3 ${
                        phase.typing === "L"
                          ? "self-start rounded-2xl rounded-bl-sm bg-ink"
                          : "self-end rounded-2xl rounded-br-sm bg-lime"
                      }`}
                      aria-label="Someone is typing"
                    >
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className={`typing-dot h-1.5 w-1.5 rounded-full ${
                            phase.typing === "L" ? "bg-cream/70" : "bg-ink/60"
                          }`}
                        />
                      ))}
                    </motion.div>
                  )}

                  {/* burn note */}
                  {phase.ended && (
                    <motion.div
                      key="burn-note"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: EASE }}
                      className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-coral/10">
                        <Flame className="h-5 w-5 text-coral" />
                      </span>
                      <p className="max-w-[220px] font-tech text-[10px] leading-relaxed tracking-[0.25em] text-ink/45">
                        THIS CONVERSATION NO LONGER EXISTS.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* input bar (mock) */}
              <div className="flex items-center gap-2.5 rounded-[1.7rem] rounded-t-none border-t border-ink/10 p-3">
                <div className="flex-1 rounded-full bg-ink/[0.05] px-4 py-2.5 font-tech text-xs text-ink/35">
                  type to vanish…
                </div>
                <span
                  aria-hidden
                  className="grid h-9 w-9 place-items-center rounded-full bg-ink text-cream"
                >
                  <Send className="h-3.5 w-3.5 -translate-x-px translate-y-px" />
                </span>
              </div>
            </div>

            {/* under-phone caption */}
            <p className="mt-6 text-center font-tech text-[10px] tracking-[0.3em] text-ink/35">
              SIMULATION · LOOPS EVERY 18S · NOTHING STORED
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
