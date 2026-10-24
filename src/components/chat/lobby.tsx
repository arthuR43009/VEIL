"use client";

/**
 * Lobby — choose your door: FUSE (anonymous 1:1, tunable by interest
 * tags), a themed room, or a door another mask opened tonight.
 *
 * v5: doors grew up — open them with a password (the lobby shows the
 * lock), open them code-only (invisible here until someone speaks the
 * code), or open them on a fuse (30/60 minutes, then they torch
 * themselves). Rows preview the masks inside, tick down their burn
 * timers, and swing open with the same wipe the app itself uses.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  DoorOpen,
  Flame,
  Ghost,
  Lock,
  Plus,
  Timer,
  X,
} from "lucide-react";
import { Brain, Gamepad2, Moon, Music, Speech } from "lucide-react";
import { useChat } from "@/lib/chat-store";
import { StrangerAvatar } from "./stranger-avatar";
import { GhostDrift, useIdle } from "./ghost-drift";
import { MonoTag, EASE } from "@/components/landing/reveal";

const ROOM_ICONS: Record<string, typeof Ghost> = {
  void: Ghost,
  afterdark: Moon,
  confess: Speech,
  moshpit: Music,
  arcade: Gamepad2,
  deepend: Brain,
};

/* commonly-used interest tags — a tap instead of typing */
const SUGGESTED_TAGS = [
  "MUSIC",
  "GAMING",
  "ANIME",
  "LATE NIGHTS",
  "ART",
  "MOVIES",
  "BOOKS",
  "TECH",
  "TRAVEL",
  "FOOD",
  "MEMES",
  "DREAMS",
];
const MAX_TAGS = 3;

const normalizeTag = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);

/* ── interest tag picker (lives inside the FUSE card) ────── */

function TagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const full = selected.length >= MAX_TAGS;

  const toggle = (t: string) => {
    if (selected.includes(t)) return onChange(selected.filter((x) => x !== t));
    if (full) return;
    onChange([...selected, t]);
  };

  const submitCustom = () => {
    const t = normalizeTag(customText);
    if (t.length >= 2 && !full && !selected.includes(t)) onChange([...selected, t]);
    setCustomText("");
    setCustomMode(false);
  };

  const rest = SUGGESTED_TAGS.filter((t) => !selected.includes(t));

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <span className="font-tech text-[9px] tracking-[0.24em] text-cream/40">
          TUNE YOUR FUSE — OPTIONAL
        </span>
        <span
          className={`font-tech text-[9px] tracking-[0.2em] ${
            full ? "text-lime" : "text-cream/40"
          }`}
        >
          {selected.length}/{MAX_TAGS}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {selected.map((t) => (
          <motion.button
            key={`on-${t}`}
            type="button"
            layout
            whileTap={{ scale: 0.9 }}
            onClick={() => toggle(t)}
            className="rounded-full border border-lime bg-lime px-3 py-1.5 font-tech text-[10px] font-medium tracking-[0.16em] text-ink"
          >
            {t}
          </motion.button>
        ))}

        {rest.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            disabled={full}
            className={`rounded-full border px-3 py-1.5 font-tech text-[10px] tracking-[0.16em] transition-colors duration-200 ${
              full
                ? "cursor-not-allowed border-cream/10 text-cream/25"
                : "border-cream/20 text-cream/55 hover:border-lime/60 hover:text-lime"
            }`}
          >
            {t}
          </button>
        ))}

        {customMode ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-lime/60 px-3 py-1.5">
            <input
              autoFocus
              value={customText}
              onChange={(e) => setCustomText(e.target.value.slice(0, 24))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCustom();
                }
                if (e.key === "Escape") {
                  setCustomText("");
                  setCustomMode(false);
                }
              }}
              placeholder="2–18 CHARS"
              aria-label="Custom interest tag"
              className="w-28 bg-transparent font-tech text-[10px] tracking-[0.16em] text-lime placeholder:text-cream/25 outline-none"
            />
            <button
              type="button"
              onClick={submitCustom}
              className="font-tech text-[10px] tracking-[0.16em] text-lime transition-opacity hover:opacity-70"
            >
              ADD
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            disabled={full}
            className={`rounded-full border border-dashed px-3 py-1.5 font-tech text-[10px] tracking-[0.16em] transition-colors duration-200 ${
              full
                ? "cursor-not-allowed border-cream/10 text-cream/25"
                : "border-cream/25 text-cream/50 hover:border-lime/60 hover:text-lime"
            }`}
          >
            + CUSTOM TAG
          </button>
        )}
      </div>

      <p className="mt-2.5 font-tech text-[9px] leading-relaxed tracking-[0.18em] text-cream/35">
        {selected.length === 0
          ? "NO TAGS — YOU FUSE BY PURE CHANCE"
          : "SHARED TAGS FUSE FIRST · AFTER 20S ANY MASK WILL DO"}
      </p>
    </div>
  );
}

