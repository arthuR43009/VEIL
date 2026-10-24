/**
 * StrangerAvatar — Veil's seeded, deterministic identity masks.
 *
 * Every stranger gets an avatar derived from their server-assigned seed:
 * same seed ⇒ same face, forever, yet no two strangers look alike.
 * All geometry & colors come from the Veil design system (ink / cream /
 * lime / coral), so the crowd always matches the brand.
 */
import { memo } from "react";

const INK = "#0E0E13";
const INK2 = "#15151D";
const INK3 = "#1D1D27";
const CREAM = "#F4F1E9";
const LIME = "#D9F450";
const CORAL = "#FF5A3C";

/* deterministic PRNG — mulberry32 seeded from the string */
function seededRand(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** colorways: [body, frameBg, feature] — light bodies sit on dark frames and vice versa */
const COLORWAYS: Array<[string, string, string]> = [
  [LIME, INK, INK], // lime ghost on ink
  [CREAM, INK, INK], // pale spirit
  [CORAL, INK, INK], // coral apparition
  [INK, LIME, LIME], // inverted: ink mask in lime chamber
  [INK, CREAM, CREAM], // ink mask in cream chamber
  [INK, CORAL, CORAL], // ink mask in coral chamber
  [CREAM, INK2, INK], // paper spirit on deep ink
  [LIME, INK3, INK],
];

const SHAPES = ["ghost", "blob", "diamond", "mask", "orb"] as const;
const EYES = ["dots", "slits", "visor", "cyclops", "x", "arcs", "crosshair"] as const;
const MOUTHS = ["none", "line", "zigzag", "oh", "grit"] as const;
const AURAS = ["none", "ticks", "ring", "antenna"] as const;

export interface AvatarSpec {
  shape: (typeof SHAPES)[number];
  eyes: (typeof EYES)[number];
  mouth: (typeof MOUTHS)[number];
  aura: (typeof AURAS)[number];
  colors: [string, string, string];
}

/** Derive the full avatar spec from a seed (pure, stable). */
export function specFromSeed(seed: string): AvatarSpec {
  const r = seededRand(seed);
  return {
    shape: SHAPES[Math.floor(r() * SHAPES.length)],
    eyes: EYES[Math.floor(r() * EYES.length)],
    mouth: MOUTHS[Math.floor(r() * MOUTHS.length)],
    aura: AURAS[Math.floor(r() * AURAS.length)],
    colors: COLORWAYS[Math.floor(r() * COLORWAYS.length)],
  };
}

/* ── shape paths (48×48 viewBox) ────────────────────────── */

function ShapePath({ shape, fill }: { shape: AvatarSpec["shape"]; fill: string }) {
  switch (shape) {
    case "ghost": // the house ghost, scaled from the logo mark
      return (
        <path
          d="M24 6.8c-8 0-12.6 5.6-12.6 13v18.4l4.1-2.9 4.2 2.9 4.3-2.9 4.2 2.9 4.4-2.9V19.8c0-7.4-4.6-13-12.6-13Z"
          fill={fill}
        />
      );
    case "blob":
      return (
        <path
          d="M24 7.4c6.4-.5 12.4 3.2 14 9.2 1.7 6.3.5 13.6-4.2 17.8-4.4 3.9-11.5 4.4-16.7 1.5C11.7 32.8 8.4 27 9.3 20.9 10.2 14.7 17 8 24 7.4Z"
          fill={fill}
        />
      );
    case "diamond":
      return (
        <path
          d="M24 6.5 40.4 24 24 41.5 7.6 24Z"
          fill={fill}
          stroke={fill}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      );
    case "mask": // pointed theater mask
      return (
        <path
          d="M24 6.6c-7.6 0-13.2 4.2-13.2 11.6v7.2c0 7.6 5.8 13.8 13.2 16 7.4-2.2 13.2-8.4 13.2-16v-7.2c0-7.4-5.6-11.6-13.2-11.6Z"
          fill={fill}
        />
      );
    default: // orb
      return <circle cx="24" cy="24" r="16.4" fill={fill} />;
  }
}

/* ── eyes (feature color) ───────────────────────────────── */

function Eyes({ kind, c }: { kind: AvatarSpec["eyes"]; c: string }) {
  switch (kind) {
    case "slits":
      return (
        <g fill={c}>
          <rect x="14.8" y="19.6" width="6.4" height="2.6" rx="1.3" />
          <rect x="26.8" y="19.6" width="6.4" height="2.6" rx="1.3" />
        </g>
      );
    case "visor":
      return <rect x="13.6" y="18.4" width="20.8" height="5.2" rx="2.6" fill={c} />;
    case "cyclops":
      return (
        <g>
          <circle cx="24" cy="21.2" r="4.6" fill={c} />
          <circle cx="24" cy="21.2" r="1.8" fill={c} opacity="0.55" />
        </g>
      );
    case "x":
      return (
        <g stroke={c} strokeWidth="2.1" strokeLinecap="round">
          <path d="M15.6 18.6l4.8 4.8M20.4 18.6l-4.8 4.8M27.6 18.6l4.8 4.8M32.4 18.6l-4.8 4.8" />
        </g>
      );
    case "arcs": // serene closed eyes
      return (
        <g stroke={c} strokeWidth="2.1" strokeLinecap="round" fill="none">
          <path d="M15.4 21.8c1.6-2.6 5-2.6 6.4 0" />
          <path d="M26.2 21.8c1.6-2.6 5-2.6 6.4 0" />
        </g>
      );
    case "crosshair":
      return (
        <g stroke={c} strokeWidth="1.7" strokeLinecap="round" fill="none">
          <circle cx="18" cy="21" r="3.1" />
          <circle cx="30" cy="21" r="3.1" />
          <path d="M18 15.9v2.2M18 23.9v2.2M12.9 21h2.2M20.9 21h2.2M30 15.9v2.2M30 23.9v2.2M24.9 21h2.2M32.9 21h2.2" />
        </g>
      );
    default: // dots
      return (
        <g fill={c}>
          <circle cx="18.2" cy="21" r="2.5" />
          <circle cx="29.8" cy="21" r="2.5" />
        </g>
      );
  }
}

/* ── mouths ─────────────────────────────────────────────── */

function Mouth({ kind, c }: { kind: AvatarSpec["mouth"]; c: string }) {
  switch (kind) {
    case "line":
      return <rect x="19.6" y="29.6" width="8.8" height="2.1" rx="1.05" fill={c} />;
    case "zigzag":
      return (
        <path
          d="M18.4 30.8l2.6-2.4 2.6 2.4 2.6-2.4 2.6 2.4"
          fill="none"
          stroke={c}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "oh":
      return <circle cx="24" cy="30.4" r="2.7" fill={c} />;
    case "grit":
      return (
        <g fill={c}>
          <rect x="18.6" y="28.8" width="10.8" height="4.2" rx="1.4" />
          <rect x="20.2" y="28.8" width="1.1" height="4.2" fill={c === INK ? LIME : INK} opacity="0.9" />
          <rect x="23.4" y="28.8" width="1.1" height="4.2" fill={c === INK ? LIME : INK} opacity="0.9" />
          <rect x="26.6" y="28.8" width="1.1" height="4.2" fill={c === INK ? LIME : INK} opacity="0.9" />
        </g>
      );
    default:
      return null;
  }
}

/* ── auras (background flourish inside the frame) ───────── */

function Aura({ kind, c }: { kind: AvatarSpec["aura"]; c: string }) {
  switch (kind) {
    case "ticks":
      return (
        <g stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.55">
          <path d="M8.6 12.2l3-3M39.4 12.2l-3-3" />
        </g>
      );
    case "ring":
      return (
        <circle
          cx="24"
          cy="24"
          r="20.4"
          fill="none"
          stroke={c}
          strokeWidth="1.4"
          opacity="0.35"
          strokeDasharray="3 5"
        />
      );
    case "antenna":
      return (
        <g stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.8">
          <path d="M24 7.4V3.6" />
          <circle cx="24" cy="2.8" r="1.6" fill={c} stroke="none" />
        </g>
      );
    default:
      return null;
  }
}

/**
 * Render a stranger's mask. Deterministic per seed, SSR-stable.
 */
export const StrangerAvatar = memo(function StrangerAvatar({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const spec = specFromSeed(seed);
  const [body, bg, feature] = spec.colors;

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ borderRadius: "28%", display: "block" }}
    >
      <rect width="48" height="48" rx="13.4" fill={bg} />
      <Aura kind={spec.aura} c={feature} />
      <ShapePath shape={spec.shape} fill={body} />
      <Eyes kind={spec.eyes} c={feature} />
      <Mouth kind={spec.mouth} c={feature} />
    </svg>
  );
});
