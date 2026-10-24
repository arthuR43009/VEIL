"use client";

import type { ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useFinePointer } from "@/hooks/use-media-query";
import { useChat } from "@/lib/chat-store";
import { SECTION_COLORS } from "./scroll-bg";
import { EASE, LineMask } from "./reveal";
import Magnetic from "./magnetic";

/* ── Draggable physics chat bubble ─────────────────────────
 * Outer div: idle float loop (independent of drag). z-30 keeps it ABOVE the
 * center-stage column (z-20) whose flex-1 border-box spans the whole hero
 * and would otherwise swallow every pointer event before the bubble sees it.
 * Inner div: drag with inertia + spring snap back to origin.
 * Enabled only on fine-pointer devices so touch scrolling is never hijacked. */
function DragBubble({
  children,
  className,
  position,
  rotate = 0,
  floatDur = 6,
  floatDelay = 0,
}: {
  children: ReactNode;
  className: string;
  position: string;
  rotate?: number;
  floatDur?: number;
  floatDelay?: number;
}) {
  const draggable = useFinePointer();

  return (
    <motion.div
      className={`absolute z-30 ${position}`}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1, y: [0, -12, 0] }}
      transition={{
        opacity: { duration: 0.7, delay: 1.1, ease: EASE },
        scale: { type: "spring", stiffness: 200, damping: 14, delay: 1.1 },
        y: {
          duration: floatDur,
          delay: floatDelay,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }}
    >
      <motion.div
        drag={draggable}
        dragSnapToOrigin
        dragElastic={0.24}
        dragTransition={{ bounceStiffness: 340, bounceDamping: 22 }}
        whileDrag={{ scale: 1.1, rotate: 0 }}
        whileHover={{ scale: 1.05 }}
        animate={{ rotate }}
        transition={{ type: "spring", stiffness: 260, damping: 15 }}
        className={`cursor-grab touch-none select-none rounded-2xl px-4 py-3 shadow-[0_18px_44px_-14px_rgba(0,0,0,0.6)] active:cursor-grabbing ${className}`}
      >
        <span className="block font-tech text-sm leading-snug">{children}</span>
        <span className="mt-1 block font-tech text-[8px] uppercase tracking-[0.28em] opacity-40">
          drag me
        </span>
      </motion.div>
    </motion.div>
  );
}

