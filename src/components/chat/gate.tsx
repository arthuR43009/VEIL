"use client";

/**
 * Gate — the threshold (v5).
 *
 * First comes the rules screen: a one-time "I'm 18+ and I agree" step
 * (five plain-language rules, remembered per browser in localStorage —
 * no accounts, so the device itself is the only witness). Then the mask
 * picker: the server assigns an anonymous identity; reroll until it
 * feels right, then step in.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { useChat } from "@/lib/chat-store";
import { StrangerAvatar } from "./stranger-avatar";
import { GhostMark } from "@/components/landing/ghost";
import { MonoTag, EASE } from "@/components/landing/reveal";
import { MotionToggle } from "./motion-prefs";

const RULES_KEY = "veil.rules.v1";

/* the one-time ack lives in the device's memory — an external store we
 * read through useSyncExternalStore (hydration-safe, no effect-setState) */
const rulesAckStore = {
  subscribe: () => () => {},
  get: () => {
    try {
      return window.localStorage.getItem(RULES_KEY) === "yes";
    } catch {
      return false;
    }
  },
  server: () => false,
};

const RULES = [
  "I AM 18 OR OLDER — THE VEIL IS FOR ADULTS.",
  "I WON'T SHARE WHO I AM, AND I WON'T ASK — NO NAMES, NUMBERS, LINKS OR LOCATIONS.",
  "I WON'T HARASS, HUNT OR HARM ANYONE — NO HATE, NO PREDATION, NO EXCEPTIONS.",
  "I WILL REPORT ANY MASK THAT BREAKS THIS — THE KEEPERS LISTEN.",
  "I UNDERSTAND NOTHING IS SAVED — WHEN A ROOM BURNS, IT NEVER EXISTED.",
];

/* the one-time 18+ / rules threshold */
function RulesScreen({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="mt-10 w-full max-w-md text-left"
    >
      <p className="font-tech text-[10px] tracking-[0.3em] text-coral/80">BEFORE THE VEIL OPENS</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
        THE RULES OF THE VOID<span className="text-lime">.</span>
      </h2>

      <ul className="mt-7 space-y-3.5">
        {RULES.map((r, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.15 + i * 0.09, ease: EASE }}
            className="flex items-start gap-3 rounded-xl border border-cream/10 bg-ink-2/60 px-4 py-3"
          >
            <span className="mt-0.5 font-tech text-[10px] tracking-[0.2em] text-lime/70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-tech text-[10px] leading-relaxed tracking-[0.14em] text-cream/70">{r}</span>
          </motion.li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setChecked((v) => !v)}
        aria-pressed={checked}
        className="mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-cream/25 bg-ink/40 px-4 py-3.5 text-left transition-colors duration-200 hover:border-lime/50"
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all duration-200 ${
            checked ? "border-lime bg-lime text-ink" : "border-cream/30 text-transparent"
          }`}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <span className="font-tech text-[10px] leading-relaxed tracking-[0.16em] text-cream/75">
          I&apos;M 18+ AND I AGREE TO THE RULES OF THE VEIL
        </span>
      </button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={!checked}
        onClick={onAccept}
        className="mt-4 w-full rounded-full bg-lime py-3.5 font-tech text-[11px] font-medium tracking-[0.24em] text-ink shadow-[0_14px_34px_-10px_rgba(217,244,80,0.45)] transition-all duration-300 enabled:hover:scale-[1.02] disabled:opacity-35 disabled:shadow-none"
      >
        STEP THROUGH
      </motion.button>

      <div className="mt-5 flex items-center justify-between">
        <MotionToggle />
        <span className="font-tech text-[9px] tracking-[0.2em] text-cream/45">
          ASKED ONCE PER DEVICE. NO TRACE AFTER.
        </span>
      </div>
    </motion.div>
  );
}

/* keeper announcements — probation (dashed) or exile (solid) */
function NoticePanel() {
  const notice = useChat((s) => s.notice);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!notice?.until) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [notice?.until]);

  if (!notice) return null;

  const reopen = (() => {
    if (!notice.until) return null;
    const ms = notice.until - Date.now();
    if (ms <= 0) return "ANY MOMENT";
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}H ${m}M` : `${m}M`;
  })();

  const blocked = notice.code === "BLOCKED";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`mt-8 w-full max-w-md rounded-xl border px-5 py-4 text-left ${
        blocked
          ? "border-coral/60 bg-coral/10"
          : "border-dashed border-coral/40 bg-coral/5"
      }`}
      role="status"
    >
      <p className="font-tech text-[10px] leading-relaxed tracking-[0.2em] text-coral">
        ! {notice.message}
        {reopen ? ` THE DOORS REOPEN IN ${reopen}.` : ""}
      </p>
      {!blocked && (
        <p className="mt-2 font-tech text-[9px] leading-relaxed tracking-[0.18em] text-cream/55">
          PROBATION: SLOWER WORDS · NO REACTS · NO NEW DOORS. STILL NO TRACE.
        </p>
      )}
    </motion.div>
  );
}

