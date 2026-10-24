"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useFinePointer } from "@/hooks/use-media-query";
import { useChat } from "@/lib/chat-store";
import { SECTION_COLORS } from "./scroll-bg";
import { GhostMark } from "./ghost";
import { LineMask, MonoTag, Reveal } from "./reveal";
import Magnetic from "./magnetic";

export default function Cta() {
  const openChat = useChat((s) => s.openChat);
  const draggable = useFinePointer();

  return (
    <section
      id="start"
      data-bg={SECTION_COLORS.lime}
      data-theme="lime"
      className="relative overflow-hidden py-28 md:py-44"
    >
      {/* faint dot grid on lime */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(14,14,19,0.14) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* draggable ghost buddy */}
      <motion.div
        className="absolute bottom-[14%] right-[7%] z-10 hidden lg:block"
        initial={{ opacity: 0, scale: 0.5 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.5 }}
      >
        <motion.div
          drag={draggable}
          dragSnapToOrigin
          dragElastic={0.3}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 18 }}
          whileDrag={{ scale: 1.15, rotate: 8 }}
          whileHover={{ scale: 1.08 }}
          animate={{ y: [0, -10, 0], rotate: [0, -3, 0] }}
          transition={{
            y: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" },
          }}
          className="cursor-grab touch-none select-none active:cursor-grabbing"
          aria-hidden
        >
          <GhostMark className="h-24 w-24 text-ink drop-shadow-[0_14px_24px_rgba(14,14,19,0.25)]" eyeClass="fill-lime" />
          <span className="mt-2 block text-center font-tech text-[8px] uppercase tracking-[0.28em] text-ink/45">
            drag me
          </span>
        </motion.div>
      </motion.div>

      <div className="relative z-20 mx-auto max-w-5xl px-5 text-center text-ink md:px-10">
        <Reveal>
          <MonoTag className="text-ink/50">06 — NO TIME LIKE NOW</MonoTag>
        </Reveal>

        <h2 className="mt-7 font-display text-[clamp(3rem,10vw,8.6rem)] font-bold leading-[0.9] tracking-[-0.03em]">
          <LineMask delay={0.1}>READY TO</LineMask>
          <LineMask delay={0.22}>
            <span className="text-stroke-ink">DISAPPEAR?</span>
          </LineMask>
        </h2>

        <Reveal delay={0.3}>
          <p className="mx-auto mt-8 max-w-md text-ink/60">
            One click. One room. One conversation that never happened.
          </p>
        </Reveal>

        <Reveal delay={0.4}>
          <Magnetic className="mt-11 inline-block" strength={0.3}>
            <button
              type="button"
              onClick={openChat}
              className="group inline-flex items-center gap-3 rounded-full bg-ink px-9 py-4.5 font-tech text-sm tracking-[0.15em] text-cream shadow-[0_18px_44px_-14px_rgba(14,14,19,0.5)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_24px_54px_-14px_rgba(14,14,19,0.6)] active:scale-95"
            >
              <GhostMark className="h-5 w-5 text-lime" eyeClass="fill-ink" />
              ENTER A ROOM
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </Magnetic>
        </Reveal>

        <Reveal delay={0.5}>
          <p className="mt-7 font-tech text-[10px] tracking-[0.28em] text-ink/45">
            NO EMAIL · NO NAME · NO TRACE
          </p>
        </Reveal>
      </div>
    </section>
  );
}
