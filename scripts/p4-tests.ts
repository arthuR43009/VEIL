/**
 * p4-tests — KEEPERS & BURNS protocol suite.
 *
 * Runs against a dedicated instance (default :3013) started with:
 *   PORT=3013 VEIL_MOD_KEY=testkey VEIL_ENFORCE_PRIVATE=1
 *   VEIL_ROOM_TTL=3000 VEIL_REAP_EVERY=1500
 *   VEIL_REPORT_COOLDOWN=800 VEIL_TAG_TIMEOUT=2500
 *
 * Every virtual user gets its own IP via x-forwarded-for so the
 * enforcement engine can be exercised without collateral damage.
 */
import { io, type Socket } from "socket.io-client";

const URL = process.env.P4_URL ?? "http://localhost:3013";

/* every socket's identity is tracked here (needed for report targetIds) */
const ids = new Map<Socket, string>();

function spawn(ip: string): Socket {
  const s = io(URL, {
    path: "/",
    transports: ["websocket"], // polling is flaky under bun; p3 suites proved ws stable
    forceNew: true, // never share a Manager — each socket gets its own engine
    reconnection: false,
    timeout: 6000,
    extraHeaders: { "x-forwarded-for": ip },
  });
  s.on("identity", ({ identity }: { identity: { id: string } }) => ids.set(s, identity.id));
  s.on("connect_error", (e: Error) => console.log(`  !! ${ip} connect_error: ${e.message}`));
  s.on("disconnect", (r: string) => console.log(`  !! ${ip} disconnected: ${r}`));
  return s;
}

const idOf = (s: Socket) => ids.get(s) ?? "";

/**
 * spawn + wait for identity, SEQUENTIALLY — creating a second io() while
 * the first is still handshaking hangs it (bun client quirk; browsers are
 * unaffected). Always await one live() before creating the next.
 */
async function live(ip: string): Promise<Socket> {
  const s = spawn(ip);
  await wait(s, "identity", 8000);
  return s;
}

const wait = <T,>(s: Socket, ev: string, ms = 5000, test?: (d: T) => boolean): Promise<T> =>
  new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error(`timeout waiting ${ev}`)), ms);
    const h = (d: T) => {
      if (!test || test(d)) {
        clearTimeout(to);
        s.off(ev, h);
        res(d);
      }
    };
    s.on(ev, h);
  });

/** resolve on the NEXT matching error event */
const nextError = <T extends { code: string; message: string }>(s: Socket, code: string, ms = 4000) =>
  wait<T>(s, "error", ms, (e) => e.code === code);

const emitAck = <R,>(s: Socket, ev: string, payload: unknown): Promise<R> =>
  new Promise((res) => s.emit(ev, payload, (r: R) => res(r)));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── bookkeeping ── */
let passed = 0;
let failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed += 1;
    fails.push(name);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
};
const section = (t: string) => console.log(`\n■ ${t}`);

