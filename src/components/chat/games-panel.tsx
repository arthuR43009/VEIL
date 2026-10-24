"use client";

/**
 * GamesPanel — the 1:1 mini-game table (v5).
 *
 * Three games ride the fuse: WOULD YOU RATHER (both pick, reveal the
 * match), TWO TRUTHS & A LIE (one writes, one calls the lie), and the
 * HOT SEAT (one question, sixty seconds, both answers under seal).
 * The server owns every clock and verdict — this is just the felt.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ListChecks, Scale, Timer, X } from "lucide-react";
import { useChat, type GameView } from "@/lib/chat-store";
import { StrangerAvatar } from "./stranger-avatar";

/* ── the picker ─────────────────────────────────────────── */

const GAMES: Array<{ id: "wyr" | "truths" | "hotseat"; name: string; blurb: string; icon: typeof Scale }> = [
  { id: "wyr", name: "WOULD YOU RATHER", blurb: "BOTH PICK · REVEAL THE MATCH", icon: Scale },
  { id: "truths", name: "TWO TRUTHS & A LIE", blurb: "ONE WRITES · ONE CALLS THE LIE", icon: ListChecks },
  { id: "hotseat", name: "HOT SEAT", blurb: "ONE QUESTION · 60 SEALED SECONDS", icon: Timer },
];

