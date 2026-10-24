"use client";

/**
 * RoomAtmosphere — every room breathes differently (v5).
 *
 * Each of the six themed rooms gets its own tint, background pattern
 * and avatar frame: AFTER DARK is dim with twinkling stars, MOSH PIT
 * runs an equalizer and hazard stripes, the DEEP END ripples, the
 * ARCADE is a pixel grid, CONFESSIONS is scored coral, THE VOID stays
 * the void. Custom doors get a quiet paper texture.
 */
import { memo } from "react";
import { StrangerAvatar } from "./stranger-avatar";

export interface AtmosphereSpec {
  /** pattern layer class (empty = the plain dot-grid void) */
  atmo: string;
  /** tint wash layer class */
  tint: string;
  /** avatar frame class */
  frame: string;
  /** extra-dim body (AFTER DARK) */
  dim?: boolean;
  /** the equalizer strip (MOSH PIT) */
  eq?: boolean;
}

export const DEFAULT_ATMOSPHERE: AtmosphereSpec = {
  atmo: "",
  tint: "",
  frame: "frame-solid",
};

const ROOM_ATMOSPHERE: Record<string, AtmosphereSpec> = {
  void: { atmo: "", tint: "", frame: "frame-solid" },
  afterdark: { atmo: "atmo-afterdark", tint: "tint-afterdark", frame: "frame-glow", dim: true },
  confess: { atmo: "atmo-confess", tint: "tint-confess", frame: "frame-dashed" },
  moshpit: { atmo: "atmo-moshpit", tint: "tint-moshpit", frame: "frame-double", eq: true },
  arcade: { atmo: "atmo-arcade", tint: "tint-arcade", frame: "frame-pixel" },
  deepend: { atmo: "atmo-deepend", tint: "tint-deepend", frame: "frame-ring" },
};

export function getAtmosphere(roomId: string | null | undefined, isCustom = false): AtmosphereSpec {
  if (isCustom) return { atmo: "atmo-door", tint: "tint-door", frame: "frame-solid" };
  if (roomId && ROOM_ATMOSPHERE[roomId]) return ROOM_ATMOSPHERE[roomId];
  return DEFAULT_ATMOSPHERE;
}

/** the pattern + tint layers — absolutely positioned under the messages */
export const RoomAtmosphere = memo(function RoomAtmosphere({
  roomId,
  custom,
}: {
  roomId: string | null | undefined;
  custom?: boolean;
}) {
  const spec = getAtmosphere(roomId, custom);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {spec.tint && <div className={`absolute inset-0 ${spec.tint}`} />}
      {spec.atmo && <div className={`atmo absolute inset-0 ${spec.atmo}`} />}
      {spec.dim && <div className="absolute inset-0 bg-[#0B0B16]/40" />}
      {spec.eq && (
        <div className="absolute inset-x-0 top-0 flex h-6 items-end justify-center gap-[3px] opacity-60">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="eq-bar w-[3px] rounded-sm bg-lime/50"
              style={{
                height: `${8 + ((i * 37) % 15)}px`,
                animationDelay: `${(i % 6) * 0.12}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

/** an avatar wearing its room's frame */
export function FramedAvatar({
  seed,
  roomId,
  custom,
  className = "",
  avatarClassName = "h-8 w-8",
}: {
  seed: string;
  roomId: string | null | undefined;
  custom?: boolean;
  className?: string;
  avatarClassName?: string;
}) {
  const spec = getAtmosphere(roomId, custom);
  return (
    <span className={`inline-grid shrink-0 place-items-center p-[2px] ${spec.frame} ${className}`}>
      <StrangerAvatar seed={seed} className={avatarClassName} />
    </span>
  );
}
