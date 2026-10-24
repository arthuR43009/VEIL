/**
 * VEIL protocol test suite — v5 CIPHERS & GAMES.
 *
 * Run:  cd scripts && bun p5-tests.ts
 * Needs a v5 service on :3013 with test knobs, e.g.:
 *   PORT=3013 VEIL_MOD_KEY=testkey VEIL_SKIP_COOLDOWN=1500 \
 *   VEIL_FUSE_GRACE=3000 VEIL_HOTSEAT_SECS=3 VEIL_SPARK_COOLDOWN=700 \
 *   VEIL_TEST_TTLMS=2500 VEIL_REAP_EVERY=500 VEIL_TAG_TIMEOUT=800 \
 *   VEIL_REPORT_COOLDOWN=500 bun ../mini-services/veil-chat/index.ts
 *
 * Conventions (P4 graveyard): websocket transport only, forceNew,
 * sequential spawns (a 2nd io() during another's handshake hangs in
 * bun), and waiters attached BEFORE every triggering emit — events
 * fired during an ack await are otherwise already consumed.
 */
import { io, type Socket } from "socket.io-client";

const URL = "http://localhost:3013";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok  ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let ipCounter = 0;

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    ipCounter += 1;
    const s = io(URL, {
      path: "/",
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: 6000,
      // unique virtual IP per client — dodges the conn-flood jail that a
      // 40+ connection test run would otherwise trip (P4 convention)
      extraHeaders: { "x-forwarded-for": `198.51.100.${(ipCounter % 200) + 2}` },
    });
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e: Error) => reject(new Error(`connect: ${e.message}`)));
  });
}

interface Who {
  sock: Socket;
  handle: string;
  id: string;
}

async function live(): Promise<Who> {
  const sock = await connect();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("identity timeout")), 4000);
    sock.once("identity", ({ identity }: { identity: { id: string; handle: string } }) => {
      clearTimeout(t);
      resolve({ sock, handle: identity.handle, id: identity.id });
    });
  });
}

/** wait for the next event; attach BEFORE the trigger */
function once<T>(sock: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting "${event}"`)), timeoutMs);
    sock.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

/** emit with ack */
function emitAck<T>(sock: Socket, event: string, payload: unknown, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout "${event}"`)), timeoutMs);
    sock.emit(event, payload, (res: T) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

/** pre-attach an error waiter, then trigger — returns the error payload */
async function expectError(sock: Socket, trigger: () => void, _code: string, timeoutMs = 4000) {
  const p = once<{ code: string; message?: string }>(sock, "error", timeoutMs).catch(() => null);
  trigger();
  return p;
}

/** wait for the next event that satisfies a predicate (e.g. phase === reveal) */
function waitFor<T>(sock: Socket, event: string, pred: (p: T) => boolean, timeoutMs = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      sock.off(event, h);
      reject(new Error(`timeout waiting "${event}" to match`));
    }, timeoutMs);
    const h = (payload: T) => {
      if (!pred(payload)) return;
      clearTimeout(t);
      sock.off(event, h);
      resolve(payload);
    };
    sock.on(event, h);
  });
}

/** fuse two fresh masks; both waiters pre-attached */
async function fusePair(): Promise<{ a: Who; b: Who; aMatch: any; bMatch: any }> {
  const a = await live();
  const b = await live();
  const aMatchP = once<any>(a.sock, "matched");
  const bMatchP = once<any>(b.sock, "matched");
  b.sock.emit("fuse:queue", { tags: [] });
  a.sock.emit("fuse:queue", { tags: [] });
  return { a, b, aMatch: await aMatchP, bMatch: await bMatchP };
}

