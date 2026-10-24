/**
 * Veil's ghost mascot. Body color follows `className` (currentColor),
 * eyes are parametrized so the mark works on light and dark surfaces.
 */
export function GhostMark({
  className,
  eyeClass = "fill-ink",
}: {
  className?: string;
  eyeClass?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.4c-4.8 0-7.6 3.4-7.6 7.9v11l2.5-1.75L9.5 21.3l2.5-1.75 2.5 1.75 2.6-1.75 2.5 1.75v-11c0-4.5-2.8-7.9-7.6-7.9Z"
        fill="currentColor"
      />
      <circle cx="9.4" cy="10.6" r="1.35" className={eyeClass} />
      <circle cx="14.6" cy="10.6" r="1.35" className={eyeClass} />
    </svg>
  );
}
