"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
} from "framer-motion";
import { Menu, X } from "lucide-react";
import { useSectionTheme } from "./scroll-bg";
import { useChat } from "@/lib/chat-store";
import { GhostMark } from "./ghost";
import Magnetic from "./magnetic";
import { EASE } from "./reveal";

const LINKS = [
  { href: "#features", label: "FEATURES" },
  { href: "#how", label: "HOW IT WORKS" },
  { href: "#demo", label: "LIVE DEMO" },
  { href: "#faq", label: "FAQ" },
];

export default function Nav() {
  const theme = useSectionTheme();
  const openChat = useChat((s) => s.openChat);
  const dark = theme === "dark";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.4,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const textCls = dark ? "text-cream" : "text-ink";
  const barCls = scrolled
    ? dark
      ? "border-cream/10 bg-ink/55"
      : "border-ink/10 bg-cream/55"
    : "border-transparent bg-transparent";

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50">
        {/* scroll progress */}
        <motion.div
          aria-hidden
          className={`h-[2px] w-full origin-left ${
            dark ? "bg-lime" : "bg-ink"
          }`}
          style={{ scaleX: progress }}
        />
        <div
          className={`border-b backdrop-blur-md transition-colors duration-500 ${barCls}`}
        >
          <nav className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 md:px-10">
            {/* logo */}
            <a
              href="#top"
              className={`group flex items-center gap-2.5 transition-colors duration-500 ${textCls}`}
              aria-label="Veil — back to top"
            >
              <GhostMark
                className={`h-7 w-7 transition-colors duration-500 ${
                  dark ? "text-lime" : "text-ink"
                }`}
              />
              <span className="font-display text-lg font-bold tracking-tight">
                VEIL<span className="text-coral">.</span>
              </span>
            </a>

            {/* desktop links */}
            <div
              className={`hidden items-center gap-8 transition-colors duration-500 md:flex ${textCls}`}
            >
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="font-tech text-[11px] tracking-[0.22em] opacity-60 transition-all duration-300 hover:-translate-y-0.5 hover:opacity-100"
                >
                  {l.label}
                </a>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-3">
              <Magnetic strength={0.25} className="hidden md:block">
                <button
                  type="button"
                  onClick={openChat}
                  className={`inline-block rounded-full border px-5 py-2 font-tech text-[11px] tracking-[0.22em] transition-colors duration-500 ${
                    dark
                      ? "border-cream/25 text-cream hover:bg-cream hover:text-ink"
                      : "border-ink/30 text-ink hover:bg-ink hover:text-cream"
                  }`}
                >
                  ENTER A ROOM
                </button>
              </Magnetic>

              {/* mobile trigger */}
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
                className={`grid h-10 w-10 place-items-center rounded-full border transition-colors duration-500 md:hidden ${
                  dark
                    ? "border-cream/25 text-cream"
                    : "border-ink/30 text-ink"
                }`}
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* mobile overlay menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[90] flex flex-col bg-ink text-cream"
            initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <div className="flex h-16 items-center justify-between px-5">
              <div className="flex items-center gap-2.5">
                <GhostMark className="h-7 w-7 text-lime" />
                <span className="font-display text-lg font-bold tracking-tight">
                  VEIL<span className="text-coral">.</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-10 w-10 place-items-center rounded-full border border-cream/25"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col justify-center gap-2 px-8">
              {LINKS.map((l, i) => (
                <motion.a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-cream/10 py-4 font-display text-4xl font-bold tracking-tight text-cream/90 transition-colors hover:text-lime"
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: EASE }}
                >
                  <span className="mr-4 font-tech text-xs text-lime">
                    0{i + 1}
                  </span>
                  {l.label}
                </motion.a>
              ))}
              <motion.button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openChat();
                }}
                className="mt-8 inline-flex w-fit items-center gap-3 rounded-full bg-lime px-7 py-3.5 font-tech text-xs tracking-[0.2em] text-ink"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.5, ease: EASE }}
              >
                ENTER A ROOM
              </motion.button>
            </div>

            <p className="px-8 pb-8 font-tech text-[10px] tracking-[0.25em] text-cream/35">
              NO EMAIL · NO NAME · NO TRACE
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
