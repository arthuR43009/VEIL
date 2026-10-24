/**
 * Direct verification of the veil-chat rate limiter + relay.
 * Two synthetic clients: C1 rapid-fires 10 messages (~30ms apart),
 * C2 counts what arrives. Expect: ~8 delivered, RATE_LIMITED on C1.
 */
import { io } from "socket.io-client";

const URL = "http://localhost:3003";
const opts = { path: "/", transports: ["websocket" as const], forceNew: true };

const c1 = io(URL, opts);
const c2 = io(URL, opts);

let c2Got = 0;
let c1Errors: string[] = [];
let c1Done = 0;

c2.on("msg:new", (m: { kind: string }) => {
  if (m.kind === "user") c2Got += 1;
});
c1.on("error", (e: { code: string }) => c1Errors.push(e.code));

function finish() {
  console.log(JSON.stringify({ deliveredToC2: c2Got, c1Errors: [...new Set(c1Errors)], sent: c1Done }, null, 2));
  c1.disconnect();
  c2.disconnect();
  process.exit(0);
}

c1.on("connect", () => {
  c1.emit("room:join", { roomId: "void" });
});
c2.on("connect", () => {
  c2.emit("room:join", { roomId: "void" });
});

// wait for both to be in, then burst
setTimeout(() => {
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      c1.emit("msg:send", { content: `burst ${i}` });
      c1Done += 1;
    }, i * 35);
  }
}, 800);

setTimeout(finish, 3500);
