"use client";

/**
 * /mod — the Keeper Console. Key-gated operator view over the chat
 * service: live report feed with evidence, blocks/probations with
 * countdowns and lifts, manual enforcement, and the night's stats.
 *
 * The console rides the same socket service (mod:auth / mod:act /
 * mod:feed) and only comes alive when VEIL_MOD_KEY is set there.
 * Unset = the keepers are off duty, and the page says so.
 */
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Ghost, Lock, LogOut, ShieldAlert, Timer, Unlock, Download, VolumeX } from "lucide-react";
import { resolveChatUrl } from "@/lib/chat-store";
import { StrangerAvatar } from "@/components/chat/stranger-avatar";
import { GhostMark } from "@/components/landing/ghost";
import { EASE } from "@/components/landing/reveal";

/* ── shapes mirrored from the service ───────────────────── */

interface ModReport {
  id: string;
  at: number;
  type: string;
  level: number;
  note: string;
  reporterHandle: string;
  targetHandle: string;
  targetSeed: string;
  roomName: string;
  targetIP: string;
  context: { h: string; c: string; at: number }[];
  action: string;
}

interface ModPunish {
  ip: string;
  reason: string;
  by: string;
  remaining: number;
}

interface ModState {
  stats: { online: number; rooms: number; doors: number; fused: number; reports: number };
  reports: ModReport[];
  blocks: ModPunish[];
  restricts: ModPunish[];
  feed: { line: string; at: number; kind: string }[];
  mutewords: string[];
  night: {
    peakOnline: number;
    peakAt: number;
    msgsRelayed: number;
    mutedHits: number;
    doorsBurned: number;
    fusesDone: number;
    avgFuseMin: number;
    reportsByType: Record<string, number>;
    reportsLastHour: number;
  };
}

type Ack = { ok: boolean; error?: string; state?: ModState; export?: Record<string, unknown> };

/* ── helpers ────────────────────────────────────────────── */

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

