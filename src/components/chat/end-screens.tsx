"use client";

/**
 * EndScreen — the aftermath (v5).
 *
 * BURNED (you torched it), PARTNER-LEFT (they vanished or moved on),
 * LOST (the void swallowed the wire). Conversations that actually
 * happened leave the recap card: how long, how many words, how many
 * reactions — and the promise that none of it was saved. The card
 * copies out as a one-line whisper, which is the whole marketing plan.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, Copy, LogOut, Share2 } from "lucide-react";
import { useChat, type Phase, type SessionStats } from "@/lib/chat-store";
import { MonoTag, EASE } from "@/components/landing/reveal";

const COPY: Record<
  "burned" | "partner-left" | "lost" | "banned",
  { word: string; sub: string }
> = {
  burned: {
    word: "BURNED.",
    sub: "ASHES ONLY. NOT EVEN WE KNOW WHAT WAS SAID.",
  },
  "partner-left": {
    word: "VANISHED.",
    sub: "THE STRANGER SLIPPED BACK INTO THE VOID. THIS CONVERSATION NO LONGER EXISTS.",
  },
  lost: {
    word: "SIGNAL LOST.",
    sub: "THE VOID SWALLOWED YOUR CONNECTION. NOTHING WAS LEFT BEHIND.",
  },
  banned: {
    word: "EXILED.",
    sub: "THE KEEPERS CLOSED THE DOORS ON THIS MASK.",
  },
};

/* ── the recap card — counts only, shareable by design ──── */

function recapLines(s: SessionStats): { mins: string; msgs: number; reacts: number } {
  const end = s.endedAt ?? Date.now();
  const secs = Math.max(1, Math.round((end - s.startedAt) / 1000));
  const mins =
    secs < 60
      ? `${secs} SECONDS`
      : secs < 3600
        ? `${Math.floor(secs / 60)} MINUTE${Math.floor(secs / 60) === 1 ? "" : "S"}`
        : `${Math.floor(secs / 3600)}H ${Math.floor((secs % 3600) / 60)}M`;
  return { mins, msgs: s.myMsgs + s.theirMsgs, reacts: s.reacts };
}

function RecapCard({ session }: { session: SessionStats }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const { mins, msgs, reacts } = recapLines(session);

  const text = `I SPOKE TO A STRANGER FOR ${mins} ON VEIL.\n${msgs} MESSAGES · ${reacts} REACTIONS · NOTHING SAVED.\nSAY ANYTHING. LEAVE NOTHING. — veil`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard refused — the void keeps its secrets */
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "VEIL", text });
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      } catch {
        /* they backed out — fine */
      }
    } else {
      copy();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.35, ease: EASE }}
      className="mt-9 w-full max-w-sm rounded-2xl border border-dashed border-cream/25 bg-ink-2/70 px-6 py-6 text-left"
      role="status"
    >
      <div className="flex items-center justify-between">
        <p className="font-tech text-[9px] tracking-[0.28em] text-coral/80">RECIEPT FROM THE VOID</p>
        <p className="font-tech text-[9px] tracking-[0.2em] text-cream/40">Nº {String(Math.abs(session.startedAt) % 9973).padStart(4, "0")}</p>
      </div>

      <p className="mt-4 font-display text-xl font-bold leading-snug tracking-tight">
        THIS CONVERSATION NEVER EXISTED.
      </p>

      <dl className="mt-5 space-y-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-tech text-[9px] tracking-[0.2em] text-cream/45">YOU SPOKE FOR</dt>
          <dd className="font-display text-sm font-bold tracking-wide text-lime">{mins}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-tech text-[9px] tracking-[0.2em] text-cream/45">WORDS IN THE ROOM</dt>
          <dd className="font-display text-sm font-bold tracking-wide">{msgs}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-tech text-[9px] tracking-[0.2em] text-cream/45">REACTIONS EXCHANGED</dt>
          <dd className="font-display text-sm font-bold tracking-wide">{reacts}</dd>
        </div>
        {session.tags.length > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-tech text-[9px] tracking-[0.2em] text-cream/45">FUSED ON</dt>
            <dd className="truncate font-display text-sm font-bold tracking-wide text-lime">{session.tags.join(" · ")}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 border-t border-dashed border-cream/15 pt-4">
        <p className="text-center font-tech text-[9px] leading-relaxed tracking-[0.22em] text-cream/45">
          NOTHING SAVED · NOTHING REMEMBERS · NOT EVEN US
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={copy}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-cream/25 px-4 py-2.5 font-tech text-[9px] font-medium tracking-[0.18em] text-cream/75 transition-colors duration-300 hover:border-lime/60 hover:text-lime"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-lime" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "COPIED." : "COPY RECAP"}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={share}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-lime px-4 py-2.5 font-tech text-[9px] font-medium tracking-[0.18em] text-ink transition-all duration-300 hover:brightness-110"
        >
          {shared ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {shared ? "SHARED." : "WHISPER IT"}
        </motion.button>
      </div>
    </motion.div>
  );
}

