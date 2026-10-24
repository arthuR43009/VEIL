"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SECTION_COLORS } from "./scroll-bg";
import { LineMask, MonoTag, Reveal } from "./reveal";

const FAQS = [
  {
    q: "Is Veil actually anonymous?",
    a: "Yes — by design, not by policy. There is no account to create, no email to verify, no phone number to hand over. Every session generates a fresh ghost identity and a one-time keypair. When the session ends, that identity is gone forever, and nothing links it to the next one.",
  },
  {
    q: "What happens to my messages?",
    a: "They are relayed end-to-end encrypted through RAM-only servers and destroyed the moment they are delivered or their fuse expires — whichever comes first. Nothing is written to disk. When a room empties, the room itself ceases to exist. There is no archive to breach, subpoena, or sell.",
  },
  {
    q: "Can someone trace me?",
    a: "Veil strips IPs and metadata at the edge and stores nothing that could connect a conversation to a person. The honest caveat: your opsec is still your responsibility. Never share personal details, names, or locations in any anonymous space — including this one.",
  },
  {
    q: "How is this different from Discord or Telegram?",
    a: "Those platforms anchor you to a persistent identity and retain message history, metadata, and logs. Veil is the structural opposite: identity is disposable, history is nonexistent, and the entire system is engineered so that even we could not tell you what was said five minutes ago.",
  },
  {
    q: "What does it cost?",
    a: "Core chat — rooms, pairing, vanishing messages — is free forever. No ads, no data brokerage, no \u201cpremium\u201d surveillance tier. If a sustainable model is ever needed, it will fund infrastructure, not ingestion of your words.",
  },
];

export default function Faq() {
  return (
    <section
      id="faq"
      data-bg={SECTION_COLORS.cream}
      data-theme="light"
      className="relative py-24 md:py-36"
    >
      <div className="mx-auto max-w-4xl px-5 md:px-10">
        <header className="mb-12 text-center md:mb-16">
          <Reveal>
            <MonoTag className="text-ink/40">05 — QUESTIONS</MonoTag>
          </Reveal>
          <h2 className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-ink">
            <LineMask delay={0.1}>ASK US ANYTHING.</LineMask>
            <LineMask delay={0.2}>
              <span className="text-stroke-ink">WE&rsquo;RE NOT RECORDING.</span>
            </LineMask>
          </h2>
        </header>

        <Reveal delay={0.15}>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={f.q}
                value={`item-${i}`}
                className="border-ink/12"
              >
                <AccordionTrigger className="py-6 font-display text-lg font-semibold tracking-tight text-ink hover:no-underline hover:text-ink/60 md:text-xl [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-ink/50">
                  <span className="pr-4">
                    <span className="mr-3 font-tech text-xs text-ink/35">
                      0{i + 1}
                    </span>
                    {f.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-7 text-base leading-relaxed text-ink/60">
                  <span className="block max-w-2xl">{f.a}</span>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
