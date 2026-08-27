"use client";

// Branded full-screen loader, shown while the session resolves.
//
// The previous version leaned on hard edges and busy motion: a tiled grid
// background, a hard-cornered white tile, a ring spinning at one revolution a
// second, wide-tracked caps and a thick two-tone progress bar. Lots of
// separate things moving and shouting at once, which reads cheap.
//
// This is the same information with the volume down — one soft light source,
// one circular surface, and slow motion. Nothing spins; the mark settles and
// breathes, and the progress line drifts rather than races.
import LogoMark from "./LogoMark";

export default function SplashScreen({ label = "Loading your workspace" }) {
  return (
    <div className="splash-bg fixed inset-0 z-[100] grid place-items-center px-6">
      <div className="splash-in flex flex-col items-center">
        {/* One soft light behind a circular surface — no hard tile, no ring. */}
        <div className="relative grid h-24 w-24 place-items-center">
          <span aria-hidden="true" className="splash-halo absolute h-32 w-32 rounded-full" />
          <span className="splash-disc relative grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full">
            <LogoMark className="h-10 w-10" variant="light" />
          </span>
        </div>

        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-400/90">
          Landlord Compliance London
        </p>
        <h1 className="mt-1.5 text-[1.375rem] font-semibold tracking-tight text-white/95">
          LCL Ops
        </h1>

        {/* Hairline track with a sweep that fades at both ends. */}
        <div className="mt-7 h-px w-40 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="splash-sweep h-full w-1/3 rounded-full" />
        </div>
        <p className="mt-3.5 text-[11px] font-medium text-white/35">{label}…</p>
      </div>
    </div>
  );
}
