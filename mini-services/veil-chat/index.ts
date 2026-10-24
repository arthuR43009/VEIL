/**
 * VEIL chat service — anonymous, zero-log, in-memory only.
 *
 * v5 — CIPHERS & GAMES
 *  - doors grow teeth: optional passwords, private code-only doors
 *    (invisible in the lobby, joinable by a spoken code), and optional
 *    burn timers (30/60 minutes) that torch the room on schedule
 *  - fuses get a reconnect grace: a dropped 1:1 partner holds the room
 *    for VEIL_FUSE_GRACE ms; returning with a resume token restores the
 *    same identity and the same conversation
 *  - NEXT MASK: a sanctioned skip with a server-enforced cooldown, so
 *    moving on never means hammering strangers
 *  - read receipts (seen), icebreaker sparks (room-tuned prompt banks),
 *    three 1:1 mini-games (WOULD YOU RATHER · TWO TRUTHS & A LIE ·
 *    HOT SEAT), and the secret handshake (both masks tap to reveal a
 *    shared-detail card with a vibe score)
 *  - keeper console grows a live mute-word list, report filters data,
 *    the night export (counts only), and operator stats: peak online,
 *    average fuse length, reports per hour
 *
 * Nothing is persisted — reports, blocks, mute words and conversations
 * all live in memory only and die with the process. If this process
 * dies, every conversation never existed. That is the product.
 * (Operational caveat: a redeploy clears active blocks — acceptable.)
 */
import { createServer } from "http";
import { Server, type Socket } from "socket.io";

/** hosting platforms (Render/Koyeb/Docker) inject PORT; locally defaults to 3003 */
const PORT = Number(process.env.PORT ?? 3003);

/** operator key for the keeper console — unset = console off duty */
const MOD_KEY = process.env.VEIL_MOD_KEY ?? "";
/** test/local mode: enforce blocks/restricts even on loopback/private ranges */
const ENFORCE_PRIVATE = process.env.VEIL_ENFORCE_PRIVATE === "1";
/** ms between reaper sweeps (door burn grace + TTL expiry sweeps) */
const REAP_EVERY = Number(process.env.VEIL_REAP_EVERY ?? 15_000);
/** how long an empty door survives a DROPPED CONNECTION (explicit leave burns instantly) */
const ROOM_TTL = Number(process.env.VEIL_ROOM_TTL ?? 20_000);
/** per-reporter cooldown between filing reports */
const REPORT_COOLDOWN = Number(process.env.VEIL_REPORT_COOLDOWN ?? 15_000);
/** how long a dropped 1:1 fuse holds its room open for a resume (v5) */
const FUSE_GRACE = Number(process.env.VEIL_FUSE_GRACE ?? 20_000);
/** server-enforced wait after NEXT MASK before the queue accepts you again (v5) */
const SKIP_COOLDOWN = Number(process.env.VEIL_SKIP_COOLDOWN ?? 6_000);
/** per-socket wait between icebreaker sparks (v5) */
const SPARK_COOLDOWN = Number(process.env.VEIL_SPARK_COOLDOWN ?? 8_000);
/** HOT SEAT answer window in seconds (v5; tests shrink it) */
const HOTSEAT_SECS = Number(process.env.VEIL_HOTSEAT_SECS ?? 60);
/** tests only: force every timed door's burnAt to now + this many ms (v5) */
const TEST_TTLMS = Number(process.env.VEIL_TEST_TTLMS ?? 0);

/* ── identities ─────────────────────────────────────────── */

const ADJ = [
  "HOLLOW", "VELVET", "SILENT", "CROOKED", "PALE", "MIDNIGHT",
  "RUSTY", "BROKEN", "VAGUE", "LUCKY", "SOUR", "FAINT", "GLASS",
  "IRON", "WICKED", "COSMIC", "EMPTY", "STRAY", "SOFT", "STATIC",
];

const NOUN = [
  "ECHO", "SIGNAL", "MOTH", "FOX", "RAVEN", "WOLF", "LANTERN",
  "MIRAGE", "SHADOW", "PULSE", "ORBIT", "PRISM", "GHOST", "SPECTER",
  "DRIFT", "HAZE", "EMBER", "VECTOR", "CIPHER", "TIDE",
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const num2 = () => String(Math.floor(Math.random() * 90) + 10);

interface Identity {
  id: string;
  handle: string;
  seed: string;
}

const newIdentity = (id: string): Identity => ({
  id,
  handle: `${pick(ADJ)} ${pick(NOUN)} ${num2()}`,
  seed: Math.random().toString(36).slice(2, 10),
});

/* ── rooms ──────────────────────────────────────────────── */

interface RoomInfo {
  id: string;
  name: string;
  tag: string;
  custom?: boolean;
}

const PUBLIC_ROOMS: RoomInfo[] = [
  { id: "void", name: "THE VOID", tag: "ANYTHING AND NOTHING" },
  { id: "afterdark", name: "AFTER DARK", tag: "LATE-NIGHT THOUGHTS ONLY" },
  { id: "confess", name: "CONFESSIONS", tag: "SAY THE UNSAYABLE" },
  { id: "moshpit", name: "MOSH PIT", tag: "SOUND ON · SHAME OFF" },
  { id: "arcade", name: "ARCADE", tag: "GAMES & SCOREBOARD TALK" },
  { id: "deepend", name: "DEEP END", tag: "PHILOSOPHY & 3AM THOUGHTS" },
];

/**
 * user-opened doors (v5):
 *  - password: an optional spoken key — the lobby shows a lock, joiners
 *    must present it
 *  - private + code: invisible doors. The code (6 unambiguous chars) IS
 *    the address — share it your own way; it dies with the door
 *  - burnAt: optional scheduled burn (timed rooms) — the reaper torches
 *    the door at the mark, everyone inside watches it go
 */
interface CustomRoom extends RoomInfo {
  emptySince: number | null;
  password?: string;
  private?: boolean;
  code?: string;
  burnAt?: number;
}
const customRooms = new Map<string, CustomRoom>();
/** door code -> roomId (private doors) */
const doorCodes = new Map<string, string>();

const MAX_CUSTOM_ROOMS = 12;

/** unambiguous alphabet for door codes (no I/L/O/0/1) */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newDoorCode = (): string => {
  for (let tries = 0; tries < 40; tries++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!doorCodes.has(code)) return code;
  }
  return `X${Date.now().toString(36).toUpperCase().slice(-5)}`;
};

const resolveRoom = (idOrCode: string): RoomInfo | null =>
  PUBLIC_ROOMS.find((r) => r.id === idOrCode) ??
  customRooms.get(idOrCode) ??
  (doorCodes.has(idOrCode) ? customRooms.get(doorCodes.get(idOrCode)!) ?? null : null);

/* ── interest tags ──────────────────────────────────────── */

/** how long a tagged mask waits for an affinity match before falling back to chance */
const TAG_TIMEOUT = Number(process.env.VEIL_TAG_TIMEOUT ?? 20_000);

const sanitizeTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const t of raw.slice(0, 8)) {
    const s = String(t ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 18);
    if (s.length >= 2) seen.add(s);
    if (seen.size >= 3) break;
  }
  return [...seen];
};

const overlap = (a: string[], b: string[]) => a.filter((t) => b.includes(t));

/* ── prompt banks (v5 — sparks & games) ─────────────────── */

/** icebreaker sparks, tuned per room (fuses + doors fall back to GENERIC) */
const SPARKS: Record<string, string[]> = {
  generic: [
    "WHAT BROUGHT YOU TO A CHAT THAT FORGETS EVERYTHING?",
    "DESCRIBE YOUR MOOD IN EXACTLY THREE WORDS.",
    "WHAT'S SOMETHING YOU'D NEVER SAY SIGNED?",
    "WHAT SONG IS ON REPEAT IN YOUR HEAD RIGHT NOW?",
    "WHAT'S THE LAST THING THAT MADE YOU LAUGH ALONE?",
    "WHAT'S A HOT TAKE YOU'D DEFEND AT 3AM?",
    "WHAT ARE YOU AVOIDING RIGHT NOW?",
  ],
  void: [
    "WHAT'S THE WEIRDEST THOUGHT YOU'VE HAD TODAY?",
    "SAY SOMETHING NOBODY NEEDS TO KNOW.",
    "WHAT'S YOUR MOST USELESS TALENT?",
    "IF TONIGHT HAD A TITLE, WHAT IS IT?",
  ],
  afterdark: [
    "WHAT KEPT YOU UP LAST NIGHT?",
    "WHAT'S A THOUGHT THAT ONLY VISITS AFTER MIDNIGHT?",
    "WHAT DO YOU DO WHEN YOU CAN'T SLEEP?",
    "WHAT'S THE LAST THING YOU DO BEFORE THE PHONE GOES DOWN?",
  ],
  confess: [
    "CONFESS SOMETHING HARMLESS.",
    "WHAT'S A SMALL CRIME YOU GOT AWAY WITH?",
    "WHAT HAVE YOU NEVER ADMITTED OUT LOUD — UNTIL NOW?",
    "WHAT'S THE PETTIEST THING YOU'VE EVER DONE?",
  ],
  moshpit: [
    "LAST SONG THAT GUTTED YOU?",
    "WORST CONCERT INJURY — YOURS OR SOMEONE ELSE'S?",
    "WHAT SONG DO YOU SING LIKE YOU WROTE IT?",
    "NAME A BAND YOU'D DEFEND WITH YOUR LIFE.",
  ],
  arcade: [
    "FIRST GAME THAT STOLE A SUMMER?",
    "WHAT GAME DID YOU RAGE-QUIT BUT MISS?",
    "WHAT'S YOUR UNPOPULAR GAMING OPINION?",
    "WHO MAKES YOUR PERFECT GAME?",
  ],
  deepend: [
    "WHAT DO YOU BELIEVE THAT NOBODY ELSE DOES?",
    "WHAT CHANGED YOUR MIND THIS YEAR?",
    "WHAT QUESTION DO YOU AVOID ASKING YOURSELF?",
    "WHAT WOULD YOU TELL EVERYONE IF IT WERE ANONYMOUS — WAIT, IT IS.",
  ],
};

