/**
 * Phase 3 direct protocol verification against veil-chat v3:
 *  1. reaction rate limit (12 ops / 10s)
 *  2. instant INTERESTS fuse (shared tag) + shared message id echo
 *  3. reaction relay in a fuse room (no self-echo)
 *  4. tag-timeout fallback → CHANCE fuse (~20s)
 */
import { io } from "socket.io-client";

const URL = "http://localhost:3003";
const opts = { path: "/", transports: ["websocket" as const], forceNew: true };

const results: Record<string, unknown> = {};
const log = (k: string, v: unknown) => {
  results[k] = v;
  console.log(`${k}:`, typeof v === "object" ? JSON.stringify(v) : v);
};

/* ── 1. reaction rate limit ─────────────────────────────── */

async function testReactRateLimit(): Promise<void> {
  const c1 = io(URL, opts);
  await new Promise<void>((res) => c1.on("connect", res));

  c1.emit("room:join", { roomId: "void" });
  let errors = 0;
  c1.on("error", (e: { code: string; message: string }) => {
    if (e.code === "RATE_LIMITED") errors += 1;
  });

  // 16 rapid toggles — limiter allows 12 per 10s
  for (let i = 0; i < 16; i++) {
    c1.emit("react", { id: "rl-test-msg", reaction: "SAME", on: i % 2 === 0 });
  }
  await new Promise((r) => setTimeout(r, 900));
  log("react.rateLimit", { blocked: errors, expectedBlocked: 4 });
  c1.emit("room:leave");
  c1.disconnect();
}

/* ── 2+3. interests fuse + echo ids + reaction relay ────── */

function testInterestsFuse(): Promise<void> {
  return new Promise((resolve) => {
    const c3 = io(URL, opts);
    const c4 = io(URL, opts);
    let c3Match: { via?: string; shared?: string[] } | null = null;
    let c4Match: { via?: string; shared?: string[] } | null = null;
    const c4Msgs: Array<{ id: string; mine?: boolean }> = [];
    const c3SelfEcho: Array<{ id: string; mine?: boolean }> = [];
    let c4GotReaction = false;
    let c3SelfEchoReaction = false;
    let sentId = "";
    let matchedAt = 0;

    const t0 = Date.now();
    c3.on("matched", (m: { via?: string; shared?: string[] }) => {
      c3Match = m;
      if (!matchedAt) matchedAt = Date.now() - t0;
    });
    c4.on("matched", (m: { via?: string; shared?: string[] }) => {
      c4Match = m;
      if (!matchedAt) matchedAt = Date.now() - t0;
    });
    c3.on("msg:new", (m: { id: string; mine?: boolean; from?: { handle: string } }) => {
      if (m.mine) c3SelfEcho.push(m);
      if (!m.mine && m.from && m.id === sentId) {
        // c3 received c4's message — remember id for reaction targeting
      }
    });
    c4.on("msg:new", (m: { id: string; mine?: boolean; from?: { handle: string } }) => {
      c4Msgs.push({ id: m.id, mine: m.mine });
      if (m.mine) sentId = m.id;
    });
    c4.on("msg:reaction", (r: { reaction: string }) => {
      if (r.reaction === "REAL") c4GotReaction = true;
    });
    c3.on("msg:reaction", (r: { reaction: string }) => {
      if (r.reaction === "REAL") c3SelfEchoReaction = true; // should NOT happen
    });

    c3.on("connect", () => c3.emit("fuse:queue", { tags: ["GAMING", "RETRO"] }));
    c4.on("connect", () => c4.emit("fuse:queue", { tags: ["GAMING"] }));

    const timer = setInterval(() => {
      if (c3Match && c4Match && c4Msgs.some((m) => m.mine) && c3SelfEcho.length > 0) {
        clearInterval(timer);
        // c4 sent nothing yet — the echoes so far are c3's own message? No: nobody sent yet.
        // force the flow: after match, c3 sends a message
      }
      if (Date.now() - t0 > 8000) {
        clearInterval(timer);
        log("fuse.interests", {
          via: c3Match?.via,
          sharedA: c3Match?.shared,
          sharedB: c4Match?.shared,
          matchMs: matchedAt || Date.now() - t0,
          ok:
            c3Match?.via === "INTERESTS" &&
            JSON.stringify(c3Match?.shared) === JSON.stringify(["GAMING"]) &&
            c4Match?.via === "INTERESTS",
        });
        // message echo test: c3 sends
        c3.emit("msg:send", { content: "echo probe" });
        setTimeout(() => {
          const mine = c4Msgs.find((m) => m.mine); // c4's own? no — c4 didn't send. This is c3's message arriving at c4 with mine=false
          const c3Own = c3SelfEcho.find((m) => true);
          log("msg.echo", {
            c3OwnId: c3Own?.id,
            c4SeenId: c4Msgs.find((m) => !m.mine)?.id,
            sameId: !!c3Own && c4Msgs.some((m) => !m.mine && m.id === c3Own.id),
            c3MineFlag: c3Own?.mine === true,
            c4MineFlag: c4Msgs.find((m) => !m.mine)?.mine === false,
          });
          // reaction relay on the shared id (c3 reacts to own message; c4 must see it, c3 must not)
          c3.emit("react", { id: c3Own?.id, reaction: "REAL", on: true });
          setTimeout(() => {
            log("react.relay", {
              c4Saw: c4GotReaction,
              c3SelfEcho: c3SelfEchoReaction, // must be false
              ok: c4GotReaction && !c3SelfEchoReaction,
            });
            c3.emit("chat:burn");
            setTimeout(() => {
              c3.disconnect();
              c4.disconnect();
              resolve();
            }, 300);
          }, 700);
        }, 700);
      }
    }, 250);
  });
}