/* ── live typing chip (lobby liveliness) ────────────────── */

function TypingChip() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-lime/30 bg-lime/10 px-2.5 py-1"
    >
      <span className="flex gap-1">
        <span className="typing-dot h-1 w-1 rounded-full bg-lime" />
        <span className="typing-dot h-1 w-1 rounded-full bg-lime" />
        <span className="typing-dot h-1 w-1 rounded-full bg-lime" />
      </span>
      <span className="font-tech text-[9px] tracking-[0.18em] text-lime">TYPING</span>
    </span>
  );
}

/* ── occupant mask previews — the lobby's presence window ── */

function MaskPreview({ seeds, count }: { seeds?: string[]; count: number }) {
  if (!seeds || seeds.length === 0) return null;
  const show = seeds.slice(0, 4);
  const extra = count - show.length;
  return (
    <span className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
      {show.map((seed, i) => (
        <span key={`${seed}-${i}`} className="rounded-[30%] ring-2 ring-ink/90">
          <StrangerAvatar seed={seed} className="h-5 w-5" />
        </span>
      ))}
      {extra > 0 && (
        <span className="grid h-5 w-5 place-items-center rounded-[30%] bg-ink-3 font-tech text-[8px] text-cream/60 ring-2 ring-ink/90">
          +{extra}
        </span>
      )}
    </span>
  );
}

/* ── mm:ss burn countdown for timed doors ───────────────── */

const fmtBurn = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

function BurnChip({ burnIn }: { burnIn: number }) {
  const [anchor, setAnchor] = useState(burnIn);
  const [left, setLeft] = useState(burnIn);

  /* a fresh presence re-anchors the countdown (render-phase adjustment) */
  if (anchor !== burnIn) {
    setAnchor(burnIn);
    setLeft(burnIn);
  }

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [burnIn]);
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-coral/10 px-2.5 py-1 font-tech text-[9px] tracking-[0.12em] text-coral">
      <Timer className="h-3 w-3" />
      {fmtBurn(left)}
    </span>
  );
}

