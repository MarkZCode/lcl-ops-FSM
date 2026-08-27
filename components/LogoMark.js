"use client";

// The LCL Ops mark.
//
// Previously two PNG exports (one per theme) of a navy house glyph on an
// opaque white background, keyed out to transparency. At small sizes that
// keying left visible fringing around the strokes and the interior window
// detail turned to mush — the "patchy" look. It also cost two network
// requests and needed a broken-image fallback.
//
// Now a single inline vector: one rounded-square tile, a simplified house
// silhouette, and the green check. No interior window grid (it was noise at
// the ~32px this actually renders at almost everywhere), no image loading,
// crisp at any size.
//
// `variant` is kept for the surfaces that DON'T follow the app theme — the
// login screen, the splash, the public share page, the offline page. Those
// pin it so the mark stays a self-contained badge (solid tile, always legible
// on whatever fixed background they use) instead of following light/dark.
// Default "auto" lets the tile drop out in dark mode so the mark reads as
// line art on the dark chrome rather than a floating black square.
export default function LogoMark({ className = "", title = "LCL Ops", variant = "auto" }) {
  const pinned = variant !== "auto";
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={title}
      className={`${className} object-contain`}
    >
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="10"
        className={pinned ? "fill-navy-900" : "fill-navy-900 dark:fill-white/[0.06]"}
      />
      {/* House — single continuous silhouette, no interior detail. */}
      <path
        d="M20 10.5 30.5 19v10.5a1 1 0 0 1-1 1h-19a1 1 0 0 1-1-1V19L20 10.5Z"
        fill="none"
        className={pinned ? "stroke-white" : "stroke-white dark:stroke-white/90"}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* The check — the one piece of colour, and the thing that carries the
          brand. Sized to sit optically centred in the house's lower half. */}
      <path
        d="m15.6 20.9 3.1 3.2 6.1-6.4"
        fill="none"
        stroke="#25D366"
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