/** WOULD YOU RATHER pairs — [option A, option B] */
const WYR_BANK: Array<[string, string]> = [
  ["LOSE ALL YOUR OLD MEMORIES", "LOSE THE ABILITY TO MAKE NEW ONES"],
  ["KNOW THE DATE OF YOUR DEATH", "KNOW THE CAUSE OF YOUR DEATH"],
  ["READ MINDS", "SEE TEN MINUTES INTO THE FUTURE"],
  ["BE THE FUNNIEST PERSON IN THE ROOM", "BE THE SMARTEST PERSON IN THE ROOM"],
  ["NEVER FEEL COLD AGAIN", "NEVER FEEL TIRED AGAIN"],
  ["HAVE UNLIMITED MONEY BUT NO FRIENDS", "HAVE TRUE LOVE BUT BE BROKE"],
  ["LIVE WITHOUT MUSIC", "LIVE WITHOUT MOVIES"],
  ["ALWAYS HAVE TO TELL THE TRUTH", "ALWAYS BE BELIEVED WHEN YOU LIE"],
  ["FIGHT ONE HORSE-SIZED DUCK", "FIGHT A HUNDRED DUCK-SIZED HORSES"],
  ["SPEAK EVERY LANGUAGE", "PLAY EVERY INSTRUMENT"],
  ["TIME TRAVEL ONCE WITH NO RETURN", "RELIVE ONE DAY FOREVER"],
  ["BE FORGOTTEN BY EVERYONE", "REMEMBER EVERYTHING FOREVER"],
  ["ONLY EVER NIGHTS", "ONLY EVER MORNINGS"],
  ["A DELETABLE PAST", "AN EDITABLE FUTURE"],
];

/** HOT SEAT questions — one per round, 60 seconds, both answer */
const HOTSEAT_BANK = [
  "WHAT WOULD YOU DO IF NOBODY EVER FOUND OUT?",
  "WHAT ARE YOU PRETENDING NOT TO WANT?",
  "WHAT DID YOU ALMOST DO TONIGHT?",
  "WHAT'S THE KINDEST THING A STRANGER EVER DID FOR YOU?",
  "WHAT DO YOU AVOID TALKING ABOUT AT PARTIES?",
  "WHAT'S A SMALL THING THAT RUINED YOUR DAY?",
  "WHAT DO YOU WANT TO BE REMEMBERED FOR — AND BY WHOM?",
  "WHAT'S THE LIE YOU TELL MOST OFTEN?",
  "WHAT ARE YOU PROUD OF THAT YOU CAN'T POST ANYWHERE?",
  "IF THIS CHAT ENDED NOW, WHAT WOULD YOU REGRET NOT SAYING?",
];

/* ── state (in-memory only) ─────────────────────────────── */

interface Client {
  identity: Identity;
  /** on probation — throttled messages, no reacts, no door-creating */
  restricted: boolean;
  ip: string;
  /** current context */
  ctx:
    | { kind: "idle" }
    | { kind: "queue" }
    | { kind: "fuse"; roomId: string; partnerId: string }
    | { kind: "room"; roomId: string };
}

const clients = new Map<string, Client>();

interface QueueEntry {
  id: string;
  tags: string[];
  since: number;
}
const queue: QueueEntry[] = [];

/* ── mini-games (v5, 1:1 fuses only) ────────────────────── */

type GameSession =
  | {
      game: "wyr";
      q: [string, string];
      /** picks[slot] = "a" | "b" | null */
      picks: [string | null, string | null];
      phase: "answer" | "reveal";
    }
  | {
      game: "truths";
      /** writer slot — the other mask guesses */
      writer: 0 | 1;
      lines: [string, string, string] | null;
      lieIndex: number;
      /** pick = the index the guesser called out (0-2) */
      pick: number | null;
      phase: "write" | "guess" | "reveal";
    }
  | {
      game: "hotseat";
      q: string;
      answers: [string | null, string | null];
      endsAt: number;
      phase: "answer" | "reveal";
    };

/* ── fuses (v5: full record — resume, stats, games, handshake) ── */

interface FuseRec {
  sids: [string, string];
  /** resume tokens, one per slot — a dropped mask presents theirs to come back */
  resume: [string, string];
  /** identity snapshots — a resumed mask gets its old face back */
  ident: [Identity, Identity];
  /** tag sets both queued with (for the handshake reveal) */
  tags: [string[], string[]];
  /** per-side message counts (vibe score input) */
  msgs: [number, number];
  /** total reaction ops in this fuse */
  reacts: number;
  startedAt: number;
  /** secret handshake taps per slot + sealed flag */
  hands: [boolean, boolean];
  handDone: boolean;
  game: GameSession | null;
  gameTimers: ReturnType<typeof setTimeout>[];
  /** reconnect grace: which slot dropped, when it expires, the reaper timer */
  grace: { slot: 0 | 1; until: number; timer: ReturnType<typeof setTimeout> } | null;
}

const fuseRooms = new Map<string, FuseRec>();
let fuseCounter = 0;
let doorCounter = 0;
const msgCounter = { n: 0 };
let reportCounter = 0;

const resumeToken = () => `rs-${Math.random().toString(36).slice(2, 12)}`;

const slotOf = (fuse: FuseRec, sid: string): 0 | 1 | -1 =>
  fuse.sids[0] === sid ? 0 : fuse.sids[1] === sid ? 1 : -1;

/* ── rate limiting ──────────────────────────────────────── */