/* ── 4. tag timeout → CHANCE fallback ───────────────────── */

function testTagTimeout(): Promise<void> {
  return new Promise((resolve) => {
    const c1 = io(URL, opts);
    const c2 = io(URL, opts);
    let m1: { via?: string; shared?: string[] } | null = null;
    let m2: { via?: string; shared?: string[] } | null = null;
    c1.on("matched", (m: { via?: string; shared?: string[] }) => (m1 = m));
    c2.on("matched", (m: { via?: string; shared?: string[] }) => (m2 = m));

    c1.on("connect", () => c1.emit("fuse:queue", { tags: ["ALPHA-ONLY"] }));
    c2.on("connect", () => c2.emit("fuse:queue", { tags: ["BETA-ONLY"] }));

    const t0 = Date.now();
    const timer = setInterval(() => {
      if (m1 && m2) {
        clearInterval(timer);
        const waited = Date.now() - t0;
        log("fuse.timeoutFallback", {
          waitedSec: +(waited / 1000).toFixed(1),
          viaA: m1?.via,
          sharedA: m1?.shared,
          viaB: m2?.via,
          ok:
            m1?.via === "CHANCE" &&
            m2?.via === "CHANCE" &&
            (m1?.shared?.length ?? 1) === 0 &&
            waited > 15000 &&
            waited < 30000,
        });
        c1.emit("chat:burn");
        setTimeout(() => {
          c1.disconnect();
          c2.disconnect();
          resolve();
        }, 300);
      } else if (Date.now() - t0 > 32000) {
        clearInterval(timer);
        log("fuse.timeoutFallback", { FAIL: "no match within 32s", m1, m2 });
        c1.disconnect();
        c2.disconnect();
        resolve();
      }
    }, 500);
  });
}

/* ── run ────────────────────────────────────────────────── */

(async () => {
  await testReactRateLimit();
  await new Promise((r) => setTimeout(r, 600));
  await testInterestsFuse();
  await new Promise((r) => setTimeout(r, 600));
  await testTagTimeout();
  console.log("\n=== P3 PROTOCOL SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})();
