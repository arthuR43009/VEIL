/**
 * Veil chat store — owns the socket lifecycle and the client-side
 * state machine: gate → lobby → searching → chat → burned | left | lost.
 *
 * v3: interest tags ride along the FUSE queue, reactions are keyed by
 *     the shared server message id, and lastMatch remembers what fused you.
 * v4: lobby typing presence, door-burn snapshots (the lobby watches a
 *     door burn away), report filing with acks, and block/probation notices.
 * v5: doors with passwords / spoken codes / burn timers, the 1:1 reconnect
 *     grace (resumeId + ghost countdowns both directions), NEXT MASK with
 *     a cooldown, seen receipts, icebreaker sparks, the three mini-games,
 *     the secret handshake, and session stats that survive into the
 *     recap card after a burn.
 *
 * Nothing here is persisted. Closing the overlay severs the socket and
 * every trace of the session.
 */
"use client";

import { create } from "zustand";
import { io, type Socket } from "socket.io-client";

/* ── protocol types (mirrors mini-services/veil-chat) ────── */

export interface Identity {
  id: string;
  handle: string;
  seed: string;
}

export interface PublicRoomInfo {
  id: string;
  name: string;
  tag: string;
  custom?: boolean;
  /** locked door — the keeper of the key gets in */
  hasPass?: boolean;
  /** door code — ONLY ever sent to the creator */
  code?: string;
  /** seconds until a timed door burns */
  burnIn?: number;
}

export interface Presence {
  online: number;
  waiting: number;
  fused: number;
  rooms: Array<{
    id: string;
    name: string;
    tag: string;
    custom: boolean;
    count: number;
    typing?: number;
    /** up to 5 occupant mask seeds — the lobby's presence preview */
    masks?: string[];
    /** locked door badge */
    lock?: boolean;
    /** seconds until a timed door burns */
    burnIn?: number;
  }>;
}

export type ChatMsg = {
  id: string;
  kind: "user" | "system" | "error";
  content: string;
  at: number;
  mine?: boolean;
  from?: Identity;
};

/** per-message word reactions: msgId → reaction → { count, didI } */
export type Reactions = Record<string, Record<string, { count: number; mine: boolean }>>;

export interface MatchInfo {
  via: "INTERESTS" | "CHANCE";
  shared: string[];
}

/** live mini-game view (1:1 fuses) */
export interface GameView {
  game: "wyr" | "truths" | "hotseat";
  phase: "answer" | "write" | "guess" | "reveal";
  q?: string[] | string;
  picks?: Array<{ handle: string; choice: "a" | "b" } | null>;
  writer?: string;
  lines?: string[] | null;
  lie?: number;
  pick?: number | null;
  correct?: boolean;
  answers?: Array<{ handle: string; text: string } | null>;
  secondsLeft?: number;
}

/** secret handshake — both tap, the veil parts */
export interface HandshakeState {
  mine: boolean;
  theirs: boolean;
  offeredBy?: string;
  reveal: { shared: string[]; score: number; label: string } | null;
}

/** session stats — the recap card's raw material (counts only, no content) */
export interface SessionStats {
  startedAt: number;
  endedAt?: number;
  roomName: string;
  tags: string[];
  via: "INTERESTS" | "CHANCE" | null;
  myMsgs: number;
  theirMsgs: number;
  reacts: number;
}

export type Phase =
  | "gate"
  | "lobby"
  | "searching"
  | "chat"
  | "burned"
  | "partner-left"
  | "lost"
  | "banned";

/* ── store ──────────────────────────────────────────────── */

interface ChatState {
  open: boolean;
  connected: boolean;
  phase: Phase;
  me: Identity | null;
  partner: Identity | null;
  room: PublicRoomInfo | null;
  /** local countdown anchor for timed doors (Date.now() + burnIn*1000) */
  roomBurnAt: number | null;
  members: Identity[];
  messages: ChatMsg[];
  typingHandles: string[];
  presence: Presence;
  queueWaiting: number;
  ratePulse: { message: string; at: number } | null;
  burning: boolean;
  /** tags chosen for the next fuse attempt — kept between tries */
  fuseTags: string[];
  /** what the last fuse matched on (if anything) */
  lastMatch: MatchInfo | null;
  /** live word reactions, keyed by the shared server message id */
  reactions: Reactions;
  /** roomId -> masks typing right now (lobby liveliness) */
  roomTyping: Record<string, number>;
  /** doors currently burning away in the lobby list — id -> snapshot + expiry */
  doorBurns: Record<string, { name: string; tag: string; count: number; at: number }>;
  /** gate-level notice: BLOCKED / RESTRICTED announcements from the keepers */
  notice: { code: string; message: string; until?: number } | null;

