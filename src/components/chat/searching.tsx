"use client";

/**
 * Searching — the fuse radar (v5: it also counts down the NEXT MASK
 * cooldown). Concentric rings + a sweeping beam while the server hunts
 * for another mask to pair with — or a held breath after a skip, while
 * the void decides you've waited long enough.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SkipForward, X } from "lucide-react";
import { useChat } from "@/lib/chat-store";
import { StrangerAvatar } from "./stranger-avatar";
import { MonoTag } from "@/components/landing/reveal";

export default function Searching() {
  const me = useChat((s) => s.me);
  const queueWaiting = useChat((s) => s.queueWaiting);
  const presence = useChat((s) => s.presence);
  const fuseTags = useChat((s) => s.fuseTags);
  const cancelFuse = useChat((s) => s.cancelFuse);
  const startFuse = useChat((s) => s.startFuse);
  const skipCooldownUntil = useChat((s) => s.skipCooldownUntil);

  const cooling = skipCooldownUntil > Date.now();
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((skipCooldownUntil - Date.now()) / 1000)));
  const firedRef = useRef(false);

  /* count the cooldown down; when it hits zero, rejoin the queue once */
  useEffect(() => {
    firedRef.current = false;
    if (skipCooldownUntil <= Date.now()) {
      setLeft(0);
      return;
    }
    const t = setInterval(() => {
      const secs = Math.max(0, Math.ceil((skipCooldownUntil - Date.now()) / 1000));
      setLeft(secs);
      if (secs <= 0) {
        clearInterval(t);
        if (!firedRef.current) {
          firedRef.current = true;
          /* a small grace so the server's clock agrees with ours */
          setTimeout(() => {
            if (useChat.getState().phase === "searching") startFuse();
          }, 450);
        }
      }
    }, 200);
    return () => clearInterval(t);
  }, [skipCooldownUntil]);

  const onCooldown = cooling && left > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 text-center">
      <MonoTag className="text-lime/80">09 — SCANNING</MonoTag>

      {/* radar */}
      <div className={`relative mt-12 h-60 w-60 md:h-72 md:w-72 ${onCooldown ? "opacity-50" : ""}`} aria-hidden>
        {/* rings */}
        <div className="absolute inset-0 rounded-full border border-cream/12" />
        <div className="absolute inset-[16.6%] rounded-full border border-cream/10" />
        <div className="absolute inset-[33.2%] rounded-full border border-cream/10" />
        {/* crosshair */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cream/8" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cream/8" />
        {/* sweep */}
        <div
          className="radar-sweep absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(217,244,80,0.4), rgba(217,244,80,0.08) 55deg, transparent 80deg)",
          }}
        />
        {/* target blips */}
        <motion.span
          className="absolute left-[22%] top-[30%] h-1.5 w-1.5 rounded-full bg-coral"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, delay: 0.4 }}
        />
        <motion.span
          className="absolute right-[18%] top-[58%] h-1.5 w-1.5 rounded-full bg-cream"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, delay: 1.5 }}
        />
        {/* me at the center */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="ping-soft absolute inset-0 -m-1 rounded-full bg-lime/40" aria-hidden />
          {me && (
            <StrangerAvatar
              seed={me.seed}
              className="relative h-14 w-14 border-2 border-lime/60 md:h-16 md:w-16"
            />
          )}
        </div>
      </div>

      {onCooldown ? (
        <>
          <h2 className="mt-14 flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-4xl">
            <SkipForward className="h-6 w-6 text-lime md:h-8 md:w-8" />
            BREATHE<span className="blink-soft text-lime">…</span>
          </h2>
          <p className="mt-4 font-tech text-[10px] tracking-[0.28em] text-cream/55">
            THE NEXT MASK OPENS ITS EYES IN {left}S
          </p>
          <p className="mt-2 font-tech text-[9px] tracking-[0.22em] text-cream/35">
            SKIPPING HAS A PRICE. THE VOID SETS IT.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-14 font-display text-2xl font-bold tracking-tight md:text-4xl">
            SCANNING THE VOID<span className="blink-soft text-lime">…</span>
          </h2>

          {/* what we're hunting by */}
          {fuseTags.length > 0 ? (
            <div className="mt-5 flex max-w-md flex-wrap justify-center gap-1.5 px-2">
              {fuseTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-lime/50 bg-lime/10 px-3 py-1.5 font-tech text-[10px] tracking-[0.16em] text-lime"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-4 font-tech text-[10px] tracking-[0.28em] text-cream/45">
              MODE — PURE CHANCE · ANY MASK WILL DO
            </p>
          )}

          <p className="mt-5 font-tech text-[10px] tracking-[0.28em] text-cream/45">
            MASKS WAITING — {queueWaiting} · ONLINE — {presence.online}
          </p>
          <p className="mt-2 font-tech text-[10px] tracking-[0.28em] text-cream/35">
            KEEP THIS TAB OPEN. A STRANGER IS ONE SECOND AWAY.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={cancelFuse}
        className="mt-10 inline-flex items-center gap-2 rounded-full border border-cream/25 px-6 py-3 font-tech text-[11px] tracking-[0.22em] text-cream/70 transition-all duration-300 hover:border-coral/60 hover:text-coral active:scale-95"
      >
        <X className="h-3.5 w-3.5" />
        CANCEL SEARCH
      </button>
    </div>
  );
}
