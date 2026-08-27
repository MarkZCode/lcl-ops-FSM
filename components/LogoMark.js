"use client";

// The LCL Ops mark — a minimal line-drawn house with a green check.
//
// Pure line art: no tile, no fill, no interior detail. Earlier versions
// carried their own solid rounded-square tile, which then sat INSIDE the
// white tile the top bar and sidebar already draw around it — a box inside a
// box, which is what made it read as heavy and patchy rather than a mark.
//
// The house inherits `currentColor` so it takes the colour of whatever it
// sits on and needs no second asset for dark mode. Only the check is a fixed
// colour — it is the one piece of brand in the mark.
//
// `variant` is kept for the surfaces that DON'T follow the app theme — the
// login screen and the splash. Both draw the mark on a white tile/disc of
// their own, so those pin the strokes dark rather than inheriting.
export default function LogoMark({ className = "", title = "LCL Ops", variant = "auto" }) {
  const stroke = variant === "auto" ? "currentColor" : "#12121a";
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      fill="none"
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} object-contain`}
    >
      {/* Roofline + walls in one open path — the base is left open so the
          shape reads as drawn rather than as a filled box. */}
      <path d="M4.5 14.2 16 5.5l11.5 8.7" />
      <path d="M7 16.4v9.1h18v-9.1" />
      {/* The check. Sits in the lower half of the house, optically centred. */}
      <path d="m11.6 20.4 3 3 6-6.2" stroke="#22c55e" strokeWidth="2.2" />
    </svg>
  );
}