async function main() {
  console.log("VEIL v5 protocol suite —", URL);

  /* ── 1. private code doors ── */
  console.log("\n[1] CODE-ONLY DOORS");
  {
    const a = await live();
    const joinedP = once<{ room: { code?: string; name: string } }>(a.sock, "room:joined");
    const ack = await emitAck<{ ok: boolean; code?: string }>(a.sock, "room:create", {
      name: "VAULT SEVEN",
      privacy: "code",
    });
    const joined = await joinedP;
    ok("create returns a code", !!ack.ok && typeof ack.code === "string" && ack.code.length === 6, ack.code);
    ok("creator's room:joined carries the code", joined.room.code === ack.code);

    const b = await live();
    const pres = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("presence timeout")), 4000);
      b.sock.once("presence", (p: any) => {
        clearTimeout(t);
        resolve(p);
      });
    });
    ok("invisible in the lobby list", !pres.rooms.some((r: any) => r.name === "VAULT SEVEN"));

    const bJoinedP = once<{ room: { name: string }; members: unknown[] }>(b.sock, "room:joined");
    const bJoined = await emitAck<{ ok: boolean }>(b.sock, "room:join", { roomId: ack.code });
    const bRoom = await bJoinedP;
    ok("join by code works", !!bJoined.ok && bRoom.room.name === "VAULT SEVEN" && bRoom.members.length === 2);

    const bogusErr = await expectError(b.sock, () => {
      b.sock.emit("room:join", { roomId: "ZZZZZZ" });
    }, "NO_DOOR");
    ok("unknown code rejected", !!bogusErr && bogusErr.code === "NO_DOOR");

    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 2. password doors ── */
  console.log("\n[2] PASSWORD DOORS");
  {
    const a = await live();
    const joinedP = once(a.sock, "room:joined");
    await emitAck(a.sock, "room:create", { name: "GATEKEEP", password: "sesame" });
    await joinedP;
    const pres = await new Promise<any>((r) => a.sock.once("presence", (p: any) => r(p)));
    const row = pres.rooms.find((r: any) => r.name === "GATEKEEP");
    ok("lock badge in presence", !!row && row.lock === true);

    const b = await live();
    const doorId = (row as { id: string }).id;
    const needKey = await expectError(b.sock, () => {
      b.sock.emit("room:join", { roomId: doorId });
    }, "NEED_KEY");
    ok("locked door demands the key", needKey?.code === "NEED_KEY");

    const wrong = await expectError(b.sock, () => {
      b.sock.emit("room:join", { roomId: doorId, password: "nope" });
    }, "DOOR_LOCKED");
    ok("wrong key rejected", wrong?.code === "DOOR_LOCKED");

    const goodP = once(b.sock, "room:joined");
    const good = await emitAck<{ ok: boolean }>(b.sock, "room:join", { roomId: doorId, password: "sesame" });
    const goodRoom = await goodP;
    ok("right key opens the door", !!good.ok && goodRoom.room.name === "GATEKEEP");

    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 3. timed doors burn on schedule ── */
  console.log("\n[3] TIMED DOORS (TEST_TTLMS=2500)");
  {
    const a = await live();
    const joinedP = once(a.sock, "room:joined");
    await emitAck(a.sock, "room:create", { name: "FUSEBOX", ttlMin: 30 });
    await joinedP;
    const pres = await new Promise<any>((r) => a.sock.once("presence", (p: any) => r(p)));
    const row = pres.rooms.find((r: any) => r.name === "FUSEBOX");
    ok("burnIn counts down in presence", !!row && typeof row.burnIn === "number" && row.burnIn > 0, `${row?.burnIn}s`);

    const expired = await once<{ roomId: string; name: string }>(a.sock, "room:expired", 7000);
    ok("members told the door burned on schedule", expired.name === "FUSEBOX");
    const burned = await once<{ roomId: string }>(a.sock, "door:burned", 3000);
    ok("lobby sees the burn", !!burned.roomId);
    a.sock.disconnect();
  }

  /* ── 4. NEXT MASK + cooldown ── */
  console.log("\n[4] NEXT MASK (SKIP_COOLDOWN=1500)");
  {
    const { a, b, aMatch } = await fusePair();
    ok("fuse matched, resumeId issued", typeof aMatch.resumeId === "string" && aMatch.resumeId.startsWith("rs-"));

    const bLeftP = once<{ handle: string; reason?: string }>(b.sock, "partner:left");
    const skipAck = await emitAck<{ ok: boolean; cooldown?: number }>(a.sock, "chat:skip", {});
    ok("skip acked with cooldown", !!skipAck.ok && typeof skipAck.cooldown === "number");
    const bLeft = await bLeftP;
    ok("partner told the stranger moved on", bLeft.reason === "SKIP");

    const coolErr = await expectError(a.sock, () => {
      a.sock.emit("fuse:queue", { tags: [] });
    }, "SKIP_COOLDOWN");
    ok("cooldown enforced at the queue", coolErr?.code === "SKIP_COOLDOWN");

    await sleep(1700);
    const requeuedP = once<{ waiting: number }>(a.sock, "queue:joined");
    a.sock.emit("fuse:queue", { tags: [] });
    const requeued = await requeuedP;
    ok("queue accepts after the breath", typeof requeued.waiting === "number");
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 5. reconnect grace: resume ── */
  console.log("\n[5] RESUME (FUSE_GRACE=3000)");
  {
    const { a, b, aMatch } = await fusePair();

    const bGhostP = once<{ handle: string; grace: number }>(b.sock, "partner:reconnecting");
    a.sock.disconnect();
    const ghost = await bGhostP;
    ok("partner sees the ghost countdown", ghost.grace === 3 && ghost.handle === a.handle);

    const a2 = await live();
    const backP = once<{ handle: string }>(b.sock, "partner:back");
    const identP = once<any>(a2.sock, "identity");
    const resumeAck = await emitAck<{ ok: boolean }>(a2.sock, "chat:resume", { resumeId: aMatch.resumeId });
    const back = await backP;
    const ident = await identP;
    ok("resume accepted", !!resumeAck?.ok);
    ok("same face on the new wire", ident.identity.handle === a.handle);
    ok("partner told the signal returned", back.handle === a.handle);

    const aMsgP = once<any>(a2.sock, "msg:new");
    b.sock.emit("msg:send", { content: "still here?" });
    const aMsg = await aMsgP;
    ok("messages flow after resume", aMsg.content === "still here?" && aMsg.mine === false);

    a2.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 6. reconnect grace: expiry ── */
  console.log("\n[6] GRACE EXPIRY");
  {
    const { a, b, aMatch } = await fusePair();

    const bLostP = once<{ reason?: string }>(b.sock, "partner:left", 6000);
    a.sock.disconnect();
    const bLost = await bLostP;
    ok("fuse dies when grace burns out", bLost.reason === "LOST");

    const a2 = await live();
    const goneErrP = once<{ code: string }>(a2.sock, "error", 4000).catch(() => null);
    const gone = await emitAck<{ ok: boolean }>(a2.sock, "chat:resume", { resumeId: aMatch.resumeId });
    const goneErr = await goneErrP;
    ok("late resume rejected + RESUME_GONE", !!gone && !gone.ok && goneErr?.code === "RESUME_GONE");
    a2.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 7. seen receipts ── */
  console.log("\n[7] SEEN");
  {
    const { a, b } = await fusePair();

    const bSeenP = once<{ handle: string; upTo: number }>(b.sock, "msg:seen");
    const aMsgP = once<any>(a.sock, "msg:new");
    b.sock.emit("msg:send", { content: "read me" });
    const aMsg = await aMsgP;
    a.sock.emit("seen", { upTo: aMsg.at });
    const seen = await bSeenP;
    ok("seen relayed to the sender", seen.upTo === aMsg.at);
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 8. icebreaker sparks ── */
  console.log("\n[8] SPARKS (SPARK_COOLDOWN=700)");
  {
    const { a, b } = await fusePair();

    const aSparkP = once<any>(a.sock, "msg:new");
    const bSparkP = once<any>(b.sock, "msg:new");
    const sparkAck = await emitAck<{ ok: boolean }>(a.sock, "spark", {});
    const aSpark = await aSparkP;
    await bSparkP;
    ok("spark acked", !!sparkAck.ok);
    ok("spark lands as a shared system line", aSpark.kind === "system" && aSpark.content.startsWith("SPARK — "));

    const spamErr = await expectError(a.sock, () => {
      a.sock.emit("spark", {});
    }, "SPARK_COOLDOWN");
    ok("spark spam cooled down", spamErr?.code === "SPARK_COOLDOWN");
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 9. would you rather ── */
  console.log("\n[9] WOULD YOU RATHER");
  {
    const { a, b } = await fusePair();

    const aStateP = once<any>(a.sock, "game:state");
    const startAck = await emitAck<{ ok: boolean }>(a.sock, "game:start", { game: "wyr" });
    const st1 = await aStateP;
    ok("wyr starts", !!startAck.ok && st1.game === "wyr" && st1.phase === "answer" && Array.isArray(st1.q) && st1.q.length === 2);

    const revealP = waitFor<any>(a.sock, "game:state", (st) => st.phase === "reveal");
    a.sock.emit("game:answer", { choice: "a" });
    b.sock.emit("game:answer", { choice: "a" });
    const reveal = await revealP;
    ok("reveal shows both picks", reveal.picks.length === 2 && reveal.picks.every((p: any) => p));
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 10. two truths & a lie ── */
  console.log("\n[10] TWO TRUTHS & A LIE");
  {
    const { a, b } = await fusePair();

    const aStateP = once<any>(a.sock, "game:state");
    await emitAck(a.sock, "game:start", { game: "truths" });
    const st1 = await aStateP;
    ok("writer named", st1.game === "truths" && st1.phase === "write" && st1.writer === a.handle);

    const guessP = once<any>(a.sock, "game:state");
    a.sock.emit("game:submit", { lines: ["I OWN A CAT", "I ONCE FELL OFF A STAGE", "I HATE PIZZA"] });
    const st2 = await guessP;
    ok("three lines on the table", st2.phase === "guess" && Array.isArray(st2.lines) && st2.lines.length === 3);

    const revealP = once<any>(a.sock, "game:state");
    b.sock.emit("game:answer", { pick: 3 });
    const reveal = await revealP;
    ok("reveal marks lie + verdict", reveal.phase === "reveal" && typeof reveal.lie === "number" && typeof reveal.correct === "boolean");
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 11. hot seat (3s clock) ── */
  console.log("\n[11] HOT SEAT (HOTSEAT_SECS=3)");
  {
    const { a, b } = await fusePair();

    const aStateP = once<any>(a.sock, "game:state");
    await emitAck(a.sock, "game:start", { game: "hotseat" });
    const st1 = await aStateP;
    ok("question + clock arrive", st1.game === "hotseat" && st1.phase === "answer" && typeof st1.q === "string" && st1.secondsLeft <= 3);

    const revealP = waitFor<any>(a.sock, "game:state", (st) => st.phase === "reveal");
    a.sock.emit("game:answer", { text: "ALPHA" });
    b.sock.emit("game:answer", { text: "BRAVO" });
    const reveal = await revealP;
    ok("both sealed answers revealed", reveal.answers.filter((x: any) => x).length === 2);
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 12. secret handshake ── */
  console.log("\n[12] SECRET HANDSHAKE");
  {
    const a = await live();
    const b = await live();
    const aMatchP = once<any>(a.sock, "matched");
    b.sock.emit("fuse:queue", { tags: ["MUSIC"] });
    a.sock.emit("fuse:queue", { tags: ["MUSIC", "ART"] });
    const aMatch = await aMatchP;
    ok("still fuses on shared tags", aMatch.via === "INTERESTS" && aMatch.shared[0] === "MUSIC");

    const bTappedP = once<{ handle: string }>(b.sock, "handshake:tapped");
    a.sock.emit("handshake:tap");
    const tapped = await bTappedP;
    ok("the offer reaches the partner", tapped.handle === a.handle);

    const aRevealP = once<any>(a.sock, "handshake:reveal");
    const bRevealP = once<any>(b.sock, "handshake:reveal");
    b.sock.emit("handshake:tap");
    const aReveal = await aRevealP;
    await bRevealP;
    ok(
      "reveal: score, label, shared tags",
      typeof aReveal.score === "number" && typeof aReveal.label === "string" && aReveal.shared.includes("MUSIC"),
      `${aReveal.score}% ${aReveal.label}`,
    );
    a.sock.disconnect();
    b.sock.disconnect();
  }

  /* ── 13. keeper: mute words + export + night stats ── */
  console.log("\n[13] KEEPER CONSOLE v5");
  {
    const keeper = await live();
    const authAck = await emitAck<any>(keeper.sock, "mod:auth", { key: "testkey" });
    ok("keeper on duty", !!authAck.ok && !!authAck.state?.night);
    ok("night stats present", typeof authAck.state.night.peakOnline === "number" && typeof authAck.state.night.avgFuseMin === "number");

    const setAck = await emitAck<any>(keeper.sock, "mod:act", { op: "mutewords:set", words: ["GRAPEFRUIT"] });
    ok("mute words applied", !!setAck.ok && setAck.state.mutewords.includes("GRAPEFRUIT"));

    const a = await live();
    const joinedP = once(a.sock, "room:joined");
    await emitAck(a.sock, "room:join", { roomId: "void" });
    await joinedP;

    const mutedErr = await expectError(a.sock, () => {
      a.sock.emit("msg:send", { content: "i love GRAPEFRUIT so much" });
    }, "MUTED_WORD");
    ok("muted word blocked", mutedErr?.code === "MUTED_WORD");

    const okMsgP = once<any>(a.sock, "msg:new");
    a.sock.emit("msg:send", { content: "i love apples though" });
    const okMsg = await okMsgP;
    ok("clean words still fly", okMsg.content === "i love apples though");

    const exportAck = await emitAck<any>(keeper.sock, "mod:act", { op: "export:night" });
    ok(
      "export carries counts only",
      !!exportAck.export &&
        typeof exportAck.export.night.msgsRelayed === "number" &&
        typeof exportAck.export.reports === "number" &&
        !Array.isArray(exportAck.export.reports),
    );
    ok("muted hits counted", exportAck.export.night.mutedHits >= 1);

    keeper.sock.disconnect();
    a.sock.disconnect();
  }

  console.log(`\n═══ ${pass} passed · ${fail} failed ═══`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("SUITE CRASHED:", e);
  process.exit(1);
});
