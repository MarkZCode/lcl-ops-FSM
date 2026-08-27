"use client";

import { useState } from "react";

// The Landlord Compliance London icon mark (house + green check).
//
// Two files, one per theme, because the source artwork is a NAVY glyph on an
// OPAQUE WHITE background. That single asset can't work in both themes:
//   • on a white tile in light mode it disappears into the page;
//   • on a dark header the white background reads as a plain white square.
// So the white is keyed out to transparency in both, and the navy strokes are
// flipped to near-white for the dark variant. The green check stays green.
//
// `variant` defaults to "auto", which swaps on the theme with CSS so there's
// no wrong-logo flash before hydration. Pin it to "dark" or "light" for
// surfaces that DON'T follow the theme (the mobile drawer, the splash).
//
// If the image fails to load — a cold cache mid-deploy, a flaky connection,
// an offline PWA launch — the browser renders its broken-image glyph next to
// the alt text, which is exactly what you don't want as the first thing
// anyone sees. A vector fallback draws instead: no network, always crisp.
export default function LogoMark({ className = "", title = "LCL Ops", variant = "auto" }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <MarkSvg className={className} title={title} />;

  if (variant !== "auto") {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={variant === "dark" ? "/logo-mark-dark.png" : "/logo-mark-light.png"}
        alt={title}
        onError={() => setFailed(true)}
        className={`${className} object-contain`}
      />
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark-light.png"
        alt={title}
        onError={() => setFailed(true)}
        className={`${className} object-contain dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark-dark.png"
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
        className={`${className} hidden object-contain dark:block`}
      />
    </>
  );
}

// Vector stand-in: the house outline and the green check, in currentColor so
// it inherits whatever surface it lands on.
function MarkSvg({ className = "", title }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label={title} className={`${className} object-contain`}>
      <path
        d="M24 5.5 5.5 19.2V42a1.5 1.5 0 0 0 1.5 1.5h34a1.5 1.5 0 0 0 1.5-1.5V19.2L24 5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="m16.5 26.5 5.4 5.6L33 20.5"
        fill="none"
        stroke="#3fa34d"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
