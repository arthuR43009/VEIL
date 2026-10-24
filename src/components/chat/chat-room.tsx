"use client";

/**
 * ChatRoom — the live conversation (v5).
 *
 * Springs stay, but everything got a fifth gear: grouped bubbles with a
 * soft appear and a read shimmer, a ghost that drifts while the other
 * mask types, per-room atmosphere (tint, pattern, avatar frames —
 * AFTER DARK is dim and starred, the MOSH PIT runs an equalizer), the
 * SPARK / GAMES / HANDSHAKE tool row, NEXT MASK with its cooldown, a
 * partner-ghost countdown when their wire drops, and the burn ending
 * in a storm of ash and glitch scanlines.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowUp,
  ChevronLeft,
  Flame,
  Flag,
  Gamepad2,
  Handshake,
  Plus,
  SkipForward,
  Timer,
  X,
  Zap,
} from "lucide-react";
import { useChat, type ChatMsg, type Identity } from "@/lib/chat-store";
import { StrangerAvatar } from "./stranger-avatar";
import { FramedAvatar, RoomAtmosphere } from "./room-atmosphere";
import { GhostDrift, useIdle } from "./ghost-drift";
import { GhostMark } from "@/components/landing/ghost";
import { EASE } from "@/components/landing/reveal";
import { useVeilReducedMotion } from "./motion-prefs";
import GamesPanel from "./games-panel";

/* ── motion variants ────────────────────────────────────── */

const listVariants: Variants = {
  idle: {},
  burn: { transition: { staggerChildren: 0.04 } },
};

/* v5: softer entry — the message settles instead of springing in */
const msgVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.985, filter: "blur(4px)" },
  idle: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 290, damping: 30 },
  },
  burn: {
    opacity: 0,
    y: -14,
    filter: "blur(12px)",
    transition: { duration: 0.5, ease: EASE },
  },
};

/* ── word reactions (mirrors the service) ───────────────── */

const REACTIONS = ["SAME", "REAL", "OOF", "HA", "EYES"] as const;
type ReactionMap = Record<string, { count: number; mine: boolean }>;

/* ── the little + that opens the picker ─────────────────── */