class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private cap = 8, private refillPerSec = 0.8) {
    this.tokens = cap;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.cap, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

const buckets = new Map<string, TokenBucket>();
const bucketFor = (id: string): TokenBucket => {
  let b = buckets.get(id);
  if (!b) {
    // probation cuts the bucket to a trickle
    b = clients.get(id)?.restricted ? new TokenBucket(2, 0.2) : new TokenBucket(8, 0.8);
    buckets.set(id, b);
  }
  return b;
};

/** reaction ops are cheaper than messages — separate, tighter window */
const reactOps = new Map<string, number[]>();
const reactAllowed = (sid: string) => {
  const now = Date.now();
  const arr = (reactOps.get(sid) ?? []).filter((t) => now - t < 10_000);
  if (arr.length >= 12) {
    reactOps.set(sid, arr);
    return false;
  }
  arr.push(now);
  reactOps.set(sid, arr);
  return true;
};

/** one door per mask per window */
const lastCreate = new Map<string, number>();
const createAllowed = (sid: string) => {
  const now = Date.now();
  const last = lastCreate.get(sid) ?? 0;
  if (now - last < 12_000) return false;
  lastCreate.set(sid, now);
  return true;
};

/** NEXT MASK cooldown — the void needs a breath between strangers (v5) */
const skipCooldownUntil = new Map<string, number>();

/** icebreaker sparks — one per window per socket (v5) */
const lastSpark = new Map<string, number>();

/* ── reactions protocol ─────────────────────────────────── */

const REACTIONS = new Set(["SAME", "REAL", "OOF", "HA", "EYES"]);

/* ── the keepers (moderation) ───────────────────────────── */

/** report types with internal severity levels (for triage + thresholds) */
const REPORT_TYPES: Record<string, number> = {
  SCAM: 2,
  FRAUD: 3,
  MISCONDUCT: 1,
  ABUSE: 3,
  HARASSMENT: 3,
};

interface ReportEntry {
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
const reports: ReportEntry[] = [];

/** evidence ring per room — last 6 delivered lines, memory only */
const evidence = new Map<string, { h: string; c: string; at: number }[]>();
const rememberLine = (roomId: string, handle: string, text: string) => {
  const arr = evidence.get(roomId) ?? [];
  arr.push({ h: handle, c: text.slice(0, 160), at: Date.now() });
  if (arr.length > 6) arr.shift();
  evidence.set(roomId, arr);
};

/** active enforcement, per IP */
interface Punish {
  until: number;
  reason: string;
  by: string;
}
const blocks = new Map<string, Punish>();
const restricts = new Map<string, Punish>();

/** live aggregation while a target is still connected */
const cases = new Map<string, { reporters: Set<string>; score: number; ip: string }>();

/** reporter bookkeeping */
const lastReportAt = new Map<string, number>();
const reportPairs = new Map<string, Map<string, number>>();

/** per-reporter spam of the report button itself */
const ipReportLog = new Map<string, number[]>();

/** connection / message / limiter spam trackers (per IP) */
const connLog = new Map<string, number[]>();
const connFloodUntil = new Map<string, number>();
const ipMsgLog = new Map<string, number[]>();
const ipLimiterHits = new Map<string, number[]>();
const dupContents = new Map<string, { t: string; at: number }[]>();
const autoStrikes = new Map<string, number[]>();

const IP_MSG_LIMIT = 18; // per 10s across all sockets of one IP
const CONN_FLOOD_LIMIT = 6; // per 30s
const CONN_FLOOD_JAIL = 10 * 60_000;
const DUP_SPAM_LIMIT = 4; // same content per 60s
const LIMIT_ABUSE_LIMIT = 10; // rate-limited hits per 5min
const STRIKE_BLOCK = 3; // auto-restricts per 24h -> block

/* ── keeper mute words (v5 — live, editable from the console) ── */

let muteWords: string[] = [];
let muteRegex: RegExp | null = null;
let mutedHits = 0;

const rebuildMuteRegex = () => {
  if (muteWords.length === 0) {
    muteRegex = null;
    return;
  }
  const parts = muteWords
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter((w) => w.length > 0);
  muteRegex = parts.length > 0 ? new RegExp(`(?:^|[^A-Z0-9])(?:${parts.join("|")})(?:$|[^A-Z0-9])`, "i") : null;
};

const isMuted = (text: string): boolean => {
  if (!muteRegex) return false;
  if (muteRegex.test(text)) {
    mutedHits += 1;
    return true;
  }
  return false;
};

/* ── the night (v5 — operator stats, counts only) ───────── */

const night = {
  peakOnline: 0,
  peakAt: 0,
  msgsRelayed: 0,
  doorsBurned: 0,
  fusesDone: 0,
  /** rolling fuse durations (minutes), last 120 */
  fuseMins: [] as number[],
  notePeak: () => {
    const n = clients.size;
    if (n > night.peakOnline) {
      night.peakOnline = n;
      night.peakAt = Date.now();
    }
  },
};

const feed: { line: string; at: number; kind: string }[] = [];
const modLog = (kind: string, line: string) => {
  const at = Date.now();
  feed.push({ line, at, kind });
  if (feed.length > 60) feed.shift();
  io.to("keepers").emit("mod:feed", { line, at, kind });
};

/** client IP: last hop of x-forwarded-for (managed proxies append), else remote addr */
const ipOfSocket = (socket: Socket): string => {
  const xff = socket.handshake.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return socket.conn.remoteAddress ?? "unknown";
};

/**
 * loopback / LAN / carrier-grade NAT ranges are never auto-enforced:
 * blocking one would lock out a whole household or thousands of mobile
 * users behind it. Set VEIL_ENFORCE_PRIVATE=1 (tests) to override.
 */
const privateRange = (ip: string): boolean =>
  ip === "unknown" ||
  ip.startsWith("127.") ||
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  ip.startsWith("169.254.") ||
  ip.startsWith("100.64.") ||
  ip.startsWith("100.65.") ||
  ip.startsWith("100.66.") ||
  ip.startsWith("100.67.") ||
  ip.startsWith("100.68.") ||
  ip.startsWith("100.69.") ||
  ip.startsWith("100.7") ||
  ip.startsWith("172.16.") ||
  ip.startsWith("172.17.") ||
  ip.startsWith("172.18.") ||
  ip.startsWith("172.19.") ||
  ip.startsWith("172.2") ||
  ip.startsWith("172.30.") ||
  ip.startsWith("172.31.") ||
  ip === "::1" ||
  ip.startsWith("fc") ||
  ip.startsWith("fd") ||
  ip.startsWith("fe80");

const enforceable = (ip: string): boolean => !privateRange(ip) || ENFORCE_PRIVATE;

const fmtIP = (ip: string) => (ip === "" ? "?" : ip);

/** apply a restriction — extends existing, never shortens */
const restrictIP = (ip: string, hours: number, reason: string, by: string): boolean => {
  if (!enforceable(ip)) {
    modLog("spam", `AUTO-RESTRICT SKIPPED — ${fmtIP(ip)} IS A PROTECTED RANGE (${reason})`);
    return false;
  }
  const until = Date.now() + hours * 3_600_000;
  const prev = restricts.get(ip);
  restricts.set(ip, { until: prev ? Math.max(prev.until, until) : until, reason, by });
  for (const [sid, c] of clients) {
    if (c.ip !== ip) continue;
    c.restricted = true;
    buckets.delete(sid); // recreate at probation strength
    io.sockets.sockets.get(sid)?.emit("error", {
      code: "RESTRICTED",
      message: "THE KEEPERS HAVE PUT YOU ON PROBATION. EASE OFF.",
      until,
    });
  }
  modLog("action", `RESTRICT ${fmtIP(ip)} — ${hours}H · ${reason} · BY ${by}`);
  return true;
};

/** apply a hard block — kicks live sockets, rejects new connects */
const blockIP = (ip: string, hours: number, reason: string, by: string): boolean => {
  if (!enforceable(ip)) {
    modLog("spam", `AUTO-BLOCK SKIPPED — ${fmtIP(ip)} IS A PROTECTED RANGE (${reason})`);
    return false;
  }
  blocks.set(ip, { until: Date.now() + hours * 3_600_000, reason, by });
  restricts.delete(ip);
  for (const [sid, c] of clients) {
    if (c.ip !== ip) continue;
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    s.emit("mod:blocked", { until: blocks.get(ip)!.until, reason });
    setTimeout(() => s.disconnect(true), 600);
  }
  modLog("action", `BLOCK ${fmtIP(ip)} — ${hours}H · ${reason} · BY ${by}`);
  return true;
};

/** every auto-restrict counts as a strike; 3 strikes in 24h escalate to a block */
const strike = (ip: string, reason: string, hours = 1) => {
  const now = Date.now();
  const arr = (autoStrikes.get(ip) ?? []).filter((t) => now - t < 86_400_000);
  arr.push(now);
  autoStrikes.set(ip, arr);
  if (arr.length >= STRIKE_BLOCK) {
    autoStrikes.delete(ip);
    blockIP(ip, 48, `REPEAT OFFENDER — ${arr.length} STRIKES`, "THE KEEPERS");
    return;
  }
  restrictIP(ip, hours, reason, "THE KEEPERS");
};

const slidingPush = (map: Map<string, number[]>, key: string, windowMs: number): number[] => {
  const now = Date.now();
  const arr = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  map.set(key, arr);
  return arr;
};

/* ── typing presence (lobby) ────────────────────────────── */

/** roomId -> sockets currently typing (door rooms only; fuses stay private) */
const typingByRoom = new Map<string, Set<string>>();

const roomTypers = (roomId: string): number => {
  const set = typingByRoom.get(roomId);
  if (!set) return 0;
  for (const sid of [...set]) {
    const c = clients.get(sid);
    if (!c || c.ctx.kind !== "room" || c.ctx.roomId !== roomId) set.delete(sid);
  }
  return set.size;
};

/* ── helpers ────────────────────────────────────────────── */

const membersOf = (roomId: string): Identity[] => {
  const list: Identity[] = [];
  for (const [sid, c] of clients) {
    if (c.ctx.kind === "room" && c.ctx.roomId === roomId) list.push(c.identity);
  }
  return list;
};

/** find the socket id of a member by identity id (for reports) */
const memberSocketOf = (roomId: string, identityId: string): string | null => {
  for (const [sid, c] of clients) {
    if (c.ctx.kind === "room" && c.ctx.roomId === roomId && c.identity.id === identityId) return sid;
  }
  return null;
};

const emitMembers = (roomId: string) => {
  io.to(`room:${roomId}`).emit("room:members", { members: membersOf(roomId) });
};

const presence = () => {
  const waiting = queue.length;
  const rooms = [
    ...PUBLIC_ROOMS.map((r) => ({
      id: r.id,
      name: r.name,
      tag: r.tag,
      custom: false,
      count: membersOf(r.id).length,
      typing: roomTypers(r.id),
      masks: membersOf(r.id).slice(0, 5).map((m) => m.seed),
    })),
    ...[...customRooms.values()]
      .filter((r) => !r.private) // code-only doors are invisible from here
      .map((r) => ({
        id: r.id,
        name: r.name,
        tag: r.tag,
        custom: true,
        count: membersOf(r.id).length,
        typing: roomTypers(r.id),
        masks: membersOf(r.id).slice(0, 5).map((m) => m.seed),
        lock: !!r.password,
        burnIn: r.burnAt ? Math.max(0, Math.ceil((r.burnAt - Date.now()) / 1000)) : undefined,
      })),
  ];
  let fused = 0;
  for (const [, f] of fuseRooms) fused += f.sids.length;
  io.emit("presence", { online: clients.size, waiting, rooms, fused });
};

let presenceDirty = false;
const markDirty = () => {
  presenceDirty = true;
};
setInterval(() => {
  if (presenceDirty) {
    presenceDirty = false;
    presence();
  }
}, 1500);

const systemMsg = (content: string) => ({
  id: `s${Date.now().toString(36)}${(msgCounter.n += 1)}`,
  content,
});

/** a custom door dies in flames — the lobby watches it burn */
const burnDoor = (roomId: string) => {
  const r = customRooms.get(roomId);
  if (!r) return;
  customRooms.delete(roomId);
  if (r.code) doorCodes.delete(r.code);
  evidence.delete(roomId);
  night.doorsBurned += 1;
  io.emit("door:burned", { roomId, name: r.name });
  markDirty();
};

/** rip a fuse room apart and clean every trace (timers, game, evidence) */
const killFuse = (roomId: string) => {
  const fuse = fuseRooms.get(roomId);
  if (!fuse) return;
  if (fuse.grace) clearTimeout(fuse.grace.timer);
  for (const t of fuse.gameTimers) clearTimeout(t);
  fuseRooms.delete(roomId);
  evidence.delete(roomId);
  night.fusesDone += 1;
  const mins = (Date.now() - fuse.startedAt) / 60_000;
  night.fuseMins.push(mins);
  if (night.fuseMins.length > 120) night.fuseMins.shift();
};

/* ── FUSE pairing ───────────────────────────────────────── */

function fusePair(aId: string, bId: string, shared: string[], aTags: string[], bTags: string[]) {
  const ca = clients.get(aId);
  const cb = clients.get(bId);
  if (!ca || !cb) return;
  const roomId = `fuse-${(fuseCounter += 1)}`;
  fuseRooms.set(roomId, {
    sids: [aId, bId],
    resume: [resumeToken(), resumeToken()],
    ident: [ca.identity, cb.identity],
    tags: [aTags, bTags],
    msgs: [0, 0],
    reacts: 0,
    startedAt: Date.now(),
    hands: [false, false],
    handDone: false,
    game: null,
    gameTimers: [],
    grace: null,
  });
  io.sockets.sockets.get(aId)?.join(`room:${roomId}`);
  io.sockets.sockets.get(bId)?.join(`room:${roomId}`);
  ca.ctx = { kind: "fuse", roomId, partnerId: bId };
  cb.ctx = { kind: "fuse", roomId, partnerId: aId };
  const via = shared.length > 0 ? "INTERESTS" : "CHANCE";
  io.sockets.sockets.get(aId)?.emit("matched", {
    partner: cb.identity,
    shared,
    via,
    resumeId: fuseRooms.get(roomId)!.resume[0],
  });
  io.sockets.sockets.get(bId)?.emit("matched", {
    partner: ca.identity,
    shared,
    via,
    resumeId: fuseRooms.get(roomId)!.resume[1],
  });
  markDirty();
}

/**
 * Scan the queue for pairs:
 *  - shared tag  → pair (affinity)
 *  - both tagless → pair (pure chance, like v2)
 *  - either waited past TAG_TIMEOUT → pair (fallback so nobody hangs)
 *  - tagged + tagless, neither timed out → keep waiting
 */
function tryMatch() {
  // drop dead / stale entries first
  for (let i = queue.length - 1; i >= 0; i--) {
    const c = clients.get(queue[i].id);
    if (!c || c.ctx.kind !== "queue") queue.splice(i, 1);
  }
  let matched = true;
  while (matched) {
    matched = false;
    scan: for (let i = 0; i < queue.length - 1; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];
        const shared = overlap(a.tags, b.tags);
        const bothFree = a.tags.length === 0 && b.tags.length === 0;
        const timedOut = Date.now() - a.since > TAG_TIMEOUT || Date.now() - b.since > TAG_TIMEOUT;
        if (shared.length > 0 || bothFree || timedOut) {
          const aTags = a.tags;
          const bTags = b.tags;
          queue.splice(j, 1);
          queue.splice(i, 1);
          fusePair(a.id, b.id, shared, aTags, bTags);
          matched = true;
          break scan;
        }
      }
    }
  }
}