function Picker({ onPick }: { onPick: (g: "wyr" | "truths" | "hotseat") => void }) {
  return (
    <div className="grid gap-2.5">
      {GAMES.map((g) => (
        <motion.button
          key={g.id}
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => onPick(g.id)}
          className="group flex items-center gap-4 rounded-xl border border-cream/12 bg-ink/60 px-4 py-4 text-left transition-colors duration-200 hover:border-lime/50 hover:bg-ink-3/80"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cream/10 bg-ink-2 text-cream/70 transition-colors group-hover:border-lime/40 group-hover:text-lime">
            <g.icon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-sm font-bold tracking-wide">{g.name}</span>
            <span className="mt-0.5 block font-tech text-[9px] tracking-[0.18em] text-cream/45">
              {g.blurb}
            </span>
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/* ── waiting line ───────────────────────────────────────── */

function WaitingLine({ label }: { label: string }) {
  return (
    <p className="flex items-center justify-center gap-2 font-tech text-[10px] tracking-[0.2em] text-cream/50">
      <span className="flex gap-1" aria-hidden>
        <span className="typing-dot h-1 w-1 rounded-full bg-lime" />
        <span className="typing-dot h-1 w-1 rounded-full bg-lime" />
        <span className="typing-dot h-1 w-1 rounded-full bg-lime" />
      </span>
      {label}
    </p>
  );
}

/* ── WOULD YOU RATHER ───────────────────────────────────── */

function WyrGame({ view }: { view: GameView }) {
  const me = useChat((s) => s.me);
  const gameAnswer = useChat((s) => s.gameAnswer);
  const q = (view.q as string[]) ?? ["?", "?"];
  const mine = view.picks?.find((p) => p?.handle === me?.handle) ?? null;
  const theirs = view.picks?.find((p) => p && p.handle !== me?.handle) ?? null;

  if (view.phase === "answer" && !mine) {
    return (
      <div className="grid gap-2.5">
        <p className="text-center font-display text-lg font-bold leading-snug tracking-tight">WOULD YOU RATHER…</p>
        {(["a", "b"] as const).map((side, i) => (
          <motion.button
            key={side}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => gameAnswer({ choice: side })}
            className="rounded-xl border border-cream/15 bg-ink/60 px-4 py-4 text-center font-display text-sm font-bold leading-snug tracking-wide transition-colors duration-200 hover:border-lime/60 hover:bg-ink-3/80 hover:text-lime"
          >
            {q[i]}
          </motion.button>
        ))}
      </div>
    );
  }

  if (view.phase === "answer") {
    return (
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          {(["a", "b"] as const).map((side, i) => (
            <div
              key={side}
              className={`rounded-xl border px-3 py-3 text-center font-display text-xs font-bold leading-snug tracking-wide ${
                mine?.choice === side
                  ? "border-lime bg-lime/15 text-lime"
                  : "border-cream/10 text-cream/45"
              }`}
            >
              {q[i]}
            </div>
          ))}
        </div>
        <WaitingLine label="WAITING FOR THE OTHER MASK…" />
      </div>
    );
  }

  // reveal
  const match = mine && theirs && mine.choice === theirs.choice;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className={`rounded-xl border px-3 py-3 text-center font-display text-xs font-bold leading-snug tracking-wide ${mine?.choice === "a" ? "border-lime text-lime" : "border-cream/10 text-cream/45"}`}>
          {q[0]}
        </div>
        <div className={`rounded-xl border px-3 py-3 text-center font-display text-xs font-bold leading-snug tracking-wide ${mine?.choice === "b" ? "border-lime text-lime" : "border-cream/10 text-cream/45"}`}>
          {q[1]}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 rounded-xl border border-cream/10 bg-ink/60 px-4 py-3">
        <span className="font-tech text-[9px] tracking-[0.18em] text-cream/50">YOU — {mine?.choice.toUpperCase()}</span>
        <span className="font-tech text-[9px] tracking-[0.18em] text-cream/30">·</span>
        <span className="font-tech text-[9px] tracking-[0.18em] text-cream/50">THEM — {theirs?.choice.toUpperCase() ?? "—"}</span>
      </div>
      <p className={`text-center font-display text-xl font-bold tracking-tight ${match ? "text-lime" : "text-coral"}`}>
        {match ? "SAME WAVELENGTH." : "YOU WALK DIFFERENT PATHS."}
      </p>
    </div>
  );
}

/* ── TWO TRUTHS & A LIE ─────────────────────────────────── */

function TruthsGame({ view }: { view: GameView }) {
  const me = useChat((s) => s.me);
  const gameAnswer = useChat((s) => s.gameAnswer);
  const gameSubmit = useChat((s) => s.gameSubmit);
  const [lines, setLines] = useState(["", "", ""]);

  const iAmWriter = view.writer === me?.handle;

  if (view.phase === "write") {
    if (!iAmWriter) {
      return (
        <div className="grid gap-4 py-4 text-center">
          <p className="font-display text-lg font-bold tracking-tight">TWO TRUTHS & A LIE</p>
          <WaitingLine label="THE OTHER MASK IS WRITING THREE LINES…" />
          <p className="font-tech text-[9px] leading-relaxed tracking-[0.16em] text-cream/40">
            TWO WILL BE TRUE. ONE WILL BE A LIE. YOU CALL IT.
          </p>
        </div>
      );
    }
    const ready = lines.every((l) => l.trim().length >= 2);
    return (
      <div className="grid gap-3">
        <p className="text-center font-display text-lg font-bold tracking-tight">WRITE TWO TRUTHS & A LIE</p>
        <p className="text-center font-tech text-[9px] tracking-[0.16em] text-cream/40">
          THE VOID DECIDES WHICH IS THE LIE — EVEN YOU WON'T KNOW UNTIL THE REVEAL
        </p>
        {lines.map((l, i) => (
          <input
            key={i}
            value={l}
            onChange={(e) => setLines((arr) => arr.map((x, j) => (j === i ? e.target.value.slice(0, 80) : x)))}
            placeholder={`LINE ${i + 1}`}
            aria-label={`Statement ${i + 1}`}
            maxLength={80}
            className="w-full rounded-lg border border-cream/15 bg-ink px-4 py-3 font-tech text-[11px] tracking-[0.08em] text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-lime/60"
          />
        ))}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={!ready}
          onClick={() => gameSubmit(lines.map((l) => l.trim()))}
          className="rounded-full bg-lime py-3 font-tech text-[11px] font-medium tracking-[0.22em] text-ink transition-all enabled:hover:brightness-110 disabled:opacity-35"
        >
          LAY THEM ON THE TABLE
        </motion.button>
      </div>
    );
  }

  if (view.phase === "guess") {
    const shown = view.lines ?? [];
    if (iAmWriter) {
      return (
        <div className="grid gap-4 py-4 text-center">
          <p className="font-display text-lg font-bold tracking-tight">TWO TRUTHS & A LIE</p>
          <WaitingLine label="THEY'RE HUNTING YOUR LIE…" />
        </div>
      );
    }
    return (
      <div className="grid gap-2.5">
        <p className="text-center font-display text-lg font-bold tracking-tight">CALL THE LIE</p>
        {shown.map((l, i) => (
          <motion.button
            key={i}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => gameAnswer({ pick: i + 1 })}
            className="rounded-xl border border-cream/15 bg-ink/60 px-4 py-3.5 text-left font-display text-sm font-bold leading-snug tracking-wide transition-colors duration-200 hover:border-coral/60 hover:text-coral"
          >
            <span className="mr-2 font-tech text-[9px] tracking-[0.2em] text-cream/40">{i + 1}</span>
            {l}
          </motion.button>
        ))}
      </div>
    );
  }

  // reveal
  const shown = view.lines ?? [];
  const lie = view.lie ?? 0;
  return (
    <div className="grid gap-2.5">
      <p className="text-center font-display text-lg font-bold tracking-tight">THE TABLE TURNS OVER</p>
      {shown.map((l, i) => (
        <div
          key={i}
          className={`rounded-xl border px-4 py-3 font-display text-sm font-bold leading-snug tracking-wide ${
            i + 1 === lie
              ? "border-coral bg-coral/10 text-coral"
              : i + 1 === view.pick
                ? "border-cream/25 text-cream/70"
                : "border-cream/10 text-cream/50"
          }`}
        >
          <span className="mr-2 font-tech text-[9px] tracking-[0.2em] text-cream/40">{i + 1}</span>
          {l}
          {i + 1 === lie && <span className="ml-2 font-tech text-[9px] tracking-[0.2em] text-coral">THE LIE</span>}
        </div>
      ))}
      <p className={`text-center font-display text-xl font-bold tracking-tight ${view.correct ? "text-lime" : "text-coral"}`}>
        {iAmWriter
          ? view.correct
            ? "THEY BOUGHT YOUR LIE."
            : "THEY CAUGHT YOUR LIE."
          : view.correct
            ? "YOU SMELLED THE LIE."
            : "THE LIE SLIPPED PAST YOU."}
      </p>
    </div>
  );
}

/* ── HOT SEAT ───────────────────────────────────────────── */

function HotseatGame({ view }: { view: GameView }) {
  const me = useChat((s) => s.me);
  const gameAnswer = useChat((s) => s.gameAnswer);
  const [text, setText] = useState("");
  const [anchor, setAnchor] = useState(view.secondsLeft ?? 60);
  const [tick, setTick] = useState(0);

  /* a fresh server state re-anchors the clock (render-phase adjustment) */
  const incoming = view.secondsLeft ?? 60;
  if (anchor !== incoming) {
    setAnchor(incoming);
    setTick(0);
  }

  useEffect(() => {
    if (view.phase !== "answer") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [view.phase]);

  const myAnswer = view.answers?.find((a) => a?.handle === me?.handle) ?? null;
  const theirAnswer = view.answers?.find((a) => a && a.handle !== me?.handle) ?? null;
  const left = Math.max(0, anchor - tick);

  if (view.phase === "answer") {
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-bold tracking-tight">HOT SEAT</p>
          <span className={`rounded-full px-3 py-1 font-tech text-[10px] tracking-[0.16em] ${left <= 10 ? "bg-coral/15 text-coral" : "bg-lime/15 text-lime"}`}>
            {left}S
          </span>
        </div>
        <p className="rounded-xl border border-cream/12 bg-ink/60 px-4 py-3.5 text-center font-display text-sm font-bold leading-snug tracking-wide">
          {view.q}
        </p>
        {myAnswer ? (
          <div className="grid gap-3">
            <div className="rounded-xl border border-lime/40 bg-lime/10 px-4 py-3">
              <p className="font-tech text-[9px] tracking-[0.2em] text-lime/80">YOUR ANSWER — SEALED</p>
              <p className="mt-1.5 font-display text-sm font-medium leading-relaxed text-cream/85">{myAnswer.text}</p>
            </div>
            <WaitingLine label={theirAnswer ? "BOTH SEALED — REVEALING…" : "WAITING FOR THE OTHER MASK…"} />
          </div>
        ) : (
          <div className="grid gap-2.5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 200))}
              placeholder="answer under seal — nobody sees it until both are in"
              aria-label="Your sealed answer"
              rows={3}
              maxLength={200}
              className="w-full resize-none rounded-lg border border-cream/15 bg-ink px-4 py-3 text-[13px] leading-relaxed text-cream outline-none transition-colors placeholder:text-cream/30 focus:border-lime/60"
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              disabled={text.trim().length < 2}
              onClick={() => gameAnswer({ text: text.trim() })}
              className="rounded-full bg-lime py-3 font-tech text-[11px] font-medium tracking-[0.22em] text-ink transition-all enabled:hover:brightness-110 disabled:opacity-35"
            >
              SEAL IT
            </motion.button>
          </div>
        )}
      </div>
    );
  }

  // reveal
  return (
    <div className="grid gap-3">
      <p className="text-center font-display text-lg font-bold tracking-tight">THE SEALS BREAK</p>
      <p className="text-center font-tech text-[9px] leading-relaxed tracking-[0.16em] text-cream/45">{view.q}</p>
      {[myAnswer, theirAnswer].map((a, i) => (
        <div
          key={i}
          className={`rounded-xl border px-4 py-3 ${i === 0 ? "border-lime/40 bg-lime/10" : "border-cream/15 bg-ink/60"}`}
        >
          <p className="font-tech text-[9px] tracking-[0.2em] text-cream/45">
            {i === 0 ? "YOU" : (a?.handle ?? "THE OTHER MASK")}
          </p>
          <p className="mt-1.5 font-display text-sm font-medium leading-relaxed text-cream/90">
            {a?.text ?? "THE CLOCK ATE THEIR ANSWER."}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── the panel ──────────────────────────────────────────── */

export default function GamesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useChat((s) => s.me);
  const partner = useChat((s) => s.partner);
  const game = useChat((s) => s.game);
  const startGame = useChat((s) => s.startGame);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="games-panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Mini-games"
        >
          <button
            type="button"
            aria-label="Close games"
            onClick={onClose}
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative m-3 w-full max-w-md rounded-2xl border border-cream/12 bg-ink-2 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_28px_70px_-20px_rgba(0,0,0,0.85)] sm:m-0"
          >
            <div className="flex items-center justify-between">
              <p className="font-tech text-[9px] tracking-[0.26em] text-lime/80">ON THE TABLE</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-full border border-cream/15 text-cream/60 transition-colors hover:border-coral/60 hover:text-coral"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2.5">
              {me && <StrangerAvatar seed={me.seed} className="h-6 w-6" />}
              <span className="font-tech text-[9px] tracking-[0.18em] text-cream/40">YOU</span>
              <span className="font-tech text-[9px] text-coral">×</span>
              {partner && <StrangerAvatar seed={partner.seed} className="h-6 w-6" />}
              <span className="font-tech text-[9px] tracking-[0.18em] text-cream/40">THE STRANGER</span>
            </div>

            <div className="mt-5">
              <AnimatePresence mode="wait">
                {!game ? (
                  <motion.div
                    key="picker"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Picker onPick={startGame} />
                    <p className="mt-4 text-center font-tech text-[9px] leading-relaxed tracking-[0.16em] text-cream/35">
                      GAMES BURN WITH THE FUSE. NO SCORES SURVIVE THE ROOM.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`${game.game}-${game.phase}`}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                  >
                    {game.game === "wyr" && <WyrGame view={game} />}
                    {game.game === "truths" && <TruthsGame view={game} />}
                    {game.game === "hotseat" && <HotseatGame view={game} />}
                    {game.phase === "reveal" && (
                      <p className="mt-4 text-center font-tech text-[9px] tracking-[0.18em] text-cream/35">
                        THE TABLE CLEARS ITSELF IN A MOMENT.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