async function main() {
  section("T0 — keeper auth");
  const keeper = spawn("203.0.113.50");
  await wait(keeper, "connect");
  const badAuth = await emitAck<{ ok: boolean; error?: string }>(keeper, "mod:auth", { key: "wrong" });
  ok("mod:auth rejects wrong word", badAuth.ok === false);
  const auth = await emitAck<{ ok: boolean; state?: { reports: unknown[] } }>(keeper, "mod:auth", { key: "testkey" });
  ok("mod:auth accepts the word", auth.ok === true && !!auth.state);

  const feedLines: string[] = [];
  keeper.on("mod:feed", (f: { line: string }) => feedLines.push(f.line));

  /* the waiter watches the lobby the whole night */
  const waiter = await live("203.0.113.13");
  type RoomRow = { id: string; name: string; typing?: number; custom: boolean; count: number };
  let lastPresence: { rooms: RoomRow[] } = { rooms: [] };
  waiter.on("presence", (p: { rooms: RoomRow[] }) => (lastPresence = p));
  const waiterBurns: { roomId: string; name: string }[] = [];
  waiter.on("door:burned", (d: { roomId: string; name: string }) => waiterBurns.push(d));
  const waiterActivity: { roomId: string; typing: number }[] = [];
  waiter.on("room:activity", (a: { roomId: string; typing: number }) => waiterActivity.push(a));
  const poll = (pred: () => boolean, ms = 4500) =>
    new Promise<boolean>((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (pred()) {
          clearInterval(iv);
          res(true);
        } else if (Date.now() - t0 > ms) {
          clearInterval(iv);
          res(false);
        }
      }, 150);
    });
  const presenceHas = (pred: (r: RoomRow) => boolean) => poll(() => lastPresence.rooms.some(pred));
  const presenceLacks = (id: string) => poll(() => !lastPresence.rooms.some((r) => r.id === id));

  section("T1 — fuse reports (1:1 path)");
  const A = await live("203.0.113.1");
  const B = await live("203.0.113.2");
  A.emit("fuse:queue", { tags: [] });
  B.emit("fuse:queue", { tags: [] });
  await wait(A, "matched");
  await wait(B, "matched");
  A.emit("msg:send", { content: "EVIDENCE LINE ONE" });
  await sleep(300);
  const badType = await emitAck<{ ok: boolean; error?: string }>(A, "report", { type: "NOPE" });
  ok("report rejects unknown type", badType.ok === false && (badType.error ?? "").includes("PICK"));
  const r1 = await emitAck<{ ok: boolean; error?: string }>(A, "report", { type: "ABUSE", note: "he was cruel" });
  ok("report files in fuse", r1.ok === true);
  await sleep(950); // cooldown is 800ms on this instance
  const r2 = await emitAck<{ ok: boolean; error?: string }>(A, "report", { type: "HARASSMENT" });
  ok("report dedupes per target (1h)", r2.ok === false && (r2.error ?? "").includes("ALREADY FILED"));
  type Rep = {
    id: string;
    type: string;
    level: number;
    roomName: string;
    targetIP: string;
    note: string;
    context: { h: string; c: string }[];
    action: string;
  };
  const state1 = await emitAck<{ state?: { reports: Rep[] } }>(keeper, "mod:auth", { key: "testkey" });
  const rep = state1.state?.reports[0];
  ok("xff ip recorded on report", rep?.targetIP === "203.0.113.2", rep?.targetIP ?? "?");
  ok("evidence ring attached", (rep?.context ?? []).some((c) => c.c.includes("EVIDENCE LINE ONE")));
  ok("note preserved", rep?.note === "he was cruel");
  ok("roomName recorded", rep?.roomName === "1:1 FUSE", rep?.roomName ?? "?");
  ok("single report stays LOGGED", rep?.action === "LOGGED", rep?.action ?? "?");
  A.disconnect();
  B.disconnect();

  section("T2 — room reports, probation, exile");
  const D = await live("203.0.113.4");
  const E = await live("203.0.113.5");
  const F = await live("203.0.113.6");
  const C = await live("203.0.113.3");
  D.emit("room:create", { name: "KEEPER TEST" });
  const dj = await wait<{ room: { id: string; name: string } }>(D, "room:joined");
  const doorId = dj.room.id;
  E.emit("room:join", { roomId: doorId });
  F.emit("room:join", { roomId: doorId });
  await wait(E, "room:joined");
  await wait(F, "room:joined");
  ok("door visible in presence", await presenceHas((r) => r.id === doorId && r.count >= 3));

  const fr = await emitAck<{ ok: boolean; error?: string }>(F, "report", { type: "MISCONDUCT", targetId: idOf(E) });
  ok("1st report files (no action yet)", fr.ok === true);
  const restrictedP = nextError<{ code: string; message: string }>(E, "RESTRICTED");
  const dr = await emitAck<{ ok: boolean; error?: string }>(D, "report", { type: "ABUSE", targetId: idOf(E) });
  ok("2nd report files", dr.ok === true);
  const restrictedErr = await restrictedP;
  ok("target got RESTRICTED live", !!restrictedErr);

  const throttleP = nextError<{ code: string; message: string }>(E, "RATE_LIMITED");
  E.emit("msg:send", { content: "M1" });
  E.emit("msg:send", { content: "M2" });
  E.emit("msg:send", { content: "M3" });
  const throttleErr = await throttleP;
  ok("probation throttles the bucket", throttleErr.code === "RATE_LIMITED");

  const createErrP = nextError<{ code: string; message: string }>(E, "RESTRICTED");
  E.emit("room:create", { name: "SHOULD NOT EXIST" });
  const createErr = await createErrP;
  ok("probation blocks door-creating", createErr.code === "RESTRICTED");
  await sleep(1800); // let a presence cycle pass
  ok("denied door never listed", !(await presenceHas((r) => r.name === "SHOULD NOT EXIST")));

  const reactErrP = nextError<{ code: string; message: string }>(E, "RESTRICTED");
  E.emit("react", { id: "m123", reaction: "HA", on: true });
  const reactErr = await reactErrP;
  ok("probation blocks reacts", reactErr.code === "RESTRICTED" && (reactErr.message ?? "").includes("REACTS"));

  C.emit("room:join", { roomId: doorId });
  await wait(C, "room:joined");
  const blockedP = wait<{ until?: number; reason?: string }>(E, "mod:blocked");
  const cr2 = await emitAck<{ ok: boolean; error?: string }>(C, "report", { type: "FRAUD", targetId: idOf(E) });
  ok("3rd report files", cr2.ok === true);
  const blocked = await blockedP;
  ok("target got mod:blocked", !!blocked);
  await sleep(1000); // server disconnects 600ms after the notice
  const E2 = spawn("203.0.113.5");
  const gateErr = await nextError<{ code: string; message: string }>(E2, "BLOCKED");
  ok("blocked ip rejected at the gate", gateErr.code === "BLOCKED");
  ok("blocked socket gets no mask", !ids.has(E2));
  E2.disconnect();

  section("T3 — empty door burns on explicit leave");
  const H = await live("203.0.113.8");
  const I = await live("203.0.113.9");
  H.emit("room:create", { name: "BURN ME" });
  const hd = await wait<{ room: { id: string } }>(H, "room:joined");
  const burnId = hd.room.id;
  I.emit("room:join", { roomId: burnId });
  await wait(I, "room:joined");
  I.emit("room:leave"); // still H inside — no burn
  await sleep(500);
  ok("door alive while one mask remains", !waiterBurns.some((d) => d.roomId === burnId));
  H.emit("room:leave"); // last mask out — burn NOW
  const burned = await wait<{ roomId: string; name: string }>(waiter, "door:burned", 4000, (d) => d.roomId === burnId);
  ok("door burned on last leave", burned.name === "BURN ME");
  ok("burned door leaves presence", await presenceLacks(burnId));

  section("T4 — dropped connection gets grace, then burns");
  I.emit("room:create", { name: "GHOST DOOR" });
  const gd = await wait<{ room: { id: string } }>(I, "room:joined");
  const ghostId = gd.room.id;
  I.disconnect(); // dropped, not a polite leave
  const ghostBurn = await wait<{ roomId: string; name: string }>(waiter, "door:burned", 9000, (d) => d.roomId === ghostId);
  ok("grace elapsed → reaper burned it", ghostBurn.name === "GHOST DOOR");

  section("T5 — lobby typing presence");
  const T1 = await live("203.0.113.10");
  const T2 = await live("203.0.113.11");
  T1.emit("room:join", { roomId: "void" });
  T2.emit("room:join", { roomId: "void" });
  await wait(T1, "room:joined");
  await wait(T2, "room:joined");
  T1.emit("typing", { isTyping: true });
  const act1 = await wait<{ roomId: string; typing: number }>(waiter, "room:activity", 4000, (a) => a.roomId === "void" && a.typing === 1);
  ok("room:activity fires on start", act1.typing === 1);
  ok("presence carries typing", await presenceHas((r) => r.id === "void" && (r.typing ?? 0) === 1));
  T1.emit("typing", { isTyping: false });
  const act2 = await wait<{ roomId: string; typing: number }>(waiter, "room:activity", 4000, (a) => a.roomId === "void" && a.typing === 0);
  ok("room:activity fires on stop", act2.typing === 0);

  section("T6 — duplicate spam, strikes, repeat offender");
  const G = await live("203.0.113.7");
  G.emit("room:join", { roomId: "void" });
  await wait(G, "room:joined");
  let dupErrs = 0;
  G.on("error", (e: { code: string }) => {
    if (e.code === "DUP_SPAM") dupErrs += 1;
  });
  const gBlockedP = wait<{ reason?: string }>(G, "mod:blocked", 6000);
  for (let i = 0; i < 12; i++) {
    G.emit("msg:send", { content: "BUY MY COURSE" });
    await sleep(70);
  }
  const gBlocked = await gBlockedP;
  ok("3 dup trips → repeat offender block", !!gBlocked && (gBlocked.reason ?? "").includes("REPEAT"), gBlocked.reason ?? "?");
  ok("3 DUP_SPAM errors surfaced", dupErrs === 3, `got ${dupErrs}`);
  const G2 = spawn("203.0.113.7");
  const gGate = await nextError<{ code: string }>(G2, "BLOCKED");
  ok("spammer locked out on reconnect", gGate.code === "BLOCKED");
  G2.disconnect();

  section("T7 — connection flood");
  const floodErrors: string[] = [];
  const floodSocks: Socket[] = [];
  for (let i = 0; i < 8; i++) {
    const s = spawn("203.0.113.12");
    s.on("error", (e: { code: string }) => floodErrors.push(e.code));
    floodSocks.push(s);
    /* wait until this one settles (connect or reject) before the next */
    await new Promise<void>((res) => {
      if (s.connected) return res();
      const t = setTimeout(res, 3000);
      const onConn = () => {
        clearTimeout(t);
        s.off("connect", onConn);
        s.off("error", onErr);
        res();
      };
      const onErr = () => {
        clearTimeout(t);
        s.off("connect", onConn);
        s.off("error", onErr);
        res();
      };
      s.on("connect", onConn);
      s.on("error", onErr);
    });
    await sleep(130);
  }
  await sleep(800);
  ok(
    "flood rejected with CONN_FLOOD",
    floodErrors.filter((c) => c === "CONN_FLOOD").length >= 2,
    `got ${floodErrors.join(",") || "none"}`,
  );
  floodSocks.forEach((s) => s.disconnect());

  section("T8 — keeper actions");
  type PList = { ip: string; reason: string; by: string; remaining: number };
  type St = { blocks: PList[]; restricts: PList[]; reports: Rep[] };
  const lift1 = await emitAck<{ state?: St }>(keeper, "mod:act", { op: "lift:block", ip: "203.0.113.5" });
  ok("lift:block clears it", !(lift1.state?.blocks ?? []).some((b) => b.ip === "203.0.113.5"));
  const man = await emitAck<{ state?: St }>(keeper, "mod:act", { op: "block", ip: "203.0.113.99", hours: 1 });
  ok("manual block lands", (man.state?.blocks ?? []).some((b) => b.ip === "203.0.113.99" && b.reason === "BY HAND"));
  const esc = await emitAck<{ state?: St }>(keeper, "mod:act", { op: "escalate", reportId: rep?.id });
  ok("escalate blocks the report's ip", (esc.state?.blocks ?? []).some((b) => b.ip === "203.0.113.2"));
  ok("escalated report tagged", (esc.state?.reports ?? []).some((r) => r.id === rep?.id && r.action.includes("KEEPER")));
  const prob = await emitAck<{ state?: St }>(keeper, "mod:act", { op: "restrict", ip: "203.0.113.5", hours: 24 });
  ok("manual probation lands", (prob.state?.restricts ?? []).some((p) => p.ip === "203.0.113.5"));

  section("T9 — probation announced at the gate");
  const E3 = spawn("203.0.113.5");
  const gateNotice = await nextError<{ code: string; message: string }>(E3, "RESTRICTED");
  ok("restricted ip announced on connect", gateNotice.code === "RESTRICTED");
  const e3id = await wait(E3, "identity", 3000).catch(() => null);
  ok("restricted sockets still get a mask", !!e3id || ids.has(E3));
  E3.disconnect();

  section("feed");
  ok("keeper feed went live", feedLines.length > 8, `${feedLines.length} lines`);

  /* cleanup */
  for (const s of [keeper, waiter, D, E, F, C, H, T1, T2]) {
    try {
      s.disconnect();
    } catch {
      /* already gone */
    }
  }

  console.log(`\n═══ p4: ${passed} passed, ${failed} failed ${failed ? `— ${fails.join(" | ")}` : ""}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("SUITE CRASH:", e);
  process.exit(1);
});