setInterval(tryMatch, 2000);

/* ── room join (shared by predefined / custom / created) ── */

function joinRoom(socket: Socket, room: RoomInfo) {
  const client = clients.get(socket.id);
  if (!client) return;
  leaveCurrent(socket, true, "leave");
  if (customRooms.has(room.id)) customRooms.get(room.id)!.emptySince = null;
  client.ctx = { kind: "room", roomId: room.id };
  socket.join(`room:${room.id}`);

  // the door's own face — creators additionally get the code (never broadcast)
  const cr = customRooms.get(room.id);
  const roomFace: RoomInfo & { hasPass?: boolean; code?: string; burnIn?: number } = { ...room };
  if (cr) {
    roomFace.hasPass = !!cr.password;
    if (cr.code) roomFace.code = cr.code;
    if (cr.burnAt) roomFace.burnIn = Math.max(0, Math.ceil((cr.burnAt - Date.now()) / 1000));
  }
  socket.emit("room:joined", { room: roomFace, members: membersOf(room.id) });
  io.to(`room:${room.id}`).emit("msg:new", {
    ...systemMsg(`${client.identity.handle} SLIPPED IN.`),
    kind: "system",
    at: Date.now(),
  });
  emitMembers(room.id);
  markDirty();
}

/* ── context transitions ────────────────────────────────── */

function leaveCurrent(socket: Socket, silent = false, cause: "leave" | "disconnect" = "leave") {
  const client = clients.get(socket.id);
  if (!client) return;

  const ctx = client.ctx;
  // detach FIRST so membersOf() no longer counts this socket
  client.ctx = { kind: "idle" };
  markDirty();

  if (ctx.kind === "queue") {
    const i = queue.findIndex((e) => e.id === socket.id);
    if (i !== -1) queue.splice(i, 1);
  } else if (ctx.kind === "fuse") {
    const fuse = fuseRooms.get(ctx.roomId);
    if (!fuse) return;
    const slot = slotOf(fuse, socket.id);
    if (slot === -1) return;

    if (cause === "disconnect" && !fuse.grace) {
      /* v5 — the dropped mask gets a moment to fight its way back.
       * The fuse holds; the partner watches a ghost countdown instead
       * of an immediate goodbye. */
      const other = slot === 0 ? 1 : 0;
      const otherSid = fuse.sids[other];
      const otherLive = !!clients.get(otherSid);
      if (!otherLive) {
        // both masks are gone — nobody left to wait for
        killFuse(ctx.roomId);
        socket.leave(`room:${ctx.roomId}`);
        return;
      }
      socket.leave(`room:${ctx.roomId}`);
      const handle = fuse.ident[slot].handle;
      fuse.grace = {
        slot,
        until: Date.now() + FUSE_GRACE,
        timer: setTimeout(() => {
          const f = fuseRooms.get(ctx.roomId);
          if (!f) return;
          // grace burned through — the fuse dies, the partner is told
          const partnerSid = f.sids[other];
          killFuse(ctx.roomId);
          const partner = clients.get(partnerSid);
          io.sockets.sockets.get(partnerSid)?.leave(`room:${ctx.roomId}`);
          if (partner) {
            partner.ctx = { kind: "idle" };
            io.to(partnerSid).emit("partner:left", { handle, reason: "LOST" });
          }
          markDirty();
        }, FUSE_GRACE),
      };
      io.to(otherSid).emit("partner:reconnecting", { handle, grace: Math.round(FUSE_GRACE / 1000) });
      markDirty();
      return;
    }

    /* intentional leave (or a second drop while grace runs) — the fuse dies now */
    const partnerId = fuse.sids[slot === 0 ? 1 : 0];
    const partner = clients.get(partnerId);
    killFuse(ctx.roomId);
    socket.leave(`room:${ctx.roomId}`);
    io.sockets.sockets.get(partnerId)?.leave(`room:${ctx.roomId}`);
    if (partner) {
      partner.ctx = { kind: "idle" };
      if (!silent) {
        io.to(partnerId).emit("partner:left", { handle: client.identity.handle, reason: cause === "disconnect" ? "LOST" : "LEFT" });
      }
    }
  } else if (ctx.kind === "room") {
    socket.leave(`room:${ctx.roomId}`);
    typingByRoom.get(ctx.roomId)?.delete(socket.id);
    if (!silent) {
      io.to(`room:${ctx.roomId}`).emit("msg:new", {
        ...systemMsg(`${client.identity.handle} VANISHED.`),
        kind: "system",
        at: Date.now(),
      });
    }
    emitMembers(ctx.roomId);
    const cr = customRooms.get(ctx.roomId);
    if (cr && membersOf(ctx.roomId).length === 0) {
      if (cause === "disconnect") {
        // dropped connection: give them a moment to come back, then burn it
        if (cr.emptySince === null) cr.emptySince = Date.now();
      } else {
        // everyone walked out on purpose — the door burns NOW
        burnDoor(ctx.roomId);
      }
    }
  }
}

/* ── report handling ────────────────────────────────────── */

interface Ack {
  (res: { ok: boolean; error?: string; [k: string]: unknown }): void;
}