function ReactTrigger({
  side,
  open,
  onToggle,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "-left-9" : "-right-9"} z-10`}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Close reactions" : "Add reaction"}
        className={`grid h-7 w-7 place-items-center rounded-full border transition-all duration-200 ${
          open
            ? "border-lime bg-lime text-ink opacity-100"
            : "border-cream/20 bg-ink-2/80 text-cream/60 opacity-60 hover:border-lime/60 hover:text-lime focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        }`}
      >
        <Plus className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "rotate-45" : ""}`} />
      </button>
      <AnimatePresence>{children}</AnimatePresence>
    </span>
  );
}

/* ── the picker row ─────────────────────────────────────── */

function ReactionPicker({
  map,
  onPick,
}: {
  map: ReactionMap;
  onPick: (key: string) => void;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-cream/15 bg-ink-2/95 px-2 py-1.5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7)] backdrop-blur-sm"
    >
      {REACTIONS.map((k) => {
        const cur = map?.[k];
        const mine = !!cur?.mine;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            className={`rounded-full px-2.5 py-1 font-tech text-[10px] tracking-[0.14em] transition-all duration-150 active:scale-90 ${
              mine
                ? "bg-lime text-ink"
                : cur
                  ? "text-lime hover:bg-lime/15"
                  : "text-cream/55 hover:text-lime"
            }`}
          >
            {k}
            {cur ? ` ${cur.count}` : ""}
          </button>
        );
      })}
    </motion.span>
  );
}

/* ── reaction chips under a bubble ──────────────────────── */

function ReactionRow({
  map,
  onReact,
  align,
}: {
  map: ReactionMap;
  onReact: (key: string) => void;
  align: "start" | "end";
}) {
  const live = REACTIONS.filter((k) => map?.[k]);
  if (live.length === 0) return null;
  return (
    <div className={`mt-1.5 flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : ""}`}>
      {live.map((k) => {
        const cur = map[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onReact(k)}
            className={`rounded-full px-2.5 py-1 font-tech text-[9px] tracking-[0.14em] transition-all duration-150 active:scale-90 ${
              cur.mine
                ? "bg-lime/90 text-ink"
                : "border border-cream/15 bg-ink-2/70 text-cream/65 hover:border-lime/50 hover:text-lime"
            }`}
          >
            {k} {cur.count}
          </button>
        );
      })}
    </div>
  );
}

/* ── grouped bubble styling (v5) ────────────────────────── */

type GroupPos = "single" | "first" | "mid" | "last";

const mineRounded = (g: GroupPos) =>
  g === "last" || g === "single" ? "rounded-2xl rounded-br-sm" : "rounded-2xl";
const theirRounded = (g: GroupPos) =>
  g === "last" || g === "single" ? "rounded-2xl rounded-bl-sm" : "rounded-2xl";

/* ── single message ─────────────────────────────────────── */

function MessageRow({
  msg,
  showIdentity,
  reactions,
  onReact,
  burning,
  group,
  seen,
  roomId,
  customRoom,
}: {
  msg: ChatMsg;
  showIdentity: boolean;
  reactions?: ReactionMap;
  onReact?: (key: string) => void;
  burning: boolean;
  group: GroupPos;
  seen: boolean;
  roomId: string | null;
  customRoom: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const canReact = !burning && !!onReact;
  const firstOfGroup = group === "single" || group === "first";

  if (msg.kind === "system") {
    return (
      <motion.div variants={msgVariants} initial="hidden" className="flex justify-center py-1">
        <span
          className={`inline-block rounded-full border px-4 py-1.5 text-center font-tech text-[9px] tracking-[0.22em] ${
            msg.kind === "system"
              ? "border-cream/12 text-cream/45"
              : "border-coral/40 text-coral"
          }`}
        >
          {msg.content}
        </span>
      </motion.div>
    );
  }

  const pick = (key: string) => {
    onReact?.(key);
    setPickerOpen(false);
  };

  /* the read shimmer plays exactly once per message */
  const shimmerOn = msg.mine && seen && !burning;
  const shimmerDone = () => {
    useChat.setState((st) => ({ seenPlayed: { ...st.seenPlayed, [msg.id]: true } }));
  };

  if (msg.mine) {
    return (
      <motion.div
        variants={msgVariants}
        initial="hidden"
        className={`group flex justify-end pl-10 ${group === "mid" || group === "last" ? "mt-1" : "mt-3.5"}`}
      >
        <div className="min-w-0 max-w-[78%]">
          <div className="relative">
            <div
              className={`${mineRounded(group)} ${shimmerOn ? "read-shimmer" : ""} bg-lime px-4 py-2.5 text-ink shadow-[0_10px_28px_-12px_rgba(217,244,80,0.4)]`}
              onAnimationEnd={shimmerOn ? shimmerDone : undefined}
            >
              <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed">
                {msg.content}
              </p>
            </div>
            {canReact && (
              <ReactTrigger
                side="left"
                open={pickerOpen}
                onToggle={() => setPickerOpen((v) => !v)}
              >
                {pickerOpen && (
                  <ReactionPicker map={reactions ?? {}} onPick={pick} />
                )}
              </ReactTrigger>
            )}
          </div>
          {!burning && reactions && (
            <ReactionRow map={reactions} onReact={(k) => onReact?.(k)} align="end" />
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={msgVariants}
      initial="hidden"
      className={`group flex items-end gap-2.5 pr-10 ${group === "mid" || group === "last" ? "mt-1" : "mt-3.5"}`}
    >
      {firstOfGroup && msg.from ? (
        <FramedAvatar seed={msg.from.seed} roomId={roomId} custom={customRoom} avatarClassName="h-7 w-7 md:h-8 md:w-8" />
      ) : (
        <span className="w-0 shrink-0 md:w-1" aria-hidden />
      )}
      <div className="min-w-0 max-w-[78%]">
        {firstOfGroup && showIdentity && msg.from && (
          <p className="mb-1 pl-1 font-tech text-[9px] tracking-[0.2em] text-cream/40">
            {msg.from.handle}
          </p>
        )}
        <div className="relative">
          <div className={`${theirRounded(group)} border border-cream/12 bg-ink-3/80 px-4 py-2.5`}>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-cream">
              {msg.content}
            </p>
          </div>
          {canReact && (
            <ReactTrigger
              side="right"
              open={pickerOpen}
              onToggle={() => setPickerOpen((v) => !v)}
            >
              {pickerOpen && (
                <ReactionPicker map={reactions ?? {}} onPick={pick} />
              )}
            </ReactTrigger>
          )}
        </div>
        {!burning && reactions && (
          <ReactionRow map={reactions} onReact={(k) => onReact?.(k)} align="start" />
        )}
      </div>
    </motion.div>
  );
}

/* ── typing ghost (v5 — the dots became a spirit) ───────── */

function TypingGhost({
  handles,
  seed,
  roomId,
  customRoom,
}: {
  handles: string[];
  seed?: string;
  roomId: string | null;
  customRoom: boolean;
}) {
  if (handles.length === 0) return null;
  const label =
    handles.length === 1 ? `${handles[0]} IS TYPING` : `${handles.length} MASKS TYPING`;
  const ghosts = Math.min(3, handles.length);
  return (
    <motion.div variants={msgVariants} initial="hidden" className="mt-3.5 flex items-end gap-2.5 pr-10">
      {seed ? (
        <FramedAvatar seed={seed} roomId={roomId} custom={customRoom} avatarClassName="h-7 w-7 md:h-8 md:w-8" />
      ) : (
        <motion.span
          animate={{ y: [0, -5, 0], rotate: [-3, 3, -3] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="flex shrink-0 items-center -space-x-2"
        >
          {Array.from({ length: ghosts }).map((_, i) => (
            <GhostMark key={i} className="h-7 w-7 text-cream/45" eyeClass="fill-lime/70" />
          ))}
        </motion.span>
      )}
      <div className="flex items-center gap-3 rounded-2xl border border-cream/12 bg-ink-3/80 px-4 py-3">
        <span className="font-tech text-[9px] tracking-[0.2em] text-cream/55">{label}</span>
        <motion.span
          animate={{ x: [0, 4, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          <GhostMark className="h-3.5 w-3.5 text-lime/80" eyeClass="fill-lime" />
        </motion.span>
      </div>
    </motion.div>
  );
}

/* ── ash storm — the burn ends in embers now (v5) ───────── */

function AshCanvas({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useVeilReducedMotion();

  useEffect(() => {
    if (!active || reduce) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    const R = (a: number, b: number) => a + Math.random() * (b - a);
    const colors = ["255,90,60", "217,244,80", "244,241,233"];
    const parts = Array.from({ length: 110 }, () => ({
      x: R(0, canvas.width),
      y: canvas.height + R(0, canvas.height * 0.9),
      vx: R(-0.4, 0.4),
      vy: R(-3.1, -1.0),
      r: R(1.4, 4.6) * dpr,
      a: R(0.5, 1),
      hue: colors[Math.floor(Math.random() * colors.length)],
      life: R(0.9, 1.8),
    }));
    let raf = 0;
    const t0 = performance.now();
    const frame = (t: number) => {
      const dt = (t - t0) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx * dpr + Math.sin(t / 420 + p.y * 0.02) * 0.28 * dpr;
        p.y += p.vy * dpr;
        const fade = Math.max(0, 1 - dt / p.life);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.hue},${(p.a * fade).toFixed(3)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active, reduce]);

  if (reduce) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full" />;
}

/* ── the partner's wire dropped — a ghost holds their seat ── */

function PartnerGhostOverlay({
  ghost,
}: {
  ghost: { handle: string; until: number };
}) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((ghost.until - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((ghost.until - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [ghost.until]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-ink/45 backdrop-blur-[2px]"
      role="status"
    >
      <motion.div
        animate={{ y: [0, -12, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <GhostMark className="h-16 w-16 text-cream/60" eyeClass="fill-lime/70" />
      </motion.div>
      <p className="px-6 text-center font-tech text-[10px] leading-relaxed tracking-[0.22em] text-cream/70">
        SIGNAL LOST — {ghost.handle} IS SLIPPING.
        <br />
        {left > 0 ? `${left}S FOR THEM TO FIND THEIR WAY BACK.` : "THE FUSE IS GOING OUT…"}
      </p>
    </motion.div>
  );
}

/* ── my own wire dropped — reaching back through ─────────── */

function ReconnectingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-ink/75 backdrop-blur-sm"
      role="status"
    >
      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <GhostMark className="h-16 w-16 text-cream/70" eyeClass="fill-lime" />
      </motion.div>
      <p className="font-tech text-[10px] tracking-[0.26em] text-cream/60">
        REACHING BACK THROUGH THE VOID<span className="blink-soft">…</span>
      </p>
      <p className="max-w-xs px-6 text-center font-tech text-[9px] leading-relaxed tracking-[0.18em] text-cream/40">
        THE FUSE HOLDS FOR A FEW MORE SECONDS. KEEP THE TAB OPEN.
      </p>
    </motion.div>
  );
}

/* ── rate-limit pulse ───────────────────────────────────── */

function RatePulse() {
  const ratePulse = useChat((s) => s.ratePulse);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!ratePulse) return;
    const t = setTimeout(() => setDismissedAt(ratePulse.at), 2600);
    return () => clearTimeout(t);
  }, [ratePulse]);

  const visible = !!ratePulse && dismissedAt !== ratePulse.at;

  return (
    <AnimatePresence>
      {visible && ratePulse && (
        <motion.p
          key={ratePulse.at}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="mb-2 text-center font-tech text-[10px] tracking-[0.24em] text-coral"
          role="status"
        >
          ! {ratePulse.message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* ── report a mask to the keepers ───────────────────────── */

const REPORT_TYPES = ["SCAM", "FRAUD", "MISCONDUCT", "ABUSE", "HARASSMENT"] as const;

function ReportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useChat((s) => s.me);
  const partner = useChat((s) => s.partner);
  const room = useChat((s) => s.room);
  const members = useChat((s) => s.members);
  const report = useChat((s) => s.report);

  const isRoom = !!room && !partner;

  const [step, setStep] = useState<"pick" | "type" | "done">(isRoom ? "pick" : "type");
  const [target, setTarget] = useState<Identity | null>(partner);
  const [type, setType] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  /* fresh state every time it opens — render-phase adjustment (no effect) */
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setStep(isRoom ? "pick" : "type");
      setTarget(partner);
      setType(null);
      setNote("");
      setError(null);
      setFiling(false);
    }
  }

  async function file() {
    if (!target || !type || filing) return;
    setFiling(true);
    setError(null);
    const res = await report(target.id, type, note.trim().slice(0, 120));
    setFiling(false);
    if (res.ok) {
      setStep("done");
      setTimeout(onClose, 1900);
    } else {
      setError(res.error ?? "DENIED.");
    }
  }

  const others = members.filter((m) => m.id !== me?.id);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="report-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Report a mask"
        >
          {/* backdrop */}
          <button
            type="button"
            aria-label="Close report"
            onClick={() => !filing && step !== "done" && onClose()}
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative m-3 w-full max-w-md rounded-2xl border border-cream/12 bg-ink-2 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_28px_70px_-20px_rgba(0,0,0,0.85)] sm:m-0"
          >
            <AnimatePresence mode="wait">
              {step === "pick" && (
                <motion.div
                  key="pick"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.22 }}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-tech text-[9px] tracking-[0.26em] text-coral">TELL THE KEEPERS</p>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="grid h-7 w-7 place-items-center rounded-full border border-cream/15 text-cream/60 hover:border-coral/60 hover:text-coral"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <h4 className="mt-3 font-display text-2xl font-bold tracking-tight">
                    WHO WENT WRONG?
                  </h4>
                  {others.length === 0 ? (
                    <p className="mt-6 font-tech text-[10px] tracking-[0.2em] text-cream/45">
                      NOBODY ELSE IS HERE.
                    </p>
                  ) : (
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      {others.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setTarget(m);
                            setStep("type");
                          }}
                          className="flex min-w-0 items-center gap-2.5 rounded-xl border border-cream/12 bg-ink/60 px-3 py-2.5 text-left transition-colors duration-200 hover:border-coral/50"
                        >
                          <StrangerAvatar seed={m.seed} className="h-8 w-8 shrink-0" />
                          <span className="min-w-0 flex-1 truncate font-tech text-[10px] tracking-[0.14em] text-cream/75">
                            {m.handle}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {step === "type" && target && (
                <motion.div
                  key="type"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.22 }}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-tech text-[9px] tracking-[0.26em] text-coral">TELL THE KEEPERS</p>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="grid h-7 w-7 place-items-center rounded-full border border-cream/15 text-cream/60 hover:border-coral/60 hover:text-coral"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    {isRoom && (
                      <button
                        type="button"
                        onClick={() => setStep("pick")}
                        aria-label="Pick another mask"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cream/15 text-cream/60 transition-colors hover:border-lime/60 hover:text-lime"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    )}
                    <StrangerAvatar seed={target.seed} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold leading-tight tracking-tight">
                        {target.handle}
                      </p>
                      <p className="font-tech text-[9px] tracking-[0.22em] text-cream/45">
                        YOU&apos;RE REPORTING THIS MASK
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {REPORT_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`rounded-full border px-3.5 py-2 font-tech text-[10px] tracking-[0.16em] transition-all duration-200 active:scale-95 ${
                          type === t
                            ? "border-coral bg-coral text-ink"
                            : "border-cream/20 text-cream/60 hover:border-coral/60 hover:text-coral"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 120))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && type) {
                        e.preventDefault();
                        file();
                      }
                    }}
                    placeholder="anything else the keepers should know — optional"
                    aria-label="Report note"
                    className="mt-4 w-full rounded-lg border border-dashed border-cream/20 bg-ink px-4 py-3 font-tech text-[11px] tracking-[0.1em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-coral/60"
                  />

                  {error && (
                    <p role="status" className="mt-3 font-tech text-[9px] tracking-[0.18em] text-coral">
                      ! {error}
                    </p>
                  )}

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={file}
                    disabled={!type || filing}
                    className="mt-5 w-full rounded-full bg-coral py-3 font-tech text-[11px] font-medium tracking-[0.22em] text-ink transition-all duration-300 enabled:hover:brightness-110 disabled:opacity-35"
                  >
                    {filing ? "FILING…" : "FILE REPORT"}
                  </motion.button>
                </motion.div>
              )}

              {step === "done" && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="py-6 text-center"
                >
                  <h4 className="font-display text-3xl font-bold tracking-tight text-lime">FILED.</h4>
                  <p className="mt-3 font-tech text-[10px] leading-relaxed tracking-[0.2em] text-cream/55">
                    THE KEEPERS ARE WATCHING THIS DOOR.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── the secret handshake's reveal card (v5) ────────────── */

function HandshakeCard() {
  const handshake = useChat((s) => s.handshake);
  const partner = useChat((s) => s.partner);
  const me = useChat((s) => s.me);
  const reveal = handshake.reveal;

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => useChat.setState({ handshake: { mine: true, theirs: true, reveal: null } }), 9000);
    return () => clearTimeout(t);
  }, [reveal]);

  return (
    <AnimatePresence>
      {reveal && (
        <motion.div
          key="handshake-card"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[112] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Secret handshake reveal"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => useChat.setState({ handshake: { mine: true, theirs: true, reveal: null } })}
            className="absolute inset-0 bg-ink/85 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.85, y: 24, opacity: 0, rotate: -2 }}
            animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.92, y: 12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="relative w-full max-w-sm rounded-2xl border border-lime/40 bg-ink-2 p-7 text-center shadow-[0_28px_70px_-20px_rgba(217,244,80,0.3)]"
          >
            <p className="font-tech text-[9px] tracking-[0.3em] text-lime/80">SECRET HANDSHAKE</p>

            <div className="mt-5 flex items-center justify-center gap-4">
              {me && (
                <motion.span
                  initial={{ x: -18, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  <StrangerAvatar seed={me.seed} className="h-12 w-12" />
                </motion.span>
              )}
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.35, type: "spring", stiffness: 340, damping: 18 }}
              >
                <Handshake className="h-7 w-7 text-lime" />
              </motion.div>
              {partner && (
                <motion.span
                  initial={{ x: 18, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  <StrangerAvatar seed={partner.seed} className="h-12 w-12" />
                </motion.span>
              )}
            </div>

            <p className="mt-6 font-display text-4xl font-bold tracking-tight text-lime">
              {reveal.score}%
            </p>
            <p className="mt-1 font-display text-lg font-bold tracking-tight">
              {reveal.label}
            </p>
            <p className="mt-4 font-tech text-[9px] leading-relaxed tracking-[0.18em] text-cream/50">
              {reveal.shared.length > 0
                ? `YOU BOTH WALKED IN WEARING — ${reveal.shared.join(" · ")}.`
                : "NO SHARED TAGS. THE VOID PAIRED YOU BY PURE CHEMISTRY."}
            </p>
            <p className="mt-4 border-t border-dashed border-cream/15 pt-4 font-tech text-[9px] tracking-[0.2em] text-cream/40">
              THE HANDSHAKE BURNS WITH THE ROOM. NOTHING SAVED.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── the tool row: spark · games · handshake (1:1 only) ─── */

function ToolsRow({ onOpenGames }: { onOpenGames: () => void }) {
  const spark = useChat((s) => s.spark);
  const handshakeTap = useChat((s) => s.handshakeTap);
  const handshake = useChat((s) => s.handshake);

  const handLabel = handshake.reveal
    ? "SEALED"
    : handshake.mine && handshake.theirs
      ? "REVEALING…"
      : handshake.mine
        ? "HAND OFFERED…"
        : handshake.theirs
          ? "THEY OFFERED — TAP BACK"
          : "HANDSHAKE";

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2">
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={spark}
        className="spark-pulse inline-flex items-center gap-1.5 rounded-full border border-lime/40 bg-lime/10 px-3.5 py-1.5 font-tech text-[9px] font-medium tracking-[0.18em] text-lime transition-colors duration-200 hover:bg-lime/20"
      >
        <Zap className="h-3 w-3" />
        SPARK A TOPIC
      </motion.button>
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={onOpenGames}
        className="inline-flex items-center gap-1.5 rounded-full border border-cream/20 px-3.5 py-1.5 font-tech text-[9px] tracking-[0.18em] text-cream/65 transition-colors duration-200 hover:border-lime/60 hover:text-lime"
      >
        <Gamepad2 className="h-3 w-3" />
        GAMES
      </motion.button>
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={handshakeTap}
        disabled={handshake.mine || !!handshake.reveal}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-tech text-[9px] tracking-[0.18em] transition-colors duration-200 disabled:cursor-default ${
          handshake.theirs && !handshake.mine
            ? "border-lime bg-lime text-ink"
            : handshake.mine || handshake.reveal
              ? "border-cream/10 text-cream/35"
              : "border-cream/20 text-cream/65 hover:border-lime/60 hover:text-lime"
        }`}
      >
        <Handshake className="h-3 w-3" />
        {handLabel}
      </motion.button>
    </div>
  );
}

/* ── the room ───────────────────────────────────────────── */

export default function ChatRoom() {
  const me = useChat((s) => s.me);
  const partner = useChat((s) => s.partner);
  const room = useChat((s) => s.room);
  const members = useChat((s) => s.members);
  const messages = useChat((s) => s.messages);
  const typingHandles = useChat((s) => s.typingHandles);
  const burning = useChat((s) => s.burning);
  const lastMatch = useChat((s) => s.lastMatch);
  const reactions = useChat((s) => s.reactions);
  const send = useChat((s) => s.send);
  const pokeTyping = useChat((s) => s.pokeTyping);
  const burn = useChat((s) => s.burn);
  const leaveChat = useChat((s) => s.leaveChat);
  const react = useChat((s) => s.react);
  const skipChat = useChat((s) => s.skipChat);
  const reconnecting = useChat((s) => s.reconnecting);
  const partnerGhost = useChat((s) => s.partnerGhost);
  const seenUpTo = useChat((s) => s.seenUpTo);
  const seenPlayed = useChat((s) => s.seenPlayed);
  const markSeen = useChat((s) => s.markSeen);
  const roomBurnAt = useChat((s) => s.roomBurnAt);

  const [draft, setDraft] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [burnLeft, setBurnLeft] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCount = useRef(0);
  const lastSeenSent = useRef(0);

  const isRoom = !!room;
  const isFuse = !!partner;

  /* timed door countdown (header chip) — anchor adjusts during render */
  const [burnAnchor, setBurnAnchor] = useState<number | null>(roomBurnAt);
  if (burnAnchor !== roomBurnAt) {
    setBurnAnchor(roomBurnAt);
    setBurnLeft(roomBurnAt ? Math.max(0, Math.ceil((roomBurnAt - Date.now()) / 1000)) : null);
  }
  useEffect(() => {
    if (!roomBurnAt) return;
    const t = setInterval(
      () => setBurnLeft(Math.max(0, Math.ceil((roomBurnAt - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(t);
  }, [roomBurnAt]);

  /* the house ghost drifts through when the room falls silent */
  const idle = useIdle(40_000, [
    messages.length,
    typingHandles.length,
    draft,
    burning ? 1 : 0,
    partnerGhost ? 1 : 0,
  ]);

  /* auto-scroll: instant on (re)mount, smooth afterwards */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || burning) return;
    const behavior = prevCount.current === 0 ? ("auto" as const) : ("smooth" as const);
    prevCount.current = messages.length;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, [messages.length, typingHandles.length, burning]);

  /* v5: seen receipts — tell them we read, quietly, debounced */
  useEffect(() => {
    if (useChat.getState().phase !== "chat") return;
    const maxAt = messages.reduce((acc, m) => (!m.mine && m.kind === "user" ? Math.max(acc, m.at) : acc), 0);
    if (maxAt <= lastSeenSent.current) return;
    const t = setTimeout(() => {
      if (maxAt > lastSeenSent.current) {
        lastSeenSent.current = maxAt;
        markSeen(maxAt);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [messages]);

  /* focus the composer when the room opens */
  useEffect(() => {
    inputRef.current?.focus();
  }, [partner?.id, room?.id]);

  function handleSend() {
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
    inputRef.current?.focus();
  }

  /* v5: bubble grouping — same sender, close in time, one cluster */
  const grouped = messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const userPrev = prev && prev.kind === "user" && m.kind === "user" && prev.mine === m.mine && (m.mine || prev.from?.id === m.from?.id) && m.at - prev.at < 90_000;
    const userNext = next && next.kind === "user" && m.kind === "user" && next.mine === m.mine && (m.mine || next.from?.id === m.from?.id) && next.at - m.at < 90_000;
    const group: GroupPos = userPrev ? (userNext ? "mid" : "last") : userNext ? "first" : "single";
    return { m, group };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* ── header ── */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-cream/10 bg-ink-2/60 px-4 backdrop-blur-sm md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {partner ? (
            <>
              <FramedAvatar seed={partner.seed} roomId={room?.id} avatarClassName="h-9 w-9" />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold tracking-wide md:text-base">
                  {partner.handle}
                </p>
                <p className="flex items-center gap-2 truncate font-tech text-[9px] tracking-[0.22em] text-cream/45">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="ping-soft absolute h-full w-full rounded-full bg-lime" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-lime" />
                  </span>
                  {lastMatch && lastMatch.via === "INTERESTS"
                    ? `STRANGER · FUSED ON ${lastMatch.shared.join(" · ")}`
                    : "STRANGER · 1:1 FUSE"}
                </p>
              </div>
            </>
          ) : room ? (
            <>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cream/12 bg-ink-3 font-display text-sm font-bold text-lime">
                {room.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-display text-sm font-bold tracking-wide md:text-base">
                  {room.name}
                  {room.hasPass && <span title="Locked door" aria-label="Locked door" className="font-tech text-[9px] text-coral/80">🔒</span>}
                </p>
                <p className="flex items-center gap-2 truncate font-tech text-[9px] tracking-[0.22em] text-cream/45">
                  {room.tag}
                  {burnLeft !== null && (
                    <span className="flex items-center gap-1 text-coral">
                      <Timer className="h-3 w-3" />
                      {Math.floor(burnLeft / 60)}:{String(burnLeft % 60).padStart(2, "0")}
                    </span>
                  )}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            aria-label="Report a mask"
            title="Report a mask"
            className="grid h-9 w-9 place-items-center rounded-full border border-cream/15 text-cream/60 transition-colors duration-300 hover:border-coral/60 hover:text-coral"
          >
            <Flag className="h-4 w-4" />
          </button>
          {isFuse && (
            <motion.button
              type="button"
              onClick={skipChat}
              whileTap={{ scale: 0.9 }}
              className="inline-flex items-center gap-2 rounded-full border border-cream/25 px-4 py-2 font-tech text-[10px] tracking-[0.2em] text-cream/75 transition-all duration-300 hover:border-lime/60 hover:text-lime md:px-5 md:py-2.5"
              aria-label="Skip to the next mask"
              title="Next mask — with a short cooldown"
            >
              <SkipForward className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">NEXT</span>
            </motion.button>
          )}
          {isFuse && (
            <motion.button
              type="button"
              onClick={burn}
              whileTap={{ scale: 0.9 }}
              className="inline-flex items-center gap-2 rounded-full border border-coral/50 px-4 py-2 font-tech text-[10px] tracking-[0.2em] text-coral transition-all duration-300 hover:bg-coral hover:text-ink md:px-5 md:py-2.5"
              aria-label="Burn this conversation"
            >
              <Flame className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">BURN IT</span>
            </motion.button>
          )}
          <button
            type="button"
            onClick={leaveChat}
            aria-label="Leave conversation"
            className="grid h-9 w-9 place-items-center rounded-full border border-cream/15 text-cream/60 transition-colors duration-300 hover:border-coral/60 hover:text-coral"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* mobile members strip (rooms only) */}
      {isRoom && members.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-cream/10 px-4 py-2 lg:hidden"
          aria-label="Members present"
        >
          {members.map((m) => (
            <span
              key={m.id}
              title={m.handle}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-cream/10 py-1 pl-1 pr-2.5"
            >
              <StrangerAvatar seed={m.seed} className="h-5 w-5" />
              <span className="font-tech text-[9px] tracking-[0.14em] text-cream/50">
                {m.id === me?.id ? "YOU" : m.handle.split(" ")[0]}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── body: messages + rail ── */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {/* v5: the room breathes — pattern + tint + frames */}
            <RoomAtmosphere roomId={room?.id} custom={room?.custom} />

            <GhostDrift
              show={idle && !burning}
              label={
                partner
                  ? "THE STRANGER WENT QUIET. DRIFT, OR SAY SOMETHING."
                  : "THE ROOM HAS GONE QUIET. GHOSTS ARE PATIENT."
              }
            />

            {/* v5: partner's wire dropped — the ghost holds their seat */}
            <AnimatePresence>
              {partnerGhost && !burning && <PartnerGhostOverlay key="pg" ghost={partnerGhost} />}
            </AnimatePresence>

            {/* v5: my wire dropped — reaching back through */}
            <AnimatePresence>
              {reconnecting && !burning && <ReconnectingOverlay key="rc" />}
            </AnimatePresence>

            {/* v5: the burn — ash storm + glitch scanlines over the blur */}
            <AshCanvas active={burning} />
            {burning && <div aria-hidden className="glitch-scan pointer-events-none absolute inset-0 z-10" />}

            <div
              ref={scrollRef}
              role="log"
              aria-live="polite"
              aria-label="Messages"
              className="relative z-[5] h-full overflow-y-auto px-4 py-6 md:px-8"
            >
              <motion.div
                variants={listVariants}
                initial="idle"
                animate={burning ? "burn" : "idle"}
                className="mx-auto flex max-w-3xl flex-col"
              >
                {grouped.map(({ m, group }) => (
                  <MessageRow
                    key={m.id}
                    msg={m}
                    showIdentity={isRoom}
                    reactions={reactions[m.id]}
                    onReact={(k) => react(m.id, k)}
                    burning={burning}
                    group={group}
                    seen={m.at <= seenUpTo && !seenPlayed[m.id]}
                    roomId={room?.id ?? null}
                    customRoom={!!room?.custom}
                  />
                ))}
                {!burning && (
                  <TypingGhost
                    handles={typingHandles}
                    seed={isRoom ? undefined : partner?.seed}
                    roomId={room?.id ?? null}
                    customRoom={!!room?.custom}
                  />
                )}
              </motion.div>
            </div>
          </div>

          {/* ── composer ── */}
          <div className="shrink-0 border-t border-cream/10 bg-ink-2/60 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8">
            <div className="mx-auto max-w-3xl">
              <RatePulse />
              {isFuse && !burning && !reconnecting && <ToolsRow onOpenGames={() => setGamesOpen(true)} />}
              <div className="flex items-center gap-3">
                {me && <StrangerAvatar seed={me.seed} className="hidden h-9 w-9 shrink-0 sm:block" />}
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value.slice(0, 600));
                    pokeTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={partner ? "SAY SOMETHING WORTH BURNING…" : "SPEAK INTO THE ROOM…"}
                  aria-label="Message"
                  maxLength={600}
                  disabled={reconnecting}
                  className="min-w-0 flex-1 rounded-full border border-cream/15 bg-ink px-5 py-3.5 text-[15px] text-cream placeholder:text-cream/30 outline-none transition-colors duration-300 focus:border-lime/60 disabled:opacity-50"
                />
                {draft.length > 480 && (
                  <span className="shrink-0 font-tech text-[9px] tracking-[0.16em] text-cream/40">
                    {600 - draft.length}
                  </span>
                )}
                <motion.button
                  type="button"
                  onClick={handleSend}
                  whileTap={{ scale: 0.86 }}
                  disabled={!draft.trim() || reconnecting}
                  aria-label="Send message"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-ink shadow-[0_10px_26px_-8px_rgba(217,244,80,0.5)] transition-all duration-300 enabled:hover:scale-105 disabled:opacity-35 disabled:shadow-none"
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* desktop members rail (rooms only) */}
        {isRoom && members.length > 0 && (
          <aside
            className="hidden w-56 shrink-0 flex-col overflow-y-auto border-l border-cream/10 bg-ink-2/40 px-4 py-5 lg:flex"
            aria-label="Members present"
          >
            <p className="font-tech text-[9px] tracking-[0.28em] text-cream/45">
              PRESENT — {members.length}
            </p>
            <ul className="mt-4 space-y-1">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-cream/5"
                >
                  <FramedAvatar seed={m.seed} roomId={room?.id} custom={room?.custom} avatarClassName="h-8 w-8" />
                  <span className="min-w-0 flex-1 truncate font-tech text-[10px] tracking-[0.12em] text-cream/70">
                    {m.handle}
                  </span>
                  {m.id === me?.id && (
                    <span className="shrink-0 rounded-full bg-lime/15 px-2 py-0.5 font-tech text-[9px] tracking-[0.14em] text-lime">
                      YOU
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-6 font-tech text-[9px] leading-relaxed tracking-[0.18em] text-cream/40">
              MESSAGES EXIST ONLY WHILE YOU ARE HERE.
            </p>
          </aside>
        )}
      </div>

      {/* ── sheets ── */}
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} />
      {/* the games panel folds itself away the moment the room burns */}
      <GamesPanel open={gamesOpen && !burning && !reconnecting} onClose={() => setGamesOpen(false)} />
      <HandshakeCard />
    </div>
  );
}
