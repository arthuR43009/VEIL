/**
 * Door reaper verification — run with the service started as:
 *   VEIL_ROOM_TTL=6000 bun --hot index.ts
 * Creates a door, leaves it empty, waits, and checks whether it
 * disappears from presence (sweep runs every 15s, TTL 6s).
 */
import { io } from "socket.io-client";

const URL = "http://localhost:3003";
const opts = { path: "/", transports: ["websocket" as const], forceNew: true };

const NAME = `REAP ME ${Date.now() % 1000}`;

function connect(): Promise<ReturnType<typeof io>> {
  return new Promise((res) => {
    const s = io(URL, opts);
    s.on("connect", () => res(s));
  });
}

function once<T>(s: ReturnType<typeof io>, ev: string, ms = 4000): Promise<T | null> {
  return new Promise((res) => {
    const t = setTimeout(() => res(null), ms);
    s.once(ev, (payload: T) => {
      clearTimeout(t);
      res(payload);
    });
  });
}

(async () => {
  // phase 1: create the door and walk away
  const c1 = await connect();
  c1.emit("room:create", { name: NAME });
  const joined = await once<{ room: { id: string; name: string } }>(c1, "room:joined");
  if (!joined) {
    console.log("FAIL: no room:joined after create");
    process.exit(1);
  }
  console.log("created:", joined.room.name, joined.room.id);
  c1.emit("room:leave");
  c1.disconnect();

  // phase 2: poll presence until the door is gone (sweep every 15s)
  const t0 = Date.now();
  let reaped = false;
  while (Date.now() - t0 < 40000) {
    await new Promise((r) => setTimeout(r, 3000));
    const c2 = await connect();
    const p = await once<{ rooms: Array<{ name: string; custom: boolean }> }>(c2, "presence");
    const present = p?.rooms.some((r) => r.name === NAME) ?? true;
    c2.disconnect();
    process.stdout.write(`  t+${((Date.now() - t0) / 1000).toFixed(0)}s present=${present}\n`);
    if (!present) {
      reaped = true;
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        door: NAME,
        reaped,
        afterSec: +((Date.now() - t0) / 1000).toFixed(1),
        ok: reaped,
      },
      null,
      2,
    ),
  );
  process.exit(reaped ? 0 : 1);
})();