const countdown = (ms: number): string => {
  if (ms <= 0) return "EXPIRING";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}H ${m}M`;
  if (m > 0) return `${m}M`;
  return "EXPIRING";
};

const ago = (at: number): string => {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return "NOW";
  if (s < 3600) return `${Math.floor(s / 60)}M AGO`;
  return `${Math.floor(s / 3600)}H AGO`;
};

/* ── the console ────────────────────────────────────────── */

export default function ModPage() {
  const [phase, setPhase] = useState<"key" | "live" | "off">("key");
  const [keyInput, setKeyInput] = useState("");
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [state, setState] = useState<ModState | null>(null);
  const [feed, setFeed] = useState<ModState["feed"]>([]);
  const [manualIP, setManualIP] = useState("");
  const [manualHours, setManualHours] = useState(24);
  const [manualErr, setManualErr] = useState<string | null>(null);
  /* v5: report filters + mute-word drafting + export feedback */
  const [filterType, setFilterType] = useState("ALL");
  const [filterRoom, setFilterRoom] = useState("");
  const [muteDraft, setMuteDraft] = useState("");
  const [exportedAt, setExportedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const busyRef = useRef(false);

  /* countdown refresh */
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => socketRef.current?.disconnect(), []);

  function signIn() {
    if (busyRef.current) return;
    busyRef.current = true;
    setAuthErr(null);
    const s = io(resolveChatUrl(), {
      path: "/",
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: false,
      timeout: 8000,
    });
    socketRef.current = s;

    const fail = (msg: string) => {
      busyRef.current = false;
      setAuthErr(msg);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };

    s.on("connect_error", () => fail("THE SERVICE ISN'T ANSWERING. IS IT RUNNING?"));
    s.on("connect", () => {
      s.emit("mod:auth", { key: keyInput }, (res: Ack) => {
        busyRef.current = false;
        if (res.ok && res.state) {
          setState(res.state);
          setFeed(res.state.feed);
          setPhase("live");
          s.on("mod:feed", (line: { line: string; at: number; kind: string }) =>
            setFeed((cur) => [line, ...cur].slice(0, 60)),
          );
        } else if ((res.error ?? "").includes("OFF DUTY")) {
          setPhase("off");
          s.disconnect();
          if (socketRef.current === s) socketRef.current = null;
        } else {
          fail(res.error ?? "THAT'S NOT THE WORD.");
        }
      });
    });
  }

  function signOut() {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState(null);
    setFeed([]);
    setPhase("key");
    setKeyInput("");
    setAuthErr(null);
  }

  function act(op: string, payload: Record<string, unknown> = {}) {
    const s = socketRef.current;
    if (!s) return;
    setManualErr(null);
    s.emit("mod:act", { op, ...payload }, (res: Ack) => {
      if (res.ok && res.state) {
        setState(res.state);
        setFeed(res.state.feed);
      } else {
        setManualErr(res.error ?? "DENIED.");
      }
    });
  }

  /* counts only — a night's summary, downloadable, no content */
  function exportNight() {
    const s = socketRef.current;
    if (!s) return;
    s.emit("mod:act", { op: "export:night" }, (res: Ack) => {
      if (!res.ok || !res.export) {
        setManualErr(res.error ?? "EXPORT DENIED.");
        return;
      }
      try {
        const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `veil-night-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportedAt(Date.now());
        setTimeout(() => setExportedAt(null), 2000);
      } catch {
        setManualErr("THE EXPORT SLIPPED THROUGH YOUR FINGERS.");
      }
    });
  }

  /* ── key gate ── */
  if (phase !== "live") {
    return (
      <main className="grain dot-grid flex min-h-screen flex-col items-center justify-center bg-ink px-5 text-cream">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="w-full max-w-sm rounded-2xl border border-cream/12 bg-ink-2/80 p-8 text-center"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto w-fit"
          >
            <GhostMark className="h-16 w-16 text-cream/80" eyeClass="fill-lime" />
          </motion.div>

          <h1 className="mt-7 font-display text-3xl font-bold tracking-tight">
            KEEPER CONSOLE<span className="text-lime">.</span>
          </h1>
          <p className="mt-2 font-tech text-[9px] tracking-[0.3em] text-cream/40">
            VEIL /MOD — OPERATORS ONLY
          </p>

          {phase === "off" ? (
            <div className="mt-8 rounded-xl border border-dashed border-coral/40 bg-coral/5 px-5 py-5 text-left">
              <p className="font-tech text-[10px] leading-relaxed tracking-[0.2em] text-coral">
                ! THE KEEPERS ARE OFF DUTY.
              </p>
              <p className="mt-2 font-tech text-[9px] leading-relaxed tracking-[0.18em] text-cream/45">
                SET VEIL_MOD_KEY ON THE CHAT SERVICE AND RESTART IT. THEN SPEAK THE WORD HERE.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 flex items-center gap-2">
                <div className="relative flex-1">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cream/35" />
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && signIn()}
                    placeholder="SPEAK THE WORD"
                    aria-label="Keeper key"
                    className="w-full rounded-full border border-cream/15 bg-ink py-3 pl-11 pr-4 font-tech text-[11px] tracking-[0.2em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-lime/60"
                  />
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={signIn}
                  disabled={!keyInput}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime text-ink transition-all duration-300 enabled:hover:scale-105 disabled:opacity-35"
                  aria-label="Sign in"
                >
                  <Unlock className="h-4 w-4" />
                </motion.button>
              </div>
              <AnimatePresence>
                {authErr && (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 font-tech text-[9px] tracking-[0.2em] text-coral"
                    role="status"
                  >
                    ! {authErr}
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      </main>
    );
  }

  /* ── live console ── */
  const stats = state?.stats;
  const night = state?.night;
  const mutewords = state?.mutewords ?? [];
  const allReports = state?.reports ?? [];
  const blocks = state?.blocks ?? [];
  const restricts = state?.restricts ?? [];

  /* v5: search reports by type or room */
  const REPORT_FILTERS = ["ALL", "SCAM", "FRAUD", "MISCONDUCT", "ABUSE", "HARASSMENT"];
  const reports = allReports.filter(
    (r) =>
      (filterType === "ALL" || r.type === filterType) &&
      (filterRoom.trim() === "" || r.roomName.toUpperCase().includes(filterRoom.trim().toUpperCase())),
  );

  const feedColor = (kind: string) =>
    kind === "action" || kind === "spam"
      ? "text-coral"
      : kind === "info"
        ? "text-lime/80"
        : "text-cream/70";

  return (
    <main className="grain min-h-screen bg-ink text-cream">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-cream/10 bg-ink/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="ping-soft absolute h-full w-full rounded-full bg-lime" />
              <span className="relative h-2 w-2 rounded-full bg-lime" />
            </span>
            <h1 className="font-display text-lg font-bold tracking-tight">
              KEEPER CONSOLE<span className="text-lime">.</span>
            </h1>
          </div>

          {stats && (
            <p className="font-tech text-[9px] tracking-[0.22em] text-cream/50">
              ONLINE {stats.online} · ROOMS {stats.rooms} · DOORS {stats.doors} · FUSED {stats.fused} ·
              REPORTS {stats.reports}
            </p>
          )}

          <button
            type="button"
            onClick={exportNight}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-lime/40 px-4 py-2 font-tech text-[9px] tracking-[0.2em] text-lime transition-colors hover:bg-lime hover:text-ink"
          >
            <Download className="h-3.5 w-3.5" />
            {exportedAt ? "SAVED." : "EXPORT NIGHT"}
          </button>

          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-full border border-cream/20 px-4 py-2 font-tech text-[9px] tracking-[0.2em] text-cream/70 transition-colors hover:border-coral/60 hover:text-coral"
          >
            <LogOut className="h-3.5 w-3.5" />
            SIGN OUT
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── left column: reports + manual ── */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* manual enforcement */}
          <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
            <p className="font-tech text-[9px] tracking-[0.28em] text-cream/40">BY HAND</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={manualIP}
                onChange={(e) => setManualIP(e.target.value.trim())}
                placeholder="ip address"
                aria-label="IP address"
                className="min-w-0 flex-1 rounded-lg border border-cream/15 bg-ink px-4 py-2.5 font-tech text-[11px] tracking-[0.1em] text-lime outline-none transition-colors placeholder:text-cream/30 focus:border-lime/60"
              />
              <select
                value={manualHours}
                onChange={(e) => setManualHours(Number(e.target.value))}
                aria-label="Hours"
                className="shrink-0 rounded-lg border border-cream/15 bg-ink px-3 py-2.5 font-tech text-[11px] text-cream outline-none"
              >
                {[1, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h}H
                  </option>
                ))}
              </select>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => act("block", { ip: manualIP, hours: manualHours })}
                disabled={!manualIP}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-coral px-4 py-2.5 font-tech text-[10px] font-medium tracking-[0.18em] text-ink transition-all enabled:hover:brightness-110 disabled:opacity-35"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                BLOCK
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => act("restrict", { ip: manualIP, hours: manualHours })}
                disabled={!manualIP}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-cream/25 px-4 py-2.5 font-tech text-[10px] tracking-[0.18em] text-cream/80 transition-colors enabled:hover:border-lime/60 enabled:hover:text-lime disabled:opacity-35"
              >
                <Timer className="h-3.5 w-3.5" />
                PROBATION
              </motion.button>
            </div>
            {manualErr && (
              <p role="status" className="mt-3 font-tech text-[9px] tracking-[0.2em] text-coral">
                ! {manualErr}
              </p>
            )}
          </section>

          {/* reports */}
          <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-tech text-[9px] tracking-[0.28em] text-cream/40">
                REPORTS — {reports.length}{reports.length !== allReports.length ? ` OF ${allReports.length}` : ""}
              </p>
              <p className="font-tech text-[9px] tracking-[0.2em] text-cream/30">
                EVIDENCE: LAST 6 LINES, MEMORY ONLY
              </p>
            </div>

            {/* v5: search by type or room */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {REPORT_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilterType(f)}
                    className={`rounded-full border px-2.5 py-1 font-tech text-[9px] tracking-[0.14em] transition-colors ${
                      filterType === f
                        ? "border-coral bg-coral/15 text-coral"
                        : "border-cream/15 text-cream/50 hover:border-coral/50 hover:text-coral"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                value={filterRoom}
                onChange={(e) => setFilterRoom(e.target.value.slice(0, 24))}
                placeholder="search by room…"
                aria-label="Filter reports by room"
                className="ml-auto min-w-0 flex-1 rounded-lg border border-cream/15 bg-ink px-3 py-1.5 font-tech text-[10px] tracking-[0.1em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-lime/60 sm:max-w-[200px]"
              />
            </div>

            {reports.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
                <Ghost className="h-8 w-8 text-cream/20" />
                <p className="font-tech text-[10px] tracking-[0.22em] text-cream/35">
                  NO REPORTS TONIGHT. THE DOORS ARE QUIET.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                <AnimatePresence initial={false}>
                  {reports.map((r) => {
                    const acted = r.action.includes("BLOCK");
                    return (
                      <motion.li
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="rounded-xl border border-cream/10 bg-ink/60 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-coral/15 px-2.5 py-1 font-tech text-[9px] font-medium tracking-[0.16em] text-coral">
                            {r.type} · L{r.level}
                          </span>
                          <span className="font-tech text-[9px] tracking-[0.18em] text-cream/40">
                            {ago(r.at)} · {clock(r.at)}
                          </span>
                          <span
                            className={`ml-auto rounded-full px-2.5 py-1 font-tech text-[8px] tracking-[0.16em] ${
                              acted
                                ? "bg-coral/15 text-coral"
                                : r.action.includes("RESTRICT")
                                  ? "bg-cream/10 text-cream/70"
                                  : "border border-cream/12 text-cream/40"
                            }`}
                          >
                            {r.action}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <StrangerAvatar seed={r.targetSeed} className="h-9 w-9 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-display text-sm font-bold tracking-wide">
                              <span className="text-cream/60">{r.reporterHandle}</span>
                              <span className="mx-2 text-coral">→</span>
                              {r.targetHandle}
                            </p>
                            <p className="truncate font-tech text-[9px] tracking-[0.18em] text-cream/40">
                              IN {r.roomName} · FROM {r.targetIP}
                            </p>
                          </div>
                        </div>

                        {r.note && (
                          <p className="mt-2.5 border-l-2 border-coral/40 pl-3 font-tech text-[10px] leading-relaxed tracking-[0.12em] text-cream/55">
                            “{r.note}”
                          </p>
                        )}

                        {r.context.length > 0 && (
                          <div className="mt-3 rounded-lg border border-cream/8 bg-ink-2/70 px-3 py-2.5">
                            {r.context.slice(-3).map((c, i) => (
                              <p
                                key={`${r.id}-${i}`}
                                className="truncate font-tech text-[9px] leading-relaxed tracking-[0.12em] text-cream/40"
                              >
                                <span className="text-cream/60">{c.h}</span>: {c.c}
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => act("escalate", { reportId: r.id })}
                            disabled={acted}
                            className="inline-flex items-center gap-1.5 rounded-full border border-coral/40 px-3.5 py-1.5 font-tech text-[9px] tracking-[0.16em] text-coral transition-colors enabled:hover:bg-coral enabled:hover:text-ink disabled:opacity-30"
                          >
                            <Flame className="h-3 w-3" />
                            ESCALATE 48H
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>

        {/* ── right column: mute words + the night + punishments + live feed ── */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* v5: mute words — live, editable, silent */}
          <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
            <div className="flex items-center justify-between">
              <p className="font-tech text-[9px] tracking-[0.28em] text-cream/40">MUTE WORDS</p>
              <span className="flex items-center gap-1.5 font-tech text-[9px] tracking-[0.16em] text-cream/45">
                <VolumeX className="h-3 w-3" />
                {night ? `${night.mutedHits} MUTED TONIGHT` : "LIVE"}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={muteDraft}
                onChange={(e) => setMuteDraft(e.target.value.toUpperCase().slice(0, 24))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && muteDraft.trim().length >= 2) {
                    e.preventDefault();
                    act("mutewords:set", { words: [...mutewords, muteDraft.trim()] });
                    setMuteDraft("");
                  }
                }}
                placeholder="add a word the keepers mute…"
                aria-label="Add mute word"
                className="min-w-0 flex-1 rounded-lg border border-cream/15 bg-ink px-3.5 py-2.5 font-tech text-[10px] tracking-[0.14em] text-coral outline-none transition-colors placeholder:text-cream/30 focus:border-coral/60"
              />
              <button
                type="button"
                onClick={() => {
                  if (muteDraft.trim().length < 2) return;
                  act("mutewords:set", { words: [...mutewords, muteDraft.trim()] });
                  setMuteDraft("");
                }}
                disabled={muteDraft.trim().length < 2}
                className="shrink-0 rounded-lg bg-coral/90 px-4 py-2.5 font-tech text-[9px] font-medium tracking-[0.18em] text-ink transition-all enabled:hover:brightness-110 disabled:opacity-35"
              >
                MUTE
              </button>
            </div>
            {mutewords.length === 0 ? (
              <p className="mt-3 font-tech text-[10px] tracking-[0.2em] text-cream/35">
                NOTHING MUTED. EVERY WORD FLIES FREE.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {mutewords.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => act("mutewords:set", { words: mutewords.filter((x) => x !== w) })}
                    title="Unmute"
                    className="group inline-flex items-center gap-1.5 rounded-full border border-coral/40 bg-coral/10 px-3 py-1.5 font-tech text-[9px] tracking-[0.14em] text-coral transition-colors hover:bg-coral hover:text-ink"
                  >
                    {w}
                    <span className="text-coral/60 group-hover:text-ink/70">×</span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 font-tech text-[9px] leading-relaxed tracking-[0.16em] text-cream/40">
              APPLIES TO THE NEXT MESSAGE, EVERYWHERE. DIES WITH THE PROCESS.
            </p>
          </section>

          {/* v5: the night — operator stats, counts only */}
          {night && (
            <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
              <p className="font-tech text-[9px] tracking-[0.28em] text-lime/80">THE NIGHT — COUNTS ONLY</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="font-tech text-[9px] tracking-[0.16em] text-cream/45">PEAK ONLINE</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tracking-tight text-lime">{night.peakOnline}</dd>
                </div>
                <div>
                  <dt className="font-tech text-[9px] tracking-[0.16em] text-cream/45">REPORTS / HOUR</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tracking-tight text-coral">{night.reportsLastHour}</dd>
                </div>
                <div>
                  <dt className="font-tech text-[9px] tracking-[0.16em] text-cream/45">AVG CONVERSATION</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tracking-tight">{night.avgFuseMin}M</dd>
                </div>
                <div>
                  <dt className="font-tech text-[9px] tracking-[0.16em] text-cream/45">FUSES ENDED</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tracking-tight">{night.fusesDone}</dd>
                </div>
                <div>
                  <dt className="font-tech text-[9px] tracking-[0.16em] text-cream/45">MSGS RELAYED</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tracking-tight">{night.msgsRelayed}</dd>
                </div>
                <div>
                  <dt className="font-tech text-[9px] tracking-[0.16em] text-cream/45">DOORS BURNED</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tracking-tight">{night.doorsBurned}</dd>
                </div>
              </dl>
              {Object.keys(night.reportsByType).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-dashed border-cream/10 pt-3">
                  {Object.entries(night.reportsByType).map(([t, n]) => (
                    <span key={t} className="rounded-full bg-coral/10 px-2.5 py-1 font-tech text-[9px] tracking-[0.14em] text-coral/90">
                      {t} ×{n}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* blocks */}
          <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
            <p className="font-tech text-[9px] tracking-[0.28em] text-coral/80">
              BLOCKS — {blocks.length}
            </p>
            {blocks.length === 0 ? (
              <p className="mt-3 font-tech text-[10px] tracking-[0.2em] text-cream/35">NONE TONIGHT.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {blocks.map((b) => (
                  <li
                    key={b.ip}
                    className="flex items-center gap-3 rounded-xl border border-coral/25 bg-coral/5 px-3.5 py-2.5"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0 text-coral" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-tech text-[10px] tracking-[0.12em] text-lime">{b.ip}</p>
                      <p className="truncate font-tech text-[8px] tracking-[0.16em] text-cream/45">
                        {b.reason} · {countdown(b.remaining)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => act("lift:block", { ip: b.ip })}
                      className="shrink-0 rounded-full border border-cream/20 px-3 py-1.5 font-tech text-[9px] tracking-[0.16em] text-cream/70 transition-colors hover:border-lime/60 hover:text-lime"
                    >
                      LIFT
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* probations */}
          <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
            <p className="font-tech text-[9px] tracking-[0.28em] text-cream/40">
              PROBATIONS — {restricts.length}
            </p>
            {restricts.length === 0 ? (
              <p className="mt-3 font-tech text-[10px] tracking-[0.2em] text-cream/35">NOBODY ON A LEASH.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {restricts.map((p) => (
                  <li
                    key={p.ip}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-cream/20 bg-ink/60 px-3.5 py-2.5"
                  >
                    <Timer className="h-4 w-4 shrink-0 text-cream/60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-tech text-[10px] tracking-[0.12em] text-lime">{p.ip}</p>
                      <p className="truncate font-tech text-[8px] tracking-[0.16em] text-cream/45">
                        {p.reason} · {countdown(p.remaining)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => act("lift:restrict", { ip: p.ip })}
                      className="shrink-0 rounded-full border border-cream/20 px-3 py-1.5 font-tech text-[9px] tracking-[0.16em] text-cream/70 transition-colors hover:border-lime/60 hover:text-lime"
                    >
                      LIFT
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* live feed */}
          <section className="rounded-2xl border border-cream/12 bg-ink-2/60 p-5">
            <p className="font-tech text-[9px] tracking-[0.28em] text-cream/40">
              THE NIGHT — LIVE
            </p>
            {feed.length === 0 ? (
              <p className="mt-3 font-tech text-[10px] tracking-[0.2em] text-cream/35">
                NOTHING YET. THE KEEPERS WAIT.
              </p>
            ) : (
              <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {feed.map((f, i) => (
                  <li key={`${f.at}-${i}`} className="flex gap-2.5 font-tech text-[9px] leading-relaxed">
                    <span className="shrink-0 text-cream/30">{clock(f.at)}</span>
                    <span className={feedColor(f.kind)}>{f.line}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