const handleReport = (socket: Socket, payload: { type?: unknown; targetId?: unknown; note?: unknown }): { ok: boolean; error?: string } => {
  const client = clients.get(socket.id);
  if (!client) return { ok: false, error: "THE KEEPERS LOST YOU." };
  if (client.ctx.kind !== "fuse" && client.ctx.kind !== "room") {
    return { ok: false, error: "YOU'RE NOT IN A CONVERSATION." };
  }
  const type = String(payload.type ?? "").toUpperCase();
  const level = REPORT_TYPES[type];
  if (!level) return { ok: false, error: "PICK WHAT HAPPENED." };

  const now = Date.now();

  // resolve the target — must still be present in the same conversation
  let targetSid: string | null = null;
  let target: Client | null = null;
  let roomName = "";
  if (client.ctx.kind === "fuse") {
    roomName = "1:1 FUSE";
    targetSid = client.ctx.partnerId;
    target = targetSid ? clients.get(targetSid) ?? null : null;
    if (!target) return { ok: false, error: "THE MASK IS ALREADY GONE." };
    if (target.ctx.kind !== "fuse") return { ok: false, error: "THE MASK IS ALREADY GONE." };
  } else {
    roomName = resolveRoom(client.ctx.roomId)?.name ?? "A ROOM";
    const targetId = String(payload.targetId ?? "");
    targetSid = memberSocketOf(client.ctx.roomId, targetId);
    target = targetSid ? clients.get(targetSid) ?? null : null;
    if (!target) return { ok: false, error: "THE MASK IS ALREADY GONE." };
    if (targetSid === socket.id) return { ok: false, error: "YOU CAN'T REPORT YOUR OWN MASK." };
  }

  // reporter cooldown + dedupe against the same target
  if (now - (lastReportAt.get(socket.id) ?? 0) < REPORT_COOLDOWN) {
    return { ok: false, error: "THE KEEPERS NEED A BREATH. TRY AGAIN IN A MOMENT." };
  }
  const pairs = reportPairs.get(socket.id) ?? new Map<string, number>();
  const lastAgainst = pairs.get(target!.identity.id) ?? 0;
  if (now - lastAgainst < 3_600_000) {
    return { ok: false, error: "ALREADY FILED FOR THIS MASK." };
  }

  const note = String(payload.note ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const roomId = client.ctx.kind === "fuse" ? client.ctx.roomId : (client.ctx as { roomId: string }).roomId;
  const ctxLines = (evidence.get(roomId) ?? []).slice(-6);

  lastReportAt.set(socket.id, now);
  pairs.set(target!.identity.id, now);
  reportPairs.set(socket.id, pairs);

  const targetIP = target!.ip;
  const entry: ReportEntry = {
    id: `r${(reportCounter += 1)}`,
    at: now,
    type,
    level,
    note,
    reporterHandle: client.identity.handle,
    targetHandle: target!.identity.handle,
    targetSeed: target!.identity.seed,
    roomName,
    targetIP,
    context: ctxLines,
    action: "LOGGED",
  };
  reports.push(entry);
  if (reports.length > 100) reports.shift();
  modLog("report", `REPORT ${type} L${level} — ${client.identity.handle} → ${target!.identity.handle} (${roomName})`);

  // report-button abuse: one IP filing constantly is itself conduct
  const ipArr = slidingPush(ipReportLog, client.ip, 3_600_000);
  if (ipArr.length > 8) {
    strike(client.ip, "REPORT SPAM", 1);
    ipReportLog.set(client.ip, []);
  }

  // aggregate while the target is connected — act at thresholds
  const caseEntry = cases.get(targetSid!) ?? { reporters: new Set<string>(), score: 0, ip: targetIP };
  caseEntry.reporters.add(socket.id);
  caseEntry.score += level;
  cases.set(targetSid!, caseEntry);
  const distinct = caseEntry.reporters.size;

  let acted = false;
  if (distinct >= 3 || (distinct >= 2 && caseEntry.score >= 6)) {
    acted = blockIP(targetIP, 48, `REPORTS — ${distinct} MASKS, LEVEL ${caseEntry.score}`, "THE KEEPERS");
    entry.action = acted ? "BLOCK 48H" : "LOGGED (PROTECTED IP)";
  } else if (distinct >= 2) {
    acted = restrictIP(targetIP, 24, `REPORTS — ${distinct} MASKS, LEVEL ${caseEntry.score}`, "THE KEEPERS");
    entry.action = acted ? "RESTRICT 24H" : "LOGGED (PROTECTED IP)";
  }
  return { ok: true };
};

/* ── keeper console state ───────────────────────────────── */

const modState = () => {
  const now = Date.now();
  const punishList = (m: Map<string, Punish>) =>
    [...m.entries()].map(([ip, p]) => ({ ip, reason: p.reason, by: p.by, remaining: Math.max(0, p.until - now) }));
  let fused = 0;
  for (const [, f] of fuseRooms) fused += f.sids.length;

  // the night, in counts only — no content, ever
  const reportsByType: Record<string, number> = {};
  let reportsLastHour = 0;
  for (const r of reports) {
    reportsByType[r.type] = (reportsByType[r.type] ?? 0) + 1;
    if (now - r.at < 3_600_000) reportsLastHour += 1;
  }
  const fuseMins = night.fuseMins;
  const avgFuseMin = fuseMins.length > 0 ? fuseMins.reduce((a, b) => a + b, 0) / fuseMins.length : 0;

  return {
    stats: {
      online: clients.size,
      rooms: PUBLIC_ROOMS.length + customRooms.size,
      doors: customRooms.size,
      fused,
      reports: reports.length,
    },
    reports: reports.slice(-40).reverse(),
    blocks: punishList(blocks),
    restricts: punishList(restricts),
    feed: feed.slice(-30).reverse(),
    mutewords: muteWords,
    night: {
      peakOnline: night.peakOnline,
      peakAt: night.peakAt,
      msgsRelayed: night.msgsRelayed,
      mutedHits,
      doorsBurned: night.doorsBurned,
      fusesDone: night.fusesDone,
      avgFuseMin: Math.round(avgFuseMin * 10) / 10,
      reportsByType,
      reportsLastHour,
    },
  };
};

/* ── server ─────────────────────────────────────────────── */

/**
 * NOTE: socket.io owns path "/" (sandbox gateway constraint), which means
 * engine.io intercepts EVERY http request — plain GETs get a 400 JSON.
 * Health checks / keep-alive pings should hit /?EIO=4&transport=polling
 * instead, which returns 200 + the engine handshake.
 */
const httpServer = createServer();
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards on `/`
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 8e3,
});