export function EndScreen({ phase }: { phase: Phase }) {
  const key = phase as "burned" | "partner-left" | "lost" | "banned";
  const { word, sub } = COPY[key];
  const startFuse = useChat((s) => s.startFuse);
  const toLobby = useChat((s) => s.toLobby);
  const closeChat = useChat((s) => s.closeChat);
  const notice = useChat((s) => s.notice);
  const session = useChat((s) => s.session);

  /* banned: count down to the doors reopening */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (phase !== "banned" || !notice?.until) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [phase, notice?.until]);

  const reopenIn = (until?: number): string | null => {
    if (!until) return null;
    const ms = until - Date.now();
    if (ms <= 0) return "ANY MOMENT.";
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}H ${m}M.` : `${m}M.`;
  };

  const bannedSub =
    phase === "banned"
      ? `${sub}${notice?.until ? ` THE DOORS REOPEN IN ${reopenIn(notice.until) ?? ""}` : ""}`
      : sub;

  const showRecap = (phase === "burned" || phase === "partner-left") && !!session && (session.myMsgs + session.theirMsgs) > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex flex-col items-center"
      >
        <MonoTag className="text-coral/80">11 — AFTERMATH</MonoTag>

        {/* drifting ash */}
        <div className="relative mt-10 h-16 w-40" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="absolute h-1 w-1 rounded-full bg-coral/70"
              style={{ left: `${18 + i * 16}%`, top: "50%" }}
              animate={{ y: [0, -34 - i * 6], x: [0, (i % 2 ? 1 : -1) * (6 + i * 2)], opacity: [0.8, 0] }}
              transition={{ duration: 2.2 + i * 0.3, repeat: Infinity, delay: i * 0.35, ease: "easeOut" }}
            />
          ))}
        </div>

        <h2 className="text-stroke-cream font-display text-[clamp(3.2rem,12vw,8rem)] font-bold leading-[0.9] tracking-[-0.03em]">
          {word}
        </h2>

        <p className="mt-6 max-w-sm font-tech text-[10px] leading-relaxed tracking-[0.24em] text-cream/45">
          {bannedSub}
        </p>

        {/* v5: the receipt — this conversation never existed, and here's the proof */}
        <AnimatePresence>{showRecap && session && <RecapCard key="recap" session={session} />}</AnimatePresence>

        {phase === "banned" ? (
          /* exiled masks get one road: out */
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={closeChat}
              className="inline-flex items-center gap-2.5 rounded-full border border-coral/50 px-7 py-3 font-tech text-[11px] tracking-[0.22em] text-coral transition-all duration-300 hover:bg-coral hover:text-ink active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              ACCEPT AND EXIT
            </button>
          </div>
        ) : (
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <motion.button
              type="button"
              onClick={startFuse}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-2.5 rounded-full bg-lime px-7 py-3 font-tech text-[11px] font-medium tracking-[0.22em] text-ink shadow-[0_14px_34px_-10px_rgba(217,244,80,0.45)] transition-all duration-300 hover:scale-[1.03]"
            >
              FUSE AGAIN
              <ArrowUpRight className="h-3.5 w-3.5" />
            </motion.button>
            <button
              type="button"
              onClick={toLobby}
              className="inline-flex items-center gap-2.5 rounded-full border border-cream/25 px-6 py-3 font-tech text-[11px] tracking-[0.22em] text-cream/75 transition-all duration-300 hover:border-lime/60 hover:text-lime active:scale-95"
            >
              BROWSE ROOMS
            </button>
            <button
              type="button"
              onClick={closeChat}
              className="inline-flex items-center gap-2 font-tech text-[11px] tracking-[0.22em] text-cream/40 underline-offset-4 transition-colors hover:text-coral hover:underline"
            >
              <LogOut className="h-3.5 w-3.5" />
              EXIT
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
