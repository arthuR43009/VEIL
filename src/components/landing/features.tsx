"use client";

import { motion } from "framer-motion";
import {
  EyeOff,
  Flame,
  Ghost,
  Lock,
  Shuffle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SECTION_COLORS } from "./scroll-bg";
import { EASE, LineMask, MonoTag, Reveal } from "./reveal";

type Feature = {
  icon: LucideIcon;
  title: string;
  desc: string;
  accent?: "lime" | "coral";
};

const FEATURES: Feature[] = [
  {
    icon: Ghost,
    title: "Ghost identities",
    desc: "Every session mints a throwaway handle like ghost_4f2a. No email, no phone number, no breadcrumbs leading back to you.",
    accent: "lime",
  },
  {
    icon: Flame,
    title: "Vanishing messages",
    desc: "Set a fuse from 30 seconds to 24 hours. When it hits zero, the message burns on every device at once — including the server.",
    accent: "coral",
  },
  {
    icon: Lock,
    title: "End-to-end encrypted",
    desc: "Keys are minted inside your tab and never leave it. Relays shuffle ciphertext; nobody in the middle reads a word.",
    accent: "lime",
  },
  {
    icon: Zap,
    title: "Instant rooms",
    desc: "No signup flow, no waiting room. Share a link or slip in through random pairing and you're talking in under five seconds.",
    accent: "lime",
  },
  {
    icon: Shuffle,
    title: "Smart pairing",
    desc: "Get matched by mood and interest tags — music, 3am thoughts, confessions — without revealing a single thing about yourself.",
    accent: "lime",
  },
  {
    icon: EyeOff,
    title: "Zero logs",
    desc: "Nothing is ever written to disk. No content analytics, no metadata retention, no \u201canonymized\u201d telemetry sold as virtue.",
    accent: "lime",
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;
  return (
    <motion.article
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.8, delay: (index % 3) * 0.09, ease: EASE }}
      className="group relative flex min-h-[250px] flex-col overflow-hidden rounded-2xl border border-ink/12 p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-ink hover:bg-ink md:p-7"
    >
      <div className="flex items-start justify-between">
        <span
          className={`grid h-12 w-12 place-items-center rounded-xl transition-colors duration-300 ${
            feature.accent === "coral"
              ? "bg-coral text-cream"
              : "bg-lime text-ink"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <span className="font-tech text-xs text-ink/30 transition-colors duration-300 group-hover:text-cream/30">
          /0{index + 1}
        </span>
      </div>

      <h3 className="mt-auto pt-10 font-display text-2xl font-semibold tracking-tight text-ink transition-colors duration-300 group-hover:text-cream">
        {feature.title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-ink/55 transition-colors duration-300 group-hover:text-cream/60">
        {feature.desc}
      </p>
    </motion.article>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      data-bg={SECTION_COLORS.cream}
      data-theme="light"
      className="relative py-24 md:py-36"
    >
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <header className="mb-14 flex flex-col justify-between gap-8 md:mb-20 md:flex-row md:items-end">
          <div>
            <Reveal>
              <MonoTag className="text-ink/40">01 — WHY VEIL</MonoTag>
            </Reveal>
            <h2 className="mt-6 font-display text-[clamp(2.6rem,6.5vw,5.8rem)] font-bold leading-[0.95] tracking-[-0.03em] text-ink">
              <LineMask delay={0.1}>EVERYTHING YOU NEED.</LineMask>
              <LineMask delay={0.2}>
                <span className="text-stroke-ink">NOTHING THAT STAYS.</span>
              </LineMask>
            </h2>
          </div>
          <Reveal delay={0.25} className="max-w-xs">
            <p className="text-sm leading-relaxed text-ink/55">
              Most chat apps hoard your words forever. Veil is built like the
              opposite of a diary — a place engineered to forget you the moment
              you leave.
            </p>
          </Reveal>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