  /* v5 */
  /** resume token for the live fuse — the way back through a dropped wire */
  resumeId: string | null;
  /** my wire dropped mid-fuse; the socket is fighting to return */
  reconnecting: boolean;
  /** the partner's wire dropped — a ghost holds their seat (ms deadline) */
  partnerGhost: { handle: string; until: number } | null;
  /** highest message timestamp the other side has seen (read shimmer) */
  seenUpTo: number;
  /** msg ids that already played their read shimmer */
  seenPlayed: Record<string, boolean>;
  /** session stats for the recap card */
  session: SessionStats | null;
  /** NEXT MASK cooldown — the void's enforced breath (ms deadline) */
  skipCooldownUntil: number;
  /** live mini-game */
  game: GameView | null;
  /** secret handshake progress */
  handshake: HandshakeState;
  /** a locked door asked for its key — the lobby shows the unlock sheet */
  lockedDoor: { roomId: string } | null;

  openChat: () => void;
  closeChat: () => void;
  reroll: () => void;
  toLobby: () => void;
  startFuse: (tags?: string[]) => void;
  setFuseTags: (tags: string[]) => void;
  cancelFuse: () => void;
  joinRoom: (roomId: string, password?: string) => void;
  createRoom: (name: string, opts?: { password?: string; privacy?: "open" | "code"; ttlMin?: 0 | 30 | 60 }) => void;
  leaveChat: () => void;
  send: (text: string) => void;
  pokeTyping: () => void;
  burn: () => void;
  react: (msgId: string, key: string) => void;
  /** file a report against a mask — resolves with the keeper's verdict */
  report: (targetId: string, type: string, note: string) => Promise<{ ok: boolean; error?: string }>;
  /* v5 actions */
  skipChat: () => void;
  spark: () => void;
  markSeen: (upTo: number) => void;
  startGame: (game: "wyr" | "truths" | "hotseat") => void;
  gameAnswer: (payload: { choice?: "a" | "b"; pick?: number; text?: string }) => void;
  gameSubmit: (lines: string[]) => void;
  closeGame: () => void;
  handshakeTap: () => void;
}

let socket: Socket | null = null;
let intentionalClose = false;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let localId = 0;

const SYS = (content: string): ChatMsg => ({
  id: `sys-${Date.now()}-${(localId += 1)}`,
  kind: "system",
  content,
  at: Date.now(),
});

const freshHandshake = (): HandshakeState => ({ mine: false, theirs: false, reveal: null });