io.on("connection", (socket) => {
  const ip = ipOfSocket(socket);

  // hard block — the doors stay closed to this IP
  const block = blocks.get(ip);
  if (block && block.until > Date.now()) {
    socket.emit("error", {
      code: "BLOCKED",
      message: "THE DOORS ARE CLOSED TO YOU. COME BACK WHEN THEY REOPEN.",
      until: block.until,
    });
    socket.disconnect(true);
    return;
  }

  // connection flood — too many handshakes from one IP
  const flood = connFloodUntil.get(ip) ?? 0;
  if (flood > Date.now()) {
    socket.emit("error", { code: "CONN_FLOOD", message: "TOO MANY MASKS FROM WHERE YOU STAND. SLOW DOWN." });
    socket.disconnect(true);
    return;
  }
  const conns = slidingPush(connLog, ip, 30_000);
  conns.push(Date.now());
  if (conns.length > CONN_FLOOD_LIMIT) {
    connFloodUntil.set(ip, Date.now() + CONN_FLOOD_JAIL);
    modLog("spam", `CONN FLOOD — ${fmtIP(ip)} REJECTED FOR 10M`);
    socket.emit("error", { code: "CONN_FLOOD", message: "TOO MANY MASKS FROM WHERE YOU STAND. SLOW DOWN." });
    socket.disconnect(true);
    return;
  }

  const client: Client = {
    identity: newIdentity(socket.id),
    restricted: false,
    ip,
    ctx: { kind: "idle" },
  };
  clients.set(socket.id, client);
  night.notePeak();
  const punish = restricts.get(ip);
  if (punish && punish.until > Date.now()) {
    client.restricted = true;
    socket.emit("error", {
      code: "RESTRICTED",
      message: "THE KEEPERS HAVE YOU ON PROBATION. EASE OFF.",
      until: punish.until,
    });
  }
  socket.emit("identity", { identity: client.identity });
  markDirty();

  socket.on("identity:reroll", () => {
    const c = clients.get(socket.id);
    if (!c) return;
    if (c.ctx.kind === "fuse" || c.ctx.kind === "room") return; // locked mid-chat
    c.identity = newIdentity(socket.id);
    socket.emit("identity", { identity: c.identity });
  });

  /* ── keeper console ── */
  socket.on("mod:auth", ({ key }: { key?: unknown }, ack?: Ack) => {
    const reply = (r: { ok: boolean; error?: string; state?: ReturnType<typeof modState> }) => {
      if (typeof ack === "function") ack(r);
      else if (!r.ok) socket.emit("error", { code: "MOD_AUTH", message: r.error ?? "DENIED." });
    };
    if (!MOD_KEY) return reply({ ok: false, error: "THE KEEPERS ARE OFF DUTY. SET VEIL_MOD_KEY." });
    if (String(key ?? "") !== MOD_KEY) return reply({ ok: false, error: "THAT'S NOT THE WORD." });
    socket.join("keepers");
    reply({ ok: true, state: modState() });
  });

  socket.on("mod:act", (p: { op?: unknown; ip?: unknown; hours?: unknown; reportId?: unknown; words?: unknown }, ack?: Ack) => {
    if (!MOD_KEY || !socket.rooms.has("keepers")) {
      if (typeof ack === "function") ack({ ok: false, error: "NOT ON DUTY." });
      return;
    }
    const op = String(p.op ?? "");
    const ip = String(p.ip ?? "").trim();
    const hours = Math.min(48, Math.max(1, Number(p.hours) || 24));
    const replyState = (ok: boolean, error?: string, extra?: Record<string, unknown>) => {
      const r = ok ? { ok: true, state: modState(), ...extra } : { ok: false, error };
      if (typeof ack === "function") ack(r);
    };

    if (op === "block") {
      if (!ip) return replyState(false, "AN IP, KEEPER.");
      blockIP(ip, hours, "BY HAND", "KEEPER CONSOLE");
      return replyState(true);
    }
    if (op === "restrict") {
      if (!ip) return replyState(false, "AN IP, KEEPER.");
      restrictIP(ip, hours, "BY HAND", "KEEPER CONSOLE");
      return replyState(true);
    }
    if (op === "lift:block") {
      blocks.delete(ip);
      modLog("action", `LIFT BLOCK — ${fmtIP(ip)}`);
      return replyState(true);
    }
    if (op === "lift:restrict") {
      restricts.delete(ip);
      for (const [sid, c] of clients) {
        if (c.ip === ip) {
          c.restricted = false;
          buckets.delete(sid);
        }
      }
      modLog("action", `LIFT PROBATION — ${fmtIP(ip)}`);
      return replyState(true);
    }
    if (op === "escalate") {
      const rep = reports.find((r) => r.id === String(p.reportId ?? ""));
      if (!rep) return replyState(false, "NO SUCH REPORT.");
      const done = blockIP(rep.targetIP, 48, `ESCALATED FROM ${rep.id}`, "KEEPER CONSOLE");
      rep.action = done ? "BLOCK 48H — KEEPER" : "LOGGED (PROTECTED IP)";
      return replyState(true);
    }
    if (op === "mutewords:set") {
      // live mute-word list — applies to the next message, everywhere
      const raw = Array.isArray(p.words) ? p.words : [];
      muteWords = [...new Set(
        raw
          .slice(0, 40)
          .map((w) => String(w ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24))
          .filter((w) => w.length >= 2),
      )];
      rebuildMuteRegex();
      modLog("action", `MUTE WORDS SET — ${muteWords.length} IN THE BOOK`);
      return replyState(true);
    }
    if (op === "export:night") {
      // counts only — no handles, no content, no IPs beyond punishment tables
      const st = modState();
      return replyState(true, undefined, {
        export: {
          exportedAt: Date.now(),
          ...st.stats,
          night: st.night,
          blocks: st.blocks.length,
          restricts: st.restricts.length,
        },
      });
    }
    return replyState(false, "UNKNOWN HAND.");
  });

  /* ── FUSE queue ── */
  socket.on("fuse:queue", ({ tags }: { tags?: unknown }) => {
    const c = clients.get(socket.id);
    if (!c) return;
    // NEXT MASK cooldown — the void enforces its own breath (v5)
    const cool = skipCooldownUntil.get(socket.id) ?? 0;
    if (Date.now() < cool) {
      socket.emit("error", {
        code: "SKIP_COOLDOWN",
        message: "THE VOID NEEDS A BREATH BEFORE THE NEXT MASK.",
        wait: cool - Date.now(),
      });
      return;
    }
    leaveCurrent(socket, true, "leave");
    c.ctx = { kind: "queue" };
    queue.push({ id: socket.id, tags: sanitizeTags(tags), since: Date.now() });
    socket.emit("queue:joined", { waiting: queue.length });
    markDirty();
    tryMatch();
  });

  socket.on("fuse:cancel", () => {
    const c = clients.get(socket.id);
    if (c?.ctx.kind === "queue") leaveCurrent(socket, true, "leave");
  });

  /* ── rooms (join by id OR door code; locked doors want the key) ── */
  socket.on("room:join", (p: { roomId?: unknown; password?: unknown }, ack?: Ack) => {
    const c = clients.get(socket.id);
    if (!c) return;
    // ids stay as typed ("void", "door-7"); door codes are uppercase — try both
    const raw = String(p?.roomId ?? "").trim();
    const room = resolveRoom(raw) ?? resolveRoom(raw.toUpperCase());
    if (!room) {
      const err = { ok: false, error: "NO DOOR ANSWERS TO THAT CODE." };
      socket.emit("error", { code: "NO_DOOR", message: err.error });
      if (typeof ack === "function") ack(err);
      return;
    }
    const cr = customRooms.get(room.id);
    if (cr?.password) {
      const pass = String(p?.password ?? "").trim();
      if (!pass) {
        const err = { ok: false, error: "THAT DOOR IS LOCKED. SPEAK THE KEY." };
        socket.emit("error", { code: "NEED_KEY", message: err.error, roomId: room.id });
        if (typeof ack === "function") ack(err);
        return;
      }
      if (pass !== cr.password) {
        const err = { ok: false, error: "THAT'S NOT THE KEY." };
        socket.emit("error", { code: "DOOR_LOCKED", message: err.error, roomId: room.id });
        if (typeof ack === "function") ack(err);
        return;
      }
    }
    joinRoom(socket, room);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("room:leave", () => leaveCurrent(socket, false, "leave"));

  /* ── open a custom door (v5: password · code-only · burn timer) ── */
  socket.on("room:create", (p: { name?: unknown; password?: unknown; privacy?: unknown; ttlMin?: unknown }, ack?: Ack) => {
    const c = clients.get(socket.id);
    if (!c) return;
    if (c.restricted) {
      socket.emit("error", { code: "RESTRICTED", message: "THE KEEPERS WON'T LET YOU OPEN DOORS TONIGHT." });
      return;
    }
    const clean = String(p?.name ?? "")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .slice(0, 24);
    if (clean.length < 2) {
      socket.emit("error", { code: "BAD_NAME", message: "A DOOR NEEDS A NAME — 2 TO 24 CHARACTERS." });
      return;
    }
    if (!createAllowed(socket.id)) {
      socket.emit("error", { code: "SLOW_DOWN", message: "ONE DOOR AT A TIME. GIVE IT A MOMENT." });
      return;
    }
    if (customRooms.size >= MAX_CUSTOM_ROOMS) {
      socket.emit("error", { code: "TOO_MANY", message: "TOO MANY DOORS TONIGHT. SOME HAVE TO CLOSE FIRST." });
      return;
    }
    const clash =
      PUBLIC_ROOMS.some((r) => r.name === clean) ||
      [...customRooms.values()].some((r) => r.name === clean);
    if (clash) {
      socket.emit("error", { code: "DUP_NAME", message: "THAT DOOR IS ALREADY OPEN TONIGHT." });
      return;
    }

    const password = String(p?.password ?? "").trim().slice(0, 24) || undefined;
    const privacy = String(p?.privacy ?? "open") === "code" ? "code" : "open";
    const ttlNum = Number(p?.ttlMin);
    const ttlMin = ttlNum === 30 || ttlNum === 60 ? ttlNum : 0;

    const room: CustomRoom = {
      id: `door-${(doorCounter += 1)}`,
      name: clean,
      tag: password ? "LOCKED · OPENED BY A MASK" : "OPENED BY A MASK",
      custom: true,
      emptySince: null,
      password,
      private: privacy === "code",
      code: privacy === "code" ? newDoorCode() : undefined,
      burnAt: TEST_TTLMS > 0
        ? Date.now() + TEST_TTLMS
        : ttlMin > 0
          ? Date.now() + ttlMin * 60_000
          : undefined,
    };
    customRooms.set(room.id, room);
    if (room.code) doorCodes.set(room.code, room.id);
    if (ttlMin > 0 || TEST_TTLMS > 0) {
      modLog("info", `TIMED DOOR — ${clean} BURNS IN ${Math.round(((room.burnAt ?? 0) - Date.now()) / 1000)}S`);
    }
    joinRoom(socket, room);
    if (typeof ack === "function") ack({ ok: true, code: room.code });
  });

  /* ── messaging (server-echo: one id, shared by all sides) ── */
  socket.on("msg:send", ({ content }: { content: string }) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind === "idle" || client.ctx.kind === "queue") return;
    const text = String(content ?? "").trim();
    if (!text) return;
    if (text.length > 600) return;

    // keeper mute words — checked before anything gets delivered (v5)
    if (isMuted(text)) {
      socket.emit("error", { code: "MUTED_WORD", message: "THE KEEPERS MUTE THAT WORD IN HERE." });
      return;
    }

    // duplicate-content spam (checked before anything gets delivered)
    const dups = dupContents.get(socket.id) ?? [];
    const kept = dups.filter((d) => Date.now() - d.at < 60_000);
    kept.push({ t: text, at: Date.now() });
    dupContents.set(socket.id, kept.length > 8 ? kept.slice(-8) : kept);
    const sameCount = kept.filter((d) => d.t === text).length;
    if (sameCount >= DUP_SPAM_LIMIT) {
      dupContents.delete(socket.id);
      strike(client.ip, "DUPLICATE SPAM", 1);
      socket.emit("error", { code: "DUP_SPAM", message: "THE KEEPERS HEARD YOU THE FIRST THREE TIMES." });
      return;
    }

    if (!bucketFor(socket.id).take()) {
      socket.emit("error", { code: "RATE_LIMITED", message: "SLOW DOWN. THE VOID CAN'T BREATHE." });
      // the limiter being hammered repeatedly is itself conduct
      const hits = slidingPush(ipLimiterHits, client.ip, 300_000);
      hits.push(Date.now());
      if (hits.length > LIMIT_ABUSE_LIMIT) {
        ipLimiterHits.set(client.ip, []);
        strike(client.ip, "LIMIT ABUSE", 1);
      }
      return;
    }

    // cross-socket volume from one IP (multi-socket spammers)
    const volume = slidingPush(ipMsgLog, client.ip, 10_000);
    volume.push(Date.now());
    if (volume.length > IP_MSG_LIMIT) {
      ipMsgLog.set(client.ip, []);
      strike(client.ip, "MESSAGE FLOOD", 1);
      socket.emit("error", { code: "MSG_FLOOD", message: "TOO MUCH FROM WHERE YOU STAND. THE KEEPERS NOTICED." });
      return;
    }

    const key = client.ctx.kind === "fuse" || client.ctx.kind === "room" ? `room:${client.ctx.roomId}` : null;
    if (!key) return;
    const msg = {
      id: `m${Date.now().toString(36)}${(msgCounter.n += 1)}`,
      from: client.identity,
      content: text,
      kind: "user" as const,
      at: Date.now(),
    };
    socket.emit("msg:new", { ...msg, mine: true });
    socket.to(key).emit("msg:new", { ...msg, mine: false });
    rememberLine(client.ctx.roomId, client.identity.handle, text);
    night.msgsRelayed += 1;

    // fuse stats feed the handshake's vibe score (v5)
    if (client.ctx.kind === "fuse") {
      const f = fuseRooms.get(client.ctx.roomId);
      if (f) {
        const slot = slotOf(f, socket.id);
        if (slot !== -1) f.msgs[slot] += 1;
      }
    }
  });

  /* ── reactions (relay only — no storage, nothing to forget) ── */
  socket.on("react", ({ id, reaction, on }: { id?: string; reaction?: string; on?: boolean }) => {
    const client = clients.get(socket.id);
    if (!client || (client.ctx.kind !== "fuse" && client.ctx.kind !== "room")) return;
    if (client.restricted) {
      socket.emit("error", { code: "RESTRICTED", message: "PROBATION. THE REACTS ARE OFF." });
      return;
    }
    const mid = String(id ?? "").slice(0, 48);
    if (mid.length < 2) return;
    if (!REACTIONS.has(String(reaction ?? ""))) return;
    if (!reactAllowed(socket.id)) {
      socket.emit("error", { code: "RATE_LIMITED", message: "THE ROOM CAN'T BREATHE. EASE OFF THE REACTS." });
      return;
    }
    socket.to(`room:${client.ctx.roomId}`).emit("msg:reaction", {
      id: mid,
      reaction: String(reaction),
      on: !!on,
    });
    if (client.ctx.kind === "fuse" && on) {
      const f = fuseRooms.get(client.ctx.roomId);
      if (f) f.reacts += 1;
    }
  });

  /* ── typing (private relay + lobby activity for door rooms) ── */
  socket.on("typing", ({ isTyping }: { isTyping: boolean }) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind === "idle" || client.ctx.kind === "queue") return;
    const key = `room:${client.ctx.roomId}`;
    socket.to(key).emit("partner:typing", { handle: client.identity.handle, isTyping: !!isTyping });

    if (client.ctx.kind === "room") {
      const roomId = client.ctx.roomId;
      const before = roomTypers(roomId);
      const set = typingByRoom.get(roomId) ?? new Set<string>();
      if (isTyping) set.add(socket.id);
      else set.delete(socket.id);
      typingByRoom.set(roomId, set);
      const after = roomTypers(roomId);
      if (before !== after) io.emit("room:activity", { roomId, typing: after });
    }
  });

  /* ── seen — the read shimmer's carrier (v5) ── */
  socket.on("seen", ({ upTo }: { upTo?: unknown }) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind === "idle" || client.ctx.kind === "queue") return;
    const at = Number(upTo);
    if (!Number.isFinite(at) || at <= 0) return;
    socket.to(`room:${client.ctx.roomId}`).emit("msg:seen", { handle: client.identity.handle, upTo: at });
  });

  /* ── icebreaker spark — a shared topic drops into the room (v5) ── */
  socket.on("spark", (_p: unknown, ack?: Ack) => {
    const client = clients.get(socket.id);
    if (!client || (client.ctx.kind !== "fuse" && client.ctx.kind !== "room")) {
      if (typeof ack === "function") ack({ ok: false, error: "YOU'RE NOT IN A CONVERSATION." });
      return;
    }
    const now = Date.now();
    if (now - (lastSpark.get(socket.id) ?? 0) < SPARK_COOLDOWN) {
      const err = { ok: false, error: "THE SPARKS NEED A MOMENT TO CATCH." };
      socket.emit("error", { code: "SPARK_COOLDOWN", message: err.error });
      if (typeof ack === "function") ack(err);
      return;
    }
    lastSpark.set(socket.id, now);

    const roomId = client.ctx.roomId;
    const bankKey = client.ctx.kind === "room" && SPARKS[roomId] ? roomId : "generic";
    const prompt = pick(SPARKS[bankKey] ?? SPARKS.generic);
    io.to(`room:${roomId}`).emit("msg:new", {
      ...systemMsg(`SPARK — ${prompt}`),
      kind: "system",
      at: now,
    });
    if (typeof ack === "function") ack({ ok: true });
  });

  /* ── mini-games (v5 — 1:1 fuses only) ──────────────────── */

  const gameEmit = (roomId: string) => {
    const f = fuseRooms.get(roomId);
    if (!f || !f.game) return;
    const g = f.game;
    const base = { game: g.game, phase: g.phase } as Record<string, unknown>;
    if (g.game === "wyr") {
      base.q = g.q;
      base.picks = g.picks.map((c, i) => (c ? { handle: f.ident[i].handle, choice: c } : null));
    } else if (g.game === "truths") {
      base.writer = f.ident[g.writer].handle;
      if (g.phase !== "write") base.lines = g.lines;
      if (g.phase === "reveal") {
        base.lie = g.lieIndex + 1;
        base.pick = g.pick === null ? null : g.pick + 1;
        base.correct = g.pick === g.lieIndex;
      }
    } else {
      base.q = g.q;
      base.secondsLeft = Math.max(0, Math.ceil((g.endsAt - Date.now()) / 1000));
      base.answers = g.answers.map((a, i) => (a ? { handle: f.ident[i].handle, text: a } : null));
    }
    io.to(`room:${roomId}`).emit("game:state", base);
  };

  const gameFinish = (roomId: string, delayMs = 9000) => {
    const f = fuseRooms.get(roomId);
    if (!f || !f.game || f.game.phase !== "reveal") return;
    const t = setTimeout(() => {
      const ff = fuseRooms.get(roomId);
      if (!ff) return;
      ff.game = null;
      io.to(`room:${roomId}`).emit("game:over", {});
    }, delayMs);
    f.gameTimers.push(t);
  };

  socket.on("game:start", ({ game }: { game?: unknown }, ack?: Ack) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind !== "fuse") {
      const err = { ok: false, error: "GAMES LIVE IN 1:1 FUSES ONLY." };
      socket.emit("error", { code: "GAME_INVALID", message: err.error });
      if (typeof ack === "function") ack(err);
      return;
    }
    const f = fuseRooms.get(client.ctx.roomId);
    if (!f) return;
    if (f.game) {
      const err = { ok: false, error: "A GAME IS ALREADY ON THE TABLE." };
      if (typeof ack === "function") ack(err);
      return;
    }
    const which = String(game ?? "");
    if (which === "wyr") {
      f.game = { game: "wyr", q: pick(WYR_BANK), picks: [null, null], phase: "answer" };
    } else if (which === "truths") {
      const slot = slotOf(f, socket.id);
      if (slot === -1) return;
      f.game = { game: "truths", writer: slot, lines: null, lieIndex: 0, pick: null, phase: "write" };
      // the writer gets a window; silence cancels the game
      const t = setTimeout(() => {
        const ff = fuseRooms.get(client.ctx.roomId);
        if (ff?.game?.game === "truths" && ff.game.phase === "write") {
          ff.game = null;
          io.to(`room:${client.ctx.roomId}`).emit("game:over", { reason: "THE WRITER FROZE." });
        }
      }, 120_000);
      f.gameTimers.push(t);
    } else if (which === "hotseat") {
      f.game = { game: "hotseat", q: pick(HOTSEAT_BANK), answers: [null, null], endsAt: Date.now() + HOTSEAT_SECS * 1000, phase: "answer" };
      const t = setTimeout(() => {
        const ff = fuseRooms.get(client.ctx.roomId);
        if (ff?.game?.game === "hotseat" && ff.game.phase === "answer") {
          ff.game.phase = "reveal";
          gameEmit(client.ctx.roomId);
          gameFinish(client.ctx.roomId);
        }
      }, HOTSEAT_SECS * 1000 + 250);
      f.gameTimers.push(t);
    } else {
      const err = { ok: false, error: "THAT GAME DOESN'T EXIST." };
      if (typeof ack === "function") ack(err);
      return;
    }
    gameEmit(client.ctx.roomId);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("game:submit", ({ lines }: { lines?: unknown }) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind !== "fuse") return;
    const f = fuseRooms.get(client.ctx.roomId);
    const g = f?.game;
    if (!f || !g || g.game !== "truths" || g.phase !== "write") return;
    const slot = slotOf(f, socket.id);
    if (slot !== g.writer) return;
    if (!Array.isArray(lines)) return;
    const clean = lines.slice(0, 3).map((l) => String(l ?? "").replace(/\s+/g, " ").trim().slice(0, 80));
    if (clean.length !== 3 || clean.some((l) => l.length < 2)) {
      socket.emit("error", { code: "GAME_INVALID", message: "THREE LINES — 2 TO 80 CHARACTERS EACH." });
      return;
    }
    g.lines = [clean[0], clean[1], clean[2]];
    g.lieIndex = Math.floor(Math.random() * 3);
    g.phase = "guess";
    gameEmit(client.ctx.roomId);
  });

  socket.on("game:answer", (p: { choice?: unknown; pick?: unknown; text?: unknown }) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind !== "fuse") return;
    const f = fuseRooms.get(client.ctx.roomId);
    const g = f?.game;
    if (!f || !g) return;
    const slot = slotOf(f, socket.id);
    if (slot === -1) return;

    if (g.game === "wyr" && g.phase === "answer") {
      const choice = String(p?.choice ?? "");
      if (choice !== "a" && choice !== "b") return;
      if (g.picks[slot]) return; // one answer each
      g.picks[slot] = choice;
      gameEmit(client.ctx.roomId);
      if (g.picks[0] && g.picks[1]) {
        g.phase = "reveal";
        gameEmit(client.ctx.roomId);
        gameFinish(client.ctx.roomId, 7000);
      }
      return;
    }

    if (g.game === "truths" && g.phase === "guess") {
      if (slot === g.writer) return;
      if (g.pick !== null) return;
      const pickIdx = Number(p?.pick);
      if (!Number.isInteger(pickIdx) || pickIdx < 1 || pickIdx > 3) return;
      g.pick = pickIdx - 1;
      g.phase = "reveal";
      gameEmit(client.ctx.roomId);
      gameFinish(client.ctx.roomId, 9000);
      return;
    }

    if (g.game === "hotseat" && g.phase === "answer") {
      if (g.answers[slot]) return;
      const text = String(p?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (text.length < 2) return;
      g.answers[slot] = text;
      // your answer is yours until both are in (or the clock runs out)
      socket.emit("game:state", {
        game: "hotseat",
        phase: "answer",
        q: g.q,
        secondsLeft: Math.max(0, Math.ceil((g.endsAt - Date.now()) / 1000)),
        answers: g.answers.map((a, i) =>
          a ? { handle: f.ident[i].handle, text: i === slot ? a : "…" } : null,
        ),
      });
      if (g.answers[0] && g.answers[1]) {
        g.phase = "reveal";
        gameEmit(client.ctx.roomId);
        gameFinish(client.ctx.roomId);
      }
      return;
    }
  });

  /* ── secret handshake (v5 — both tap to reveal) ────────── */
  socket.on("handshake:tap", () => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind !== "fuse") return;
    const f = fuseRooms.get(client.ctx.roomId);
    if (!f || f.handDone) return;
    const slot = slotOf(f, socket.id);
    if (slot === -1 || f.hands[slot]) return;
    f.hands[slot] = true;

    const other = slot === 0 ? 1 : 0;
    if (!f.hands[other]) {
      io.to(f.sids[other]).emit("handshake:tapped", { handle: client.identity.handle });
      return;
    }

    // both masks tapped — the veil parts
    f.handDone = true;
    const shared = overlap(f.tags[0], f.tags[1]);
    const minMsgs = Math.min(f.msgs[0], f.msgs[1]);
    const score = Math.min(99, 42 + shared.length * 9 + Math.min(18, minMsgs * 2) + Math.min(21, f.reacts * 3));
    const label =
      score >= 85 ? "TWIN FREQUENCIES" :
      score >= 70 ? "SAME WAVELENGTH" :
      score >= 50 ? "CROSSING SIGNALS" :
      "POLITE STRANGERS";
    io.to(`room:${client.ctx.roomId}`).emit("handshake:reveal", { shared, score, label });
  });

  /* ── report a mask ── */
  socket.on("report", (payload: { type?: unknown; targetId?: unknown; note?: unknown }, ack?: Ack) => {
    const res = handleReport(socket, payload ?? {});
    if (typeof ack === "function") ack(res);
    else if (!res.ok) socket.emit("error", { code: "REPORT", message: res.error ?? "DENIED." });
  });

  /* ── burn (1:1 only) ── */
  socket.on("chat:burn", () => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind !== "fuse") return;
    const { roomId } = client.ctx;
    const fuse = fuseRooms.get(roomId);
    if (!fuse) return;
    // notify FIRST — live sockets are still members of the room
    io.to(`room:${roomId}`).emit("chat:burned");
    for (const sid of fuse.sids) {
      const c = clients.get(sid);
      io.sockets.sockets.get(sid)?.leave(`room:${roomId}`);
      if (c) c.ctx = { kind: "idle" };
    }
    killFuse(roomId);
    markDirty();
  });

  /* ── NEXT MASK — the sanctioned skip, priced in cooldown (v5) ── */
  socket.on("chat:skip", (_p: unknown, ack?: Ack) => {
    const client = clients.get(socket.id);
    if (!client || client.ctx.kind !== "fuse") {
      if (typeof ack === "function") ack({ ok: false, error: "NOT IN A FUSE." });
      return;
    }
    const { roomId } = client.ctx;
    const fuse = fuseRooms.get(roomId);
    if (!fuse) return;
    const mySlot = slotOf(fuse, socket.id);
    const partnerSid = mySlot === -1 ? null : fuse.sids[mySlot === 0 ? 1 : 0];
    const partner = partnerSid ? clients.get(partnerSid) : null;

    // the partner is told the stranger moved on; the fuse dies clean
    killFuse(roomId);
    socket.leave(`room:${roomId}`);
    if (partnerSid) {
      io.sockets.sockets.get(partnerSid)?.leave(`room:${roomId}`);
      if (partner) {
        partner.ctx = { kind: "idle" };
        io.to(partnerSid).emit("partner:left", { handle: client.identity.handle, reason: "SKIP" });
      }
    }
    client.ctx = { kind: "idle" };
    skipCooldownUntil.set(socket.id, Date.now() + SKIP_COOLDOWN);
    markDirty();
    if (typeof ack === "function") ack({ ok: true, cooldown: SKIP_COOLDOWN });
  });

  /* ── resume — fight back through a dropped connection (v5) ── */
  socket.on("chat:resume", ({ resumeId }: { resumeId?: unknown }, ack?: Ack) => {
    const client = clients.get(socket.id);
    if (!client) return;
    const token = String(resumeId ?? "");
    let found: { roomId: string; fuse: FuseRec; slot: 0 | 1 } | null = null;
    for (const [roomId, f] of fuseRooms) {
      if (f.resume[0] === token) { found = { roomId, fuse: f, slot: 0 }; break; }
      if (f.resume[1] === token) { found = { roomId, fuse: f, slot: 1 }; break; }
    }
    if (!found || !found.fuse.grace || found.fuse.grace.slot !== found.slot || Date.now() > found.fuse.grace.until) {
      const err = { ok: false, error: "THE FUSE IS GONE." };
      socket.emit("error", { code: "RESUME_GONE", message: err.error });
      if (typeof ack === "function") ack(err);
      return;
    }
    const { roomId, fuse, slot } = found;
    // same face, same room — the mask never changed, only the wire
    client.identity = fuse.ident[slot];
    socket.emit("identity", { identity: client.identity });
    clearTimeout(fuse.grace.timer);
    fuse.grace = null;
    fuse.sids[slot] = socket.id;
    socket.join(`room:${roomId}`);
    client.ctx = { kind: "fuse", roomId, partnerId: fuse.sids[slot === 0 ? 1 : 0] };
    // the partner's ctx must point at the NEW wire too (reports target it)
    const otherSid = fuse.sids[slot === 0 ? 1 : 0];
    const otherClient = clients.get(otherSid);
    if (otherClient && otherClient.ctx.kind === "fuse") {
      otherClient.ctx = { kind: "fuse", roomId, partnerId: socket.id };
    }
    socket.emit("chat:resumed", {});
    io.to(otherSid).emit("partner:back", { handle: client.identity.handle });
    markDirty();
    if (typeof ack === "function") ack({ ok: true });
  });

  /* ── lifecycle ── */
  socket.on("disconnect", () => {
    leaveCurrent(socket, false, "disconnect");
    clients.delete(socket.id);
    cases.delete(socket.id);
    buckets.delete(socket.id);
    reactOps.delete(socket.id);
    lastCreate.delete(socket.id);
    lastReportAt.delete(socket.id);
    reportPairs.delete(socket.id);
    dupContents.delete(socket.id);
    lastSpark.delete(socket.id);
    skipCooldownUntil.delete(socket.id);
    for (const set of typingByRoom.values()) set.delete(socket.id);
    markDirty();
  });

  socket.on("error", (err) => console.error(`socket ${socket.id} error:`, err));
});