/* ── small segmented control (door options) ─────────────── */

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3 py-1.5 font-tech text-[9px] tracking-[0.16em] transition-colors duration-200 ${
            value === o.value
              ? "border-lime bg-lime text-ink"
              : "border-cream/20 text-cream/50 hover:border-lime/50 hover:text-lime"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── open-your-own-door form (v5: key · code · fuse) ────── */

function DoorForm() {
  const createRoom = useChat((s) => s.createRoom);
  const ratePulse = useChat((s) => s.ratePulse);
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState<"open" | "code">("open");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState<0 | 30 | 60>(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  /* surface the latest service error for a few beats */
  useEffect(() => {
    if (!ratePulse) return;
    const t = setTimeout(() => setDismissedAt(ratePulse.at), 3200);
    return () => clearTimeout(t);
  }, [ratePulse]);

  const errVisible = !!ratePulse && dismissedAt !== ratePulse.at;

  const clean = () =>
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const canCreate = clean().length >= 2;

  function submit() {
    if (!canCreate) return;
    createRoom(clean().slice(0, 24), {
      password: password.trim() || undefined,
      privacy,
      ttlMin: ttl,
    });
    setName("");
    setPassword("");
  }

  return (
    <div className="mt-5 rounded-xl border border-dashed border-cream/20 bg-ink/40 p-3.5">
      <p className="font-tech text-[9px] tracking-[0.24em] text-cream/40">
        OPEN YOUR OWN DOOR
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="name your door — 2 to 24 characters"
          aria-label="Name your door"
          className="min-w-0 flex-1 rounded-lg border border-cream/15 bg-ink px-3.5 py-2.5 font-tech text-[11px] uppercase tracking-[0.12em] text-cream outline-none transition-colors duration-300 placeholder:text-cream/30 focus:border-lime/60"
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={submit}
          disabled={!canCreate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-lime px-4 py-2.5 font-tech text-[10px] font-medium tracking-[0.18em] text-ink transition-all duration-300 enabled:hover:scale-[1.04] disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" />
          OPEN
        </motion.button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <div className="flex items-center gap-2">
          <span className="font-tech text-[9px] tracking-[0.18em] text-cream/40">WHO ENTERS</span>
          <Segmented
            ariaLabel="Door privacy"
            value={privacy}
            onChange={setPrivacy}
            options={[
              { value: "open" as const, label: "ANYONE" },
              { value: "code" as const, label: "CODE ONLY" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-tech text-[9px] tracking-[0.18em] text-cream/40">BURNS AFTER</span>
          <Segmented
            ariaLabel="Door lifetime"
            value={ttl}
            onChange={setTtl}
            options={[
              { value: 0 as const, label: "∞" },
              { value: 30 as const, label: "30M" },
              { value: 60 as const, label: "60M" },
            ]}
          />
        </div>
      </div>

      <input
        value={password}
        onChange={(e) => setPassword(e.target.value.slice(0, 24))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={privacy === "code" ? "speak a key — optional, on top of the code" : "speak a key — optional"}
        aria-label="Door password, optional"
        className="mt-3 w-full rounded-lg border border-dashed border-cream/20 bg-ink px-3.5 py-2.5 font-tech text-[11px] tracking-[0.1em] text-lime outline-none transition-colors duration-300 placeholder:text-cream/30 focus:border-lime/60"
      />

      {errVisible && ratePulse && (
        <p role="status" className="mt-2.5 font-tech text-[9px] tracking-[0.18em] text-coral">
          ! {ratePulse.message}
        </p>
      )}
      <p className="mt-2.5 font-tech text-[9px] leading-relaxed tracking-[0.16em] text-cream/40">
        EMPTY DOORS BURN THE MOMENT EVERYONE LEAVES. CODE-ONLY DOORS ARE INVISIBLE UNTIL SOMEONE SPEAKS THE CODE.
      </p>
    </div>
  );
}

/* ── speak a code, slip through an invisible door ───────── */

function CodeEntry() {
  const joinRoom = useChat((s) => s.joinRoom);
  const [code, setCode] = useState("");

  const submit = () => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    if (c.length < 4) return;
    joinRoom(c);
    setCode("");
  };

  return (
    <div className="mt-3 rounded-xl border border-dashed border-cream/20 bg-ink/40 p-3.5">
      <p className="font-tech text-[9px] tracking-[0.24em] text-cream/40">
        SOMEONE WHISPERED YOU A CODE?
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="6-CHARACTER DOOR CODE"
          aria-label="Door code"
          className="min-w-0 flex-1 rounded-lg border border-cream/15 bg-ink px-3.5 py-2.5 font-tech text-[11px] uppercase tracking-[0.34em] text-lime outline-none transition-colors duration-300 placeholder:text-cream/25 focus:border-lime/60"
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={submit}
          disabled={code.trim().length < 4}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-lime/60 px-4 py-2.5 font-tech text-[10px] font-medium tracking-[0.18em] text-lime transition-all duration-300 enabled:hover:bg-lime enabled:hover:text-ink disabled:opacity-35"
        >
          <DoorOpen className="h-3.5 w-3.5" />
          ENTER
        </motion.button>
      </div>
    </div>
  );
}

/* ── locked-door unlock sheet ───────────────────────────── */

function UnlockSheet() {
  const lockedDoor = useChat((s) => s.lockedDoor);
  const joinRoom = useChat((s) => s.joinRoom);
  const ratePulse = useChat((s) => s.ratePulse);
  const [key, setKey] = useState("");
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!ratePulse) return;
    const t = setTimeout(() => setDismissedAt(ratePulse.at), 2600);
    return () => clearTimeout(t);
  }, [ratePulse]);

  const open = !!lockedDoor;
  const errVisible = !!ratePulse && dismissedAt !== ratePulse.at;
  const close = () => useChat.setState({ lockedDoor: null });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="unlock-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Locked door"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative m-3 w-full max-w-sm rounded-2xl border border-cream/12 bg-ink-2 p-6 shadow-[0_28px_70px_-20px_rgba(0,0,0,0.85)] sm:m-0"
          >
            <div className="flex items-center justify-between">
              <p className="font-tech text-[9px] tracking-[0.26em] text-coral">THE DOOR IS LOCKED</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-full border border-cream/15 text-cream/60 transition-colors hover:border-coral/60 hover:text-coral"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-coral/40 bg-coral/10 text-coral">
                <Lock className="h-6 w-6" />
              </span>
            </div>

            <input
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value.slice(0, 24))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && key.trim()) {
                  e.preventDefault();
                  joinRoom(lockedDoor!.roomId, key.trim());
                }
              }}
              placeholder="speak the key"
              aria-label="Door key"
              className="mt-5 w-full rounded-lg border border-cream/15 bg-ink px-4 py-3 font-tech text-[11px] tracking-[0.2em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-coral/60"
            />

            {errVisible && ratePulse && (
              <p role="status" className="mt-3 font-tech text-[9px] tracking-[0.18em] text-coral">
                ! {ratePulse.message}
              </p>
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={!key.trim()}
              onClick={() => joinRoom(lockedDoor!.roomId, key.trim())}
              className="mt-5 w-full rounded-full bg-coral py-3 font-tech text-[11px] font-medium tracking-[0.22em] text-ink transition-all duration-300 enabled:hover:brightness-110 disabled:opacity-35"
            >
              UNLOCK
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── the lobby ──────────────────────────────────────────── */

export default function Lobby() {
  const me = useChat((s) => s.me);
  const presence = useChat((s) => s.presence);
  const roomTyping = useChat((s) => s.roomTyping);
  const doorBurns = useChat((s) => s.doorBurns);
  const startFuse = useChat((s) => s.startFuse);
  const setFuseTags = useChat((s) => s.setFuseTags);
  const joinRoom = useChat((s) => s.joinRoom);
  const reroll = useChat((s) => s.reroll);
  const closeChat = useChat((s) => s.closeChat);

  /** tag selection survives cancels and remounts (kept in the store) */
  const [selected, setSelected] = useState<string[]>(() => useChat.getState().fuseTags);
  const applyTags = (next: string[]) => {
    setSelected(next);
    setFuseTags(next);
  };

  const themed = presence.rooms.filter((r) => !r.custom);
  const doors = presence.rooms.filter((r) => r.custom && !doorBurns[r.id]);
  const burning = Object.entries(doorBurns).map(([id, snap]) => ({ id, ...snap }));

  /* the house ghost drifts through when nothing happens for a while */
  const idle = useIdle(28_000, [
    presence.online,
    presence.rooms.length,
    me?.handle ?? "",
    selected.length,
  ]);

  const tryJoin = (roomId: string, locked?: boolean) => {
    if (locked) {
      useChat.setState({ lockedDoor: { roomId } });
      return;
    }
    joinRoom(roomId);
  };

  return (
    <>
      <GhostDrift
        show={idle}
        label="THE VOID IS PATIENT. PICK A DOOR."
        className="fixed inset-0"
      />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-y-auto px-5 pb-10 pt-24 md:px-10 md:pt-28">
        {/* identity strip */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MonoTag className="text-lime/80">08 — CHOOSE YOUR DOOR</MonoTag>
          <div className="flex items-center gap-3 rounded-full border border-cream/12 bg-ink-2/70 py-1.5 pl-2 pr-4">
            {me && <StrangerAvatar seed={me.seed} className="h-7 w-7" />}
            <span className="max-w-[180px] truncate font-tech text-[10px] tracking-[0.2em] text-cream/70">
              {me?.handle}
            </span>
            <button
              type="button"
              onClick={reroll}
              className="font-tech text-[10px] tracking-[0.2em] text-lime/80 underline-offset-4 transition-colors hover:text-lime hover:underline"
            >
              CHANGE
            </button>
            <button
              type="button"
              onClick={closeChat}
              aria-label="Close and leave no trace"
              className="ml-1 grid h-7 w-7 place-items-center rounded-full border border-cream/15 text-cream/50 transition-colors duration-300 hover:border-coral/60 hover:text-coral"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-10 grid flex-1 content-start gap-5 md:grid-cols-2">
          {/* ── FUSE ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            className="group relative min-w-0 overflow-hidden rounded-2xl border border-cream/12 bg-ink-2/60 p-6 transition-colors duration-300 hover:border-lime/50 md:p-8"
          >
            <div
              aria-hidden
              className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime/10 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
              style={{ opacity: 0.35 }}
            />
            <div className="flex items-center justify-between">
              <MonoTag className="text-cream/45">1 : 1</MonoTag>
              <span className="relative flex h-2 w-2">
                <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-lime" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
              </span>
            </div>

            <h3 className="mt-6 font-display text-5xl font-bold tracking-tight md:text-6xl">
              FUSE
              <span className="text-coral">.</span>
            </h3>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-cream/55">
              One room. Two masks. Zero records. We pair you with a random
              stranger and burn the room when you&apos;re done.
            </p>

            <TagPicker selected={selected} onChange={applyTags} />

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <span className="font-tech text-[10px] tracking-[0.24em] text-cream/45">
                WAITING — {presence.waiting} · ONLINE — {presence.online}
              </span>
              <motion.button
                type="button"
                onClick={() => startFuse(selected)}
                whileTap={{ scale: 0.96 }}
                className="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 font-tech text-[10px] font-medium tracking-[0.22em] text-ink transition-transform duration-300 hover:scale-105"
              >
                START FUSING
                <ArrowUpRight className="h-3.5 w-3.5" />
              </motion.button>
            </div>
          </motion.div>

          {/* ── ROOMS ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
            className="min-w-0 rounded-2xl border border-cream/12 bg-ink-2/60 p-6 md:p-8"
          >
            <MonoTag className="text-cream/45">PUBLIC ROOMS</MonoTag>
            <h3 className="mt-6 font-display text-5xl font-bold tracking-tight md:text-6xl">
              ROOMS<span className="text-lime">.</span>
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-cream/55">
              Slip into a crowd of masks — or open a door of your own. Only
              people present can see the messages; leave and it&apos;s gone.
            </p>

            {/* themed doors */}
            <ul className="mt-7 space-y-2.5">
              {themed.map((r, i) => {
                const Icon = ROOM_ICONS[r.id] ?? Ghost;
                return (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, delay: 0.12 + i * 0.06, ease: EASE }}
                  >
                    <button
                      type="button"
                      onClick={() => tryJoin(r.id, r.lock)}
                      className="group flex w-full items-center gap-4 rounded-xl border border-cream/10 bg-ink/60 px-4 py-3.5 text-left transition-all duration-300 hover:border-lime/50 hover:bg-ink-3/80"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cream/10 bg-ink-2 text-cream/70 transition-colors group-hover:border-lime/40 group-hover:text-lime">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-sm font-bold tracking-wide">
                          {r.name}
                        </span>
                        <span className="mt-0.5 block truncate font-tech text-[9px] tracking-[0.18em] text-cream/40">
                          {r.tag}
                        </span>
                      </span>
                      <MaskPreview seeds={r.masks} count={r.count} />
                      {(roomTyping[r.id] ?? 0) > 0 && <TypingChip />}
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 font-tech text-[9px] tracking-[0.14em] ${
                          r.count > 0
                            ? "bg-lime/15 text-lime"
                            : "border border-cream/12 text-cream/40"
                        }`}
                      >
                        {r.count} IN
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-cream/30 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-lime" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>

            {/* doors opened tonight by other masks — and the ones burning away */}
            {(doors.length > 0 || burning.length > 0) && (
              <div className="mt-6">
                <p className="font-tech text-[9px] tracking-[0.28em] text-cream/40">
                  TONIGHT&apos;S DOORS — OPENED BY MASKS
                </p>
                <ul className="mt-3 space-y-2.5">
                  <AnimatePresence>
                    {doors.map((r) => (
                      <motion.li
                        key={r.id}
                        /* v5: doors swing open with the same wipe the app uses */
                        initial={{ opacity: 0, clipPath: "inset(50% 0% 50% 0%)" }}
                        animate={{ opacity: 1, clipPath: "inset(0% 0% 0% 0%)" }}
                        exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
                        transition={{ duration: 0.5, ease: EASE }}
                        className="relative"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-3 top-1/2 z-10 h-[2px] origin-left -translate-y-1/2 bg-lime"
                        >
                          <motion.span
                            className="block h-full w-full origin-left bg-lime"
                            initial={{ scaleX: 0, opacity: 1 }}
                            animate={{ scaleX: [0, 1, 1, 0], opacity: [1, 1, 0.85, 0] }}
                            transition={{ duration: 0.55, ease: EASE, times: [0, 0.4, 0.7, 1] }}
                          />
                        </span>
                        <button
                          type="button"
                          onClick={() => tryJoin(r.id, r.lock)}
                          className="group flex w-full items-center gap-4 rounded-xl border border-dashed border-cream/15 bg-ink/60 px-4 py-3.5 text-left transition-all duration-300 hover:border-lime/50 hover:bg-ink-3/80"
                        >
                          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-lime/25 bg-ink-2 text-lime">
                            {r.lock ? <Lock className="h-4 w-4" /> : <DoorOpen className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-sm font-bold tracking-wide">
                              {r.name}
                            </span>
                            <span className="mt-0.5 block truncate font-tech text-[9px] tracking-[0.18em] text-cream/40">
                              {r.tag}
                            </span>
                          </span>
                          <MaskPreview seeds={r.masks} count={r.count} />
                          {typeof r.burnIn === "number" && r.burnIn > 0 && <BurnChip burnIn={r.burnIn} />}
                          {(roomTyping[r.id] ?? 0) > 0 && <TypingChip />}
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 font-tech text-[9px] tracking-[0.14em] ${
                              r.count > 0
                                ? "bg-lime/15 text-lime"
                                : "border border-cream/12 text-cream/40"
                            }`}
                          >
                            {r.count} IN
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-cream/30 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-lime" />
                        </button>
                      </motion.li>
                    ))}

                    {/* doors burning away — empty doors die in flames, not silence */}
                    {burning.map((d) => (
                      <motion.li
                        key={`burn-${d.id}`}
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
                        transition={{ duration: 0.6, ease: EASE }}
                        className="pointer-events-none list-none"
                      >
                        <div
                          aria-live="polite"
                          className="flex w-full items-center gap-4 rounded-xl border border-dashed border-coral/40 bg-coral/5 px-4 py-3.5"
                        >
                          <span className="grid h-9 w-9 shrink-0 animate-pulse place-items-center rounded-lg border border-coral/40 bg-ink-2 text-coral">
                            <Flame className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-sm font-bold tracking-wide text-coral/90">
                              {d.name}
                            </span>
                            <span className="mt-0.5 block truncate font-tech text-[9px] tracking-[0.18em] text-coral/60">
                              THE DOOR BURNED. NOBODY REMEMBERS IT EXISTED.
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-coral/15 px-2.5 py-1 font-tech text-[9px] tracking-[0.14em] text-coral">
                            BURNED
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            )}

            <DoorForm />
            <CodeEntry />
          </motion.div>
        </div>

        <p className="mt-8 text-center font-tech text-[10px] tracking-[0.3em] text-cream/30">
          LEAVE ANYTIME — NOTHING FOLLOWS YOU OUT
        </p>
      </div>

      <UnlockSheet />
    </>
  );
}