export const useChat = create<ChatState>((set, get) => ({
  open: false,
  connected: false,
  phase: "gate",
  me: null,
  partner: null,
  room: null,
  roomBurnAt: null,
  members: [],
  messages: [],
  typingHandles: [],
  presence: { online: 0, waiting: 0, fused: 0, rooms: [] },
  queueWaiting: 0,
  ratePulse: null,
  burning: false,
  fuseTags: [],
  lastMatch: null,
  reactions: {},
  roomTyping: {},
  doorBurns: {},
  notice: null,

  resumeId: null,
  reconnecting: false,
  partnerGhost: null,
  seenUpTo: 0,
  seenPlayed: {},
  session: null,
  skipCooldownUntil: 0,
  game: null,
  handshake: freshHandshake(),
  lockedDoor: null,

  openChat: () => {
    set({ open: true });
    ensureSocket();
  },

  closeChat: () => {
    intentionalClose = true;
    socket?.disconnect();
    socket = null;
    intentionalClose = false;
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = null;
    set({
      open: false,
      connected: false,
      phase: "gate",
      me: null,
      partner: null,
      room: null,
      roomBurnAt: null,
      members: [],
      messages: [],
      typingHandles: [],
      queueWaiting: 0,
      ratePulse: null,
      burning: false,
      fuseTags: [],
      lastMatch: null,
      reactions: {},
      roomTyping: {},
      doorBurns: {},
      notice: null,
      resumeId: null,
      reconnecting: false,
      partnerGhost: null,
      seenUpTo: 0,
      seenPlayed: {},
      session: null,
      skipCooldownUntil: 0,
      game: null,
      handshake: freshHandshake(),
      lockedDoor: null,
    });
  },

  reroll: () => {
    if (!socket) return;
    if (get().phase === "chat") return; // identity locked mid-chat
    socket.emit("identity:reroll");
  },

  toLobby: () => {
    const { phase } = get();
    if (phase === "chat") socket?.emit("room:leave"); // also leaves fuse via server
    set({
      phase: "lobby",
      partner: null,
      room: null,
      roomBurnAt: null,
      members: [],
      messages: [],
      typingHandles: [],
      burning: false,
      lastMatch: null,
      reactions: {},
      partnerGhost: null,
      resumeId: null,
      reconnecting: false,
      game: null,
      handshake: freshHandshake(),
      session: null,
    });
  },

  startFuse: (tags) => {
    const use = tags ?? get().fuseTags;
    set({
      fuseTags: use,
      phase: "searching",
      messages: [],
      partner: null,
      typingHandles: [],
      lastMatch: null,
      reactions: {},
      resumeId: null,
      partnerGhost: null,
      game: null,
      handshake: freshHandshake(),
      session: null,
    });
    socket?.emit("fuse:queue", { tags: use });
  },

  setFuseTags: (tags) => set({ fuseTags: tags }),

  cancelFuse: () => {
    socket?.emit("fuse:cancel");
    set({ phase: "lobby" });
  },

  joinRoom: (roomId, password) => {
    socket?.emit("room:join", { roomId, password });
  },

  createRoom: (name, opts) => {
    if (!socket || get().phase !== "lobby") return;
    socket.emit("room:create", {
      name,
      password: opts?.password,
      privacy: opts?.privacy ?? "open",
      ttlMin: opts?.ttlMin ?? 0,
    });
  },

  leaveChat: () => {
    socket?.emit("room:leave");
    set({
      phase: "lobby",
      partner: null,
      room: null,
      roomBurnAt: null,
      members: [],
      messages: [],
      typingHandles: [],
      burning: false,
      lastMatch: null,
      reactions: {},
      partnerGhost: null,
      resumeId: null,
      reconnecting: false,
      game: null,
      handshake: freshHandshake(),
      session: null,
    });
  },

  send: (raw) => {
    const text = raw.trim().slice(0, 600);
    if (!text || !socket) return;
    if (get().phase !== "chat") return;
    // v3: no optimistic append — the server echoes my message back with a
    // shared id (reactions need it), and rate-limited messages never render.
    set({ typingHandles: [] });
    socket.emit("msg:send", { content: text });
    // sending stops my typing broadcast
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = null;
    socket.emit("typing", { isTyping: false });
  },

  pokeTyping: () => {
    if (!socket) return;
    if (get().phase !== "chat") return;
    if (!typingTimer) socket.emit("typing", { isTyping: true });
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket?.emit("typing", { isTyping: false });
      typingTimer = null;
    }, 1600);
  },

  burn: () => {
    if (get().phase !== "chat") return;
    socket?.emit("chat:burn");
  },

  react: (msgId, key) => {
    if (!socket || get().phase !== "chat") return;
    const cur = get().reactions[msgId]?.[key];
    const on = !cur?.mine;
    set((st) => {
      const forMsg = { ...(st.reactions[msgId] ?? {}) };
      if (on) {
        forMsg[key] = { count: (cur?.count ?? 0) + 1, mine: true };
      } else {
        const count = (cur?.count ?? 1) - 1;
        if (count > 0) forMsg[key] = { count, mine: false };
        else delete forMsg[key];
      }
      return { reactions: { ...st.reactions, [msgId]: forMsg } };
    });
    socket.emit("react", { id: msgId, reaction: key, on });
  },

  report: (targetId, type, note) =>
    new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, error: "NOT CONNECTED." });
      socket.emit("report", { targetId, type, note }, (res: { ok: boolean; error?: string }) => resolve(res));
    }),

  /* ── v5 actions ── */

  skipChat: () => {
    const st = get();
    if (st.phase !== "chat" || !st.partner || !socket) return;
    // NOTE: the empty payload matters — an ack-only emit lands the ack
    // function in the server's FIRST parameter slot and the ack is lost
    socket.emit("chat:skip", {}, (res: { ok: boolean; cooldown?: number }) => {
      if (!res?.ok) return;
      const cd = typeof res.cooldown === "number" ? res.cooldown : 6000;
      useChat.setState({
        phase: "searching",
        partner: null,
        messages: [],
        typingHandles: [],
        reactions: {},
        burning: false,
        lastMatch: null,
        resumeId: null,
        partnerGhost: null,
        reconnecting: false,
        game: null,
        handshake: freshHandshake(),
        session: null,
        skipCooldownUntil: Date.now() + cd,
      });
    });
  },

  spark: () => {
    if (!socket || get().phase !== "chat") return;
    socket.emit("spark", {});
  },

  markSeen: (upTo) => {
    if (!socket || get().phase !== "chat") return;
    if (upTo <= 0) return;
    socket.emit("seen", { upTo });
  },

  startGame: (game) => {
    if (!socket || get().phase !== "chat") return;
    socket.emit("game:start", { game });
  },

  gameAnswer: (payload) => {
    if (!socket || get().phase !== "chat") return;
    socket.emit("game:answer", payload);
  },

  gameSubmit: (lines) => {
    if (!socket || get().phase !== "chat") return;
    socket.emit("game:submit", { lines });
  },

  closeGame: () => set({ game: null }),

  handshakeTap: () => {
    if (!socket || get().phase !== "chat") return;
    const hs = get().handshake;
    if (hs.mine || hs.reveal) return;
    set({ handshake: { ...hs, mine: true } });
    socket.emit("handshake:tap");
  },
}));