/* ── reaper: burn empty doors, torch timed doors, expire punishments ── */

setInterval(() => {
  const now = Date.now();
  for (const [id, r] of [...customRooms]) {
    // scheduled burn — the timer ran out with people still inside (v5)
    if (r.burnAt && now > r.burnAt) {
      io.to(`room:${id}`).emit("room:expired", { roomId: id, name: r.name });
      for (const [sid, c] of clients) {
        if (c.ctx.kind === "room" && c.ctx.roomId === id) {
          io.sockets.sockets.get(sid)?.leave(`room:${id}`);
          c.ctx = { kind: "idle" };
        }
      }
      burnDoor(id);
      continue;
    }
    if (membersOf(id).length === 0 && r.emptySince !== null && now - r.emptySince > ROOM_TTL) {
      burnDoor(id);
    }
  }
  // expired punishments lift themselves; probation flags follow
  let changed = false;
  for (const [ip, p] of [...blocks]) {
    if (now > p.until) {
      blocks.delete(ip);
      modLog("info", `BLOCK EXPIRED — ${fmtIP(ip)}`);
      changed = true;
    }
  }
  for (const [ip, p] of [...restricts]) {
    if (now > p.until) {
      restricts.delete(ip);
      modLog("info", `PROBATION EXPIRED — ${fmtIP(ip)}`);
      changed = true;
    }
  }
  if (changed) {
    for (const [sid, c] of clients) {
      if (c.restricted && !restricts.has(c.ip)) {
        c.restricted = false;
        buckets.delete(sid);
      }
    }
  }
}, REAP_EVERY);

httpServer.listen(PORT, () => {
  console.log(`VEIL chat service (v5 — CIPHERS & GAMES) listening on :${PORT}`);
});

process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