export default function Gate() {
  const me = useChat((s) => s.me);
  const connected = useChat((s) => s.connected);
  const reroll = useChat((s) => s.reroll);
  const toLobby = useChat((s) => s.toLobby);
  const closeChat = useChat((s) => s.closeChat);

  /* the one-time rules ack — read from the device's memory, hydration-safe */
  const rulesAck = useSyncExternalStore(rulesAckStore.subscribe, rulesAckStore.get, rulesAckStore.server);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);

  const acceptRules = () => {
    try {
      window.localStorage.setItem(RULES_KEY, "yes");
    } catch {
      /* no storage — they'll see the rules again next time. fine. */
    }
    forceTick();
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8 text-center">
      <MonoTag className="text-lime/80">07 — THE GATE</MonoTag>

      {/* rules not yet acknowledged → the threshold comes first */}
      {!rulesAck ? (
        <>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="mt-6"
          >
            <GhostMark className="h-14 w-14 text-cream/70" eyeClass="fill-lime" />
          </motion.div>
          <RulesScreen onAccept={acceptRules} />
        </>
      ) : !me ? (
        /* connecting state */
        <div className="mt-14 flex flex-col items-center gap-6">
          <motion.div
            animate={{ y: [0, -12, 0], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <GhostMark className="h-16 w-16 text-cream/70" eyeClass="fill-lime" />
          </motion.div>
          <p className="font-tech text-xs tracking-[0.3em] text-cream/50">
            {connected ? "FORGING YOUR MASK" : "CONNECTING TO THE VOID"}
            <span className="blink-soft">…</span>
          </p>
        </div>
      ) : (
        <>
          {/* the mask */}
          <div className="relative mt-12">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 scale-150 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(217,244,80,0.16), transparent 65%)",
              }}
            />
            <AnimatePresence mode="popLayout">
              <motion.div
                key={me.seed}
                initial={{ scale: 0.55, rotate: -10, opacity: 0, filter: "blur(8px)" }}
                animate={{ scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ scale: 0.7, rotate: 8, opacity: 0, filter: "blur(8px)" }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
              >
                <StrangerAvatar
                  seed={me.seed}
                  className="h-36 w-36 shadow-[10px_10px_0_0_rgba(217,244,80,0.18)] md:h-44 md:w-44"
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="mt-10 font-tech text-[10px] tracking-[0.34em] text-cream/45">
            TONIGHT YOU ARE
          </p>
          <AnimatePresence mode="wait">
            <motion.h2
              key={me.handle}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28 }}
              className="mt-2 font-display text-3xl font-bold tracking-tight text-cream md:text-5xl"
            >
              {me.handle}
            </motion.h2>
          </AnimatePresence>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reroll}
              className="group inline-flex items-center gap-2.5 rounded-full border border-cream/25 px-6 py-3 font-tech text-[11px] tracking-[0.22em] text-cream/80 transition-all duration-300 hover:border-lime/60 hover:text-lime active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180" />
              REROLL MASK
            </button>
            <motion.button
              type="button"
              onClick={toLobby}
              whileTap={{ scale: 0.95 }}
              className="group inline-flex items-center gap-2.5 rounded-full bg-lime px-7 py-3 font-tech text-[11px] font-medium tracking-[0.22em] text-ink shadow-[0_14px_34px_-10px_rgba(217,244,80,0.45)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_18px_44px_-10px_rgba(217,244,80,0.55)]"
            >
              WEAR THIS MASK
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </motion.button>
          </div>

          <p className="mt-8 font-tech text-[10px] tracking-[0.3em] text-cream/35">
            NO EMAIL · NO NAME · NO TRACE
          </p>

          <div className="mt-5">
            <MotionToggle />
          </div>
        </>
      )}

      {/* keeper announcements at the door */}
      <NoticePanel />

      {/* exit hint */}
      <button
        type="button"
        onClick={closeChat}
        className="absolute right-5 top-5 font-tech text-[10px] tracking-[0.26em] text-cream/40 transition-colors hover:text-coral md:right-8 md:top-7"
      >
        ESC — BAIL
      </button>
    </div>
  );
}