export default function Hero() {
  const openChat = useChat((s) => s.openChat);
  // cursor-follow glow (spring physics)
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const gx = useSpring(mx, { stiffness: 55, damping: 18 });
  const gy = useSpring(my, { stiffness: 55, damping: 18 });
  const glowX = useTransform(gx, [-0.5, 0.5], [-140, 140]);
  const glowY = useTransform(gy, [-0.5, 0.5], [-90, 90]);

  function handleMouse(e: React.MouseEvent<HTMLElement>) {
    mx.set(e.clientX / window.innerWidth - 0.5);
    my.set(e.clientY / window.innerHeight - 0.5);
  }

  return (
    <section
      id="top"
      data-bg={SECTION_COLORS.ink}
      data-theme="dark"
      onMouseMove={handleMouse}
      className="relative flex min-h-svh flex-col overflow-hidden"
    >
      {/* backdrop: dotted grid + cursor glow + corner marks */}
      <div aria-hidden className="dot-grid absolute inset-0 opacity-70" />
      <motion.div
        aria-hidden
        style={{ x: glowX, y: glowY }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(217,244,80,0.09)_0%,transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-5 hidden font-tech text-[10px] tracking-[0.3em] text-cream/25 md:block"
      >
        <span className="absolute left-0 top-0">⌜ 51.5072°N</span>
        <span className="absolute right-0 top-0">0.1276°W ⌝</span>
        <span className="absolute bottom-0 left-0">⌞ SIG: NONE</span>
        <span className="absolute bottom-0 right-0">ID: NULL ⌟</span>
      </div>

      {/* draggable physics bubbles */}
      <DragBubble
        position="left-[4%] top-[22%] hidden lg:block"
        className="rounded-bl-sm bg-cream text-ink"
        rotate={-5}
        floatDur={5.4}
      >
        you there?
      </DragBubble>
      <DragBubble
        position="right-[5%] top-[19%] hidden md:block"
        className="rounded-br-sm bg-lime text-ink"
        rotate={3}
        floatDur={6.6}
        floatDelay={0.6}
      >
        always.
      </DragBubble>
      <DragBubble
        position="right-[13%] bottom-[24%] hidden lg:block"
        className="rounded-br-sm bg-cream text-ink"
        rotate={4}
        floatDur={5.8}
        floatDelay={1.1}
      >
        who&rsquo;s this?
      </DragBubble>
      <DragBubble
        position="left-[7%] bottom-[27%] hidden md:block"
        className="rounded-bl-sm bg-coral text-cream"
        rotate={-3}
        floatDur={7}
        floatDelay={0.3}
      >
        nobody.
      </DragBubble>
      <DragBubble
        position="left-[26%] top-[13%] hidden xl:block"
        className="rounded-bl-sm bg-cream/90 text-ink"
        rotate={2}
        floatDur={6.2}
        floatDelay={1.6}
      >
        exactly.
      </DragBubble>

      {/* center stage */}
      <div className="relative z-20 flex flex-1 flex-col items-center justify-center px-5 pb-20 pt-28 text-center">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
          className="font-tech text-[11px] tracking-[0.32em] text-cream/50"
        >
          ANONYMOUS <span className="text-lime">·</span> ENCRYPTED{" "}
          <span className="text-lime">·</span> EPHEMERAL
        </motion.p>

        <h1 className="mt-7 font-display text-[clamp(3.4rem,11.5vw,10.5rem)] font-bold leading-[0.92] tracking-[-0.03em] text-cream">
          <LineMask delay={0.28}>SAY ANYTHING.</LineMask>
          <LineMask delay={0.4}>
            <span>
              LEAVE <span className="text-lime">NOTHING</span>
              <span className="text-coral">.</span>
            </span>
          </LineMask>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.75, ease: EASE }}
          className="mt-8 max-w-xl text-balance text-base leading-relaxed text-cream/60 md:text-lg"
        >
          Veil drops you into rooms with strangers and keeps no record of what
          was said. No account. No history. No you — just words, until they
          burn.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.9, ease: EASE }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Magnetic>
            <button
              type="button"
              onClick={openChat}
              className="group inline-flex items-center gap-3 rounded-full bg-lime px-8 py-4 font-tech text-sm tracking-[0.15em] text-ink shadow-[0_0_44px_-8px_rgba(217,244,80,0.5)] transition-all duration-300 hover:shadow-[0_0_64px_-6px_rgba(217,244,80,0.7)]"
            >
              ENTER A ROOM
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </Magnetic>
          <Magnetic>
            <a
              href="#demo"
              className="inline-flex items-center gap-3 rounded-full border border-cream/20 px-8 py-4 font-tech text-sm tracking-[0.15em] text-cream/80 transition-colors duration-300 hover:border-cream/50 hover:text-cream"
            >
              WATCH IT BURN
            </a>
          </Magnetic>
        </motion.div>
      </div>

      {/* bottom meta row */}
      <div className="relative z-20 grid grid-cols-2 items-end px-5 pb-7 font-tech text-[9px] tracking-[0.28em] text-cream/35 md:grid-cols-3 md:px-10">
        <span>V0.5.0 — CIPHERS &amp; GAMES</span>
        <div className="hidden flex-col items-center gap-2 md:flex">
          <span>SCROLL TO DISAPPEAR</span>
          <span className="relative block h-10 w-px overflow-hidden bg-cream/15">
            <motion.span
              className="absolute left-0 top-0 h-3 w-px bg-lime"
              animate={{ y: [-12, 40] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeIn" }}
            />
          </span>
        </div>
        <span className="text-right">[ NO SIGNAL ]</span>
      </div>
    </section>
  );
}
