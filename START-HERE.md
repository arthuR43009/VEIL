# VEIL — v0.5.0 "CIPHERS & GAMES"

Anonymous chat that vanishes. No accounts, no logs, no traces — rooms burn when you leave.

This zip runs locally with two terminals and [bun](https://bun.sh). No database needed (the Prisma scaffolding is inert).

---

## RUN IT (2 terminals)

**Terminal 1 — the chat service:**
```bash
cd mini-services/veil-chat
bun install
bun run dev          # v5 — CIPHERS & GAMES, listening on :3003
```

**Terminal 2 — the app:**
```bash
bun install
bun run dev          # next dev on :3000
```

Open **http://localhost:3000** and press **ENTER A ROOM**.

> The app auto-detects localhost and talks to the chat service directly on :3000→:3003.
> Behind a different host/proxy it falls back to `/?XTransformPort=3003`, or you can
> force a chat URL with the `NEXT_PUBLIC_CHAT_URL` env var (build-time on Vercel).

---

## WHAT'S IN v0.5.0 (on top of v0.4)

**Doors grew teeth**
- **Code-only doors** — open a door that never appears in the lobby; share its 6-character code your own way. Others join by typing the code.
- **Door passwords** — any door can demand a spoken key. The lobby shows the lock.
- **Timed doors** — doors that burn themselves after 30 or 60 minutes, on schedule, with a live countdown chip in the lobby.
- **Presence previews** — every room row shows the masks inside (up to 4 avatars) and doors swing open with the same wipe the app uses.

**Safety & feel**
- **18+/rules gate** — one-time "I'm 18+ and I agree" threshold with 5 plain-language rules (per-browser, no accounts so the device is the witness).
- **Reduce-motion toggle** — SYSTEM / REDUCED / FULL, on the rules screen and the mask gate; kills every animation like the OS setting.
- **Contrast pass** — the tiny 8px mono labels were raised to 9px+ and brightened.
- **Per-room atmosphere** — each room has its own tint, pattern and avatar frame. AFTER DARK is dim with twinkling stars; the MOSH PIT runs an equalizer.
- **Typing ghost** — the dots became a small drifting ghost.
- **Grouped bubbles + read shimmer** — consecutive messages cluster; when the other mask reads yours, a quiet shimmer sweeps the bubble once.

**1:1 fuse upgrades**
- **Reconnect grace** — a dropped connection holds the fuse for 20 seconds. Come back and you're in the same conversation with the same mask; your partner watches a ghost countdown instead of a goodbye.
- **NEXT MASK** — a sanctioned skip with a server-enforced cooldown, so moving on never means hammering strangers.
- **SPARK A TOPIC** — an icebreaker prompt drops into the room, tuned per room.
- **GAMES** — WOULD YOU RATHER, TWO TRUTHS & A LIE, and the HOT SEAT (60 sealed seconds).
- **SECRET HANDSHAKE** — both masks tap; the veil parts to show your vibe score and shared tags.
- **The better burn** — the room dissolves into ash embers and glitch scanlines, then leaves a receipt: "THIS CONVERSATION NEVER EXISTED."
- **Session recap card** — minutes spoken, words, reactions, "nothing saved" — with COPY RECAP / WHISPER IT (Web Share) buttons. It doubles as the marketing.

**Keeper console v2 (/mod)**
- Live **mute-word list** (applies to the next message, everywhere)
- Report **filters by type and room**
- **THE NIGHT** operator stats: peak online, reports per hour, average conversation length, messages relayed, doors burned
- **EXPORT NIGHT** — a counts-only JSON summary, no content, ever

---

## KEEPER CONSOLE

The console at **/mod** needs the operator key:
```bash
# terminal 1, restart with:
VEIL_MOD_KEY=your-secret bun run dev
```
Unset = the keepers are off duty (console says so). **Change this in production.**

---

## CHAT SERVICE ENV KNOBS (all optional)

| Knob | Default | Meaning |
|---|---|---|
| `PORT` | 3003 | listen port (hosting platforms inject this) |
| `VEIL_MOD_KEY` | (off) | keeper console key |
| `VEIL_FUSE_GRACE` | 20000 | ms a dropped 1:1 holds its room for a resume |
| `VEIL_SKIP_COOLDOWN` | 6000 | ms lockout after NEXT MASK |
| `VEIL_SPARK_COOLDOWN` | 8000 | ms between icebreaker sparks per mask |
| `VEIL_HOTSEAT_SECS` | 60 | HOT SEAT answer window |
| `VEIL_ROOM_TTL` | 20000 | ms an empty door survives a dropped connection |
| `VEIL_REAP_EVERY` | 15000 | reaper sweep interval |
| `VEIL_TAG_TIMEOUT` | 20000 | tagged-mask fallback-to-chance wait |
| `VEIL_REPORT_COOLDOWN` | 15000 | per-reporter filing cooldown |
| `VEIL_ENFORCE_PRIVATE` | 0 | tests only — enforce blocks on private IPs |

Everything lives in memory. Restart the service and every conversation, block,
mute word and report never existed. That is the product.

---

## PROTOCOL TESTS (service must be running)

```bash
cd scripts
# v5 suite — 45 checks: doors, skip, resume, games, handshake, mutewords, stats
PORT=3013 VEIL_MOD_KEY=testkey VEIL_SKIP_COOLDOWN=1500 VEIL_FUSE_GRACE=3000 \
VEIL_HOTSEAT_SECS=3 VEIL_SPARK_COOLDOWN=700 VEIL_TEST_TTLMS=2500 VEIL_REAP_EVERY=500 \
VEIL_TAG_TIMEOUT=800 VEIL_REPORT_COOLDOWN=500 bun -e 'process.env.PORT="3013"; import("../mini-services/veil-chat/index.ts")' &
sleep 1 && bun p5-tests.ts
```
(Or start the service in another terminal with those env vars, then `bun p5-tests.ts`.)

`p4-tests.ts` (moderation) and `p3-tests.ts` (tags/reactions/reaper) still work the same way.

---

## DEPLOYING TO THE INTERNET — the free path

1. **Frontend** → [Vercel Hobby](https://vercel.com) (import repo, root dir). Set env var
   `NEXT_PUBLIC_CHAT_URL=https://<your-chat-host>` **before the first build** (it's build-time).
2. **Chat service** → [Render Free](https://render.com) (or Koyeb) — new Web Service from
   `mini-services/veil-chat` (it has a Dockerfile; Render also runs it natively with bun).
   Set `VEIL_MOD_KEY`. Render injects `PORT` — already handled.
3. **Keep-alive** → [UptimeRobot](https://uptimerobot.com) free, ping
   `https://<your-chat-host>/?EIO=4&transport=polling` every 5 minutes so Render's
   free tier doesn't sleep the service. (Plain `/` returns 400 — that's engine.io owning
   the path; the polling handshake above is the real health endpoint.)
4. Custom domain: free on Vercel.

**Best $0 always-on:** an Oracle Cloud Always Free ARM VM running both processes + Caddy
(free DuckDNS subdomain + auto-HTTPS). See the v0.3.0 notes in the repo history for the
two-subdomain Caddyfile shape.

**Caveat by design:** every deploy/restart/sleep erases all live rooms, reports, blocks
and mute words. In-memory only — that is the product.

---

## TROUBLESHOOTING

- **Gate stuck on CONNECTING** — the chat service isn't running on :3003, or you're serving
  the app from a host that isn't localhost and the proxy isn't routing `?XTransformPort=3003`.
- **`bun --hot` restart quirk** — the old listener can survive a hot reload and share the
  port. `pkill -f "bun --hot"` then verify with `ss -tlnp | grep 3003` before restarting.
- **Locked out?** Blocks never apply to loopback/LAN IPs unless `VEIL_ENFORCE_PRIVATE=1`.
- **Two chat services?** `pkill -f "bun --hot"` kills the dev one; plain `bun index.ts`
  (test instances) is a different pattern and survives it.
- **Reports/blocks vanished after a redeploy** — yes. Memory only. By design.

---

Say anything. Leave nothing.