/* ── socket bootstrap (client-only, lazy) ───────────────── */

/**
 * Where the veil-chat service lives:
 *  1. NEXT_PUBLIC_CHAT_URL env override always wins (any host, any port)
 *  2. serving the app from localhost/127.0.0.1 → talk to the local
 *     service directly (mini-services/veil-chat on :3003)
 *  3. anything else (the sandbox gateway / a reverse proxy) → ride the
 *     page origin with ?XTransformPort=3003, which the proxy routes to
 *     the service (see Caddyfile)
 */
/** shared by the chat store and the keeper console — where veil-chat lives */
export function resolveChatUrl(): string {
  if (process.env.NEXT_PUBLIC_CHAT_URL) return process.env.NEXT_PUBLIC_CHAT_URL;
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") {
      return `http://${h}:3003`;
    }
  }
  return "/?XTransformPort=3003";
}

const chatUrl = resolveChatUrl;

function ensureSocket() {
  if (socket) return;

  // module-level accessors (the create() callback's set/get aren't in scope here)
  const set = useChat.setState;
  const get = useChat.getState;

  socket = io(chatUrl(), {
    path: "/",
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: true,
    // v5: enough attempts to cover the 20s fuse grace on a flaky wire
    reconnectionAttempts: 9,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 2400,
    timeout: 10000,
  });

  const s = socket;

  s.on("connect", () => {
    const st = get();
    if (st.reconnecting && st.resumeId) {
      // the wire came back — present the token and reclaim the fuse
      s.emit("chat:resume", { resumeId: st.resumeId }, (res: { ok: boolean }) => {
        if (res?.ok) return;
        useChat.setState({
          reconnecting: false,
          phase: "lost",
          messages: [],
          partner: null,
          room: null,
          members: [],
          reactions: {},
          resumeId: null,
        });
      });
      return;
    }
    set({ connected: true, notice: null });
  });

  s.on("reconnect_failed", () => {
    const st = get();
    if (st.reconnecting) {
      // the void didn't take us back — the fuse is gone
      set({
        reconnecting: false,
        phase: "lost",
        messages: [],
        partner: null,
        room: null,
        members: [],
        reactions: {},
        resumeId: null,
      });
    }
  });

  s.on("disconnect", () => {
    if (intentionalClose) return;
    const st = get();
    if (st.phase === "chat" && st.partner && st.resumeId) {
      // v5: a 1:1 fuse gets a grace window — hold everything, fight to return
      set({ connected: false, reconnecting: true });
      return;
    }
    set((cur) =>
      cur.phase === "chat" || cur.phase === "searching"
        ? { connected: false, phase: "lost", messages: [], partner: null, room: null, members: [], reactions: {} }
        : { connected: false }
    );
  });

  s.on("identity", ({ identity }: { identity: Identity }) => {
    set({ me: identity });
  });

  s.on("presence", (p: Presence) =>
    set((st) => {
      // merge live typing counts (presence is a resync; room:activity is fresher)
      const typing = { ...st.roomTyping };
      for (const r of p.rooms) typing[r.id] = r.typing ?? 0;
      return { presence: p, roomTyping: typing };
    }),
  );

  s.on("room:activity", ({ roomId, typing }: { roomId: string; typing: number }) =>
    set((st) => ({ roomTyping: { ...st.roomTyping, [roomId]: typing } })),
  );

  s.on("queue:joined", ({ waiting }: { waiting: number }) => set({ queueWaiting: waiting }));

  s.on("matched", ({ partner, shared, via, resumeId }: { partner: Identity; shared?: string[]; via?: "INTERESTS" | "CHANCE"; resumeId?: string }) => {
    const tags = Array.isArray(shared) ? shared.filter((t) => typeof t === "string").slice(0, 3) : [];
    const info: MatchInfo | null = tags.length > 0 ? { via: via ?? "INTERESTS", shared: tags } : null;
    set({
      phase: "chat",
      partner,
      room: null,
      roomBurnAt: null,
      members: [],
      lastMatch: info,
      reactions: {},
      resumeId: resumeId ?? null,
      reconnecting: false,
      partnerGhost: null,
      game: null,
      handshake: freshHandshake(),
      seenUpTo: 0,
      seenPlayed: {},
      session: {
        startedAt: Date.now(),
        roomName: "1:1 FUSE",
        tags,
        via: info?.via ?? null,
        myMsgs: 0,
        theirMsgs: 0,
        reacts: 0,
      },
      messages: [
        info
          ? SYS(`YOU FUSED ON ${info.shared.join(" · ")}. SAY IT BEFORE IT BURNS.`)
          : SYS("YOU FUSED WITH A STRANGER BY PURE CHANCE. SAY SOMETHING BEFORE IT'S GONE."),
      ],
      typingHandles: [],
      burning: false,
    });
  });

  s.on("room:joined", ({ room, members }: { room: PublicRoomInfo; members: Identity[] }) => {
    const burnAt = room.burnIn ? Date.now() + room.burnIn * 1000 : null;
    const intro: ChatMsg[] = [
      SYS(`YOU SLIPPED INTO ${room.name}. ONLY PEOPLE PRESENT CAN SEE THE MESSAGES.`),
    ];
    if (room.code) {
      intro.push(SYS(`DOOR CODE — ${room.code}. SHARE IT YOUR OWN WAY. IT DIES WITH THE DOOR.`));
    }
    if (burnAt) {
      intro.push(SYS(`THIS DOOR BURNS ITSELF IN ${room.burnIn} SECONDS. MAKE THEM COUNT.`));
    }
    set({
      phase: "chat",
      room,
      roomBurnAt: burnAt,
      members,
      partner: null,
      lastMatch: null,
      reactions: {},
      resumeId: null,
      reconnecting: false,
      partnerGhost: null,
      game: null,
      handshake: freshHandshake(),
      seenUpTo: 0,
      seenPlayed: {},
      session: {
        startedAt: Date.now(),
        roomName: room.name,
        tags: [],
        via: null,
        myMsgs: 0,
        theirMsgs: 0,
        reacts: 0,
      },
      messages: intro,
      typingHandles: [],
      burning: false,
      lockedDoor: null,
    });
  });

  s.on("room:members", ({ members }: { members: Identity[] }) => set({ members }));

  s.on("msg:new", (msg: { id: string; kind: "user" | "system"; content: string; at: number; from?: Identity; mine?: boolean }) => {
    set((st) => ({
      messages: [...st.messages, { ...msg, kind: msg.kind === "system" ? "system" : "user", mine: !!msg.mine }],
      typingHandles:
        msg.kind === "user" ? st.typingHandles.filter((h) => h !== msg.from?.handle) : st.typingHandles,
      session:
        st.session && msg.kind === "user"
          ? {
              ...st.session,
              myMsgs: msg.mine ? st.session.myMsgs + 1 : st.session.myMsgs,
              theirMsgs: msg.mine ? st.session.theirMsgs : st.session.theirMsgs + 1,
            }
          : st.session,
    }));
  });

  s.on("msg:reaction", ({ id, reaction, on }: { id: string; reaction: string; on: boolean }) => {
    set((st) => {
      const forMsg = { ...(st.reactions[id] ?? {}) };
      const cur = forMsg[reaction];
      if (on) {
        forMsg[reaction] = { count: (cur?.count ?? 0) + 1, mine: cur?.mine ?? false };
      } else {
        const count = (cur?.count ?? 1) - 1;
        if (count > 0) forMsg[reaction] = { count, mine: cur?.mine ?? false };
        // a foreign "off" can never remove MY react — keep at least mine
        else if (cur?.mine) forMsg[reaction] = { count: 1, mine: true };
        else delete forMsg[reaction];
      }
      return {
        reactions: { ...st.reactions, [id]: forMsg },
        session: on && st.session ? { ...st.session, reacts: st.session.reacts + 1 } : st.session,
      };
    });
  });

  s.on("msg:seen", ({ upTo }: { handle?: string; upTo: number }) => {
    set((st) => (upTo > st.seenUpTo ? { seenUpTo: upTo } : {}));
  });

  s.on("partner:typing", ({ handle, isTyping }: { handle: string; isTyping: boolean }) => {
    set((st) => ({
      typingHandles: isTyping
        ? st.typingHandles.includes(handle)
          ? st.typingHandles
          : [...st.typingHandles, handle]
        : st.typingHandles.filter((h) => h !== handle),
    }));
  });

  /* v5 — the partner's wire dropped; a ghost holds their seat */
  s.on("partner:reconnecting", ({ handle, grace }: { handle: string; grace?: number }) => {
    const secs = typeof grace === "number" ? grace : 20;
    set({ partnerGhost: { handle, until: Date.now() + secs * 1000 }, typingHandles: [] });
  });

  s.on("partner:back", () => {
    set((st) => ({
      partnerGhost: null,
      messages: [...st.messages, SYS("THE SIGNAL RETURNED. THE FUSE HELD.")],
    }));
  });

  s.on("chat:resumed", () => {
    // the wire healed — keep the conversation on screen, note the miracle
    set((st) => ({
      reconnecting: false,
      connected: true,
      partnerGhost: null,
      typingHandles: [],
      messages: [...st.messages, SYS("YOU FOUND YOUR WAY BACK. THE FUSE HELD.")],
    }));
  });

  s.on("partner:left", ({ handle, reason }: { handle: string; reason?: string }) => {
    const st = get();
    if (st.phase === "chat" && st.partner) {
      const note =
        reason === "SKIP"
          ? `${handle} MOVED ON TO ANOTHER MASK.`
          : reason === "LOST"
            ? `${handle}'S SIGNAL DIED IN THE VOID.`
            : `${handle} VANISHED.`;
      set({
        phase: "partner-left",
        typingHandles: [],
        partnerGhost: null,
        game: null,
        handshake: freshHandshake(),
        session: st.session ? { ...st.session, endedAt: Date.now() } : null,
        messages: [...st.messages, SYS(`${note} THIS CONVERSATION NO LONGER EXISTS.`)],
      });
    }
  });

  s.on("chat:burned", () => {
    // trigger the client-side ash burn, then flip to the burned screen
    set((st) => ({
      burning: true,
      session: st.session ? { ...st.session, endedAt: Date.now() } : null,
    }));
    setTimeout(() => {
      useChat.setState({ phase: "burned", burning: false, messages: [], typingHandles: [], reactions: {}, game: null, handshake: freshHandshake() });
    }, 1500);
  });

  s.on("door:burned", ({ roomId, name }: { roomId: string; name?: string }) => {
    // snapshot the row so the lobby can watch it burn away before it vanishes
    const st = useChat.getState();
    const known = st.presence.rooms.find((r) => r.id === roomId);
    const snap = {
      name: known?.name ?? name ?? "A DOOR",
      tag: known?.tag ?? "OPENED BY A MASK",
      count: known?.count ?? 0,
      at: Date.now(),
    };
    set((cur) => ({ doorBurns: { ...cur.doorBurns, [roomId]: snap } }));
    setTimeout(() => {
      useChat.setState((cur) => {
        if (!cur.doorBurns[roomId]) return {};
        const next = { ...cur.doorBurns };
        delete next[roomId];
        return { doorBurns: next };
      });
    }, 1500);
  });

  /* v5 — a timed door torched itself while we were inside */
  s.on("room:expired", ({ roomId, name }: { roomId: string; name?: string }) => {
    const st = useChat.getState();
    set((cur) => ({
      doorBurns: {
        ...cur.doorBurns,
        [roomId]: {
          name: name ?? "A DOOR",
          tag: "BURNED ON SCHEDULE",
          count: 0,
          at: Date.now(),
        },
      },
      ratePulse:
        st.room?.id === roomId
          ? { message: "THE DOOR BURNED ON SCHEDULE. NOTHING REMAINS.", at: Date.now() }
          : cur.ratePulse,
      ...(st.room?.id === roomId
        ? {
            phase: "lobby" as const,
            room: null,
            roomBurnAt: null,
            members: [],
            messages: [],
            typingHandles: [],
            partner: null,
            reactions: {},
            session: null,
          }
        : {}),
    }));
    setTimeout(() => {
      useChat.setState((cur) => {
        if (!cur.doorBurns[roomId]) return {};
        const next = { ...cur.doorBurns };
        delete next[roomId];
        return { doorBurns: next };
      });
    }, 1500);
  });

  s.on("game:state", (view: GameView) => set({ game: view }));

  s.on("game:over", () => set({ game: null }));

  s.on("handshake:tapped", ({ handle }: { handle: string }) => {
    set((st) => ({ handshake: { ...st.handshake, theirs: true, offeredBy: handle } }));
  });

  s.on("handshake:reveal", ({ shared, score, label }: { shared: string[]; score: number; label: string }) => {
    set((st) => ({
      handshake: { ...st.handshake, mine: true, theirs: true, reveal: { shared, score, label } },
    }));
  });

  s.on("mod:blocked", ({ until, reason }: { until?: number; reason?: string }) => {
    // the keepers closed the doors on this mask — exile screen
    set({
      phase: "banned",
      burning: false,
      notice: {
        code: "BLOCKED",
        message: reason ? `THE DOORS ARE CLOSED. ${reason}` : "THE DOORS ARE CLOSED TO YOU.",
        until,
      },
      messages: [],
      typingHandles: [],
      reactions: {},
    });
  });

  s.on("error", ({ code, message, until, wait, roomId }: { code: string; message: string; until?: number; wait?: number; roomId?: string }) => {
    if (code === "BLOCKED") {
      set({ notice: { code, message, until } });
      return;
    }
    if (code === "RESTRICTED") {
      const st = useChat.getState();
      // at the gate/lobby it's an announcement; mid-chat it rides the pulse line
      if (st.phase === "gate" || st.phase === "lobby") {
        set({ notice: { code, message, until } });
        return;
      }
    }
    if (code === "RESUME_GONE") {
      const st = useChat.getState();
      if (st.reconnecting) {
        set({
          reconnecting: false,
          phase: "lost",
          messages: [],
          partner: null,
          room: null,
          members: [],
          reactions: {},
          resumeId: null,
        });
      }
      return;
    }
    if (code === "SKIP_COOLDOWN") {
      set({ skipCooldownUntil: Date.now() + (typeof wait === "number" ? wait : 5000) });
      return;
    }
    if (code === "NEED_KEY" || code === "DOOR_LOCKED") {
      set((st) => ({
        lockedDoor: roomId ? { roomId } : st.lockedDoor,
        ratePulse: { message, at: Date.now() },
      }));
      return;
    }
    set({ ratePulse: { message, at: Date.now() } });
  });
}
