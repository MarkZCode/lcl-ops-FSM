"use client";

import { useEffect, useState } from "react";

// The intro plays once through and lands on "simple." — the same line as the
// sign-in screen. After signing in, AuthGate holds this screen for the whole
// sequence (INTRO_MS) so it isn't a one-frame flash; on an ordinary reload it
// shows only as long as loading actually takes.
const INTRO = ["seamless.", "effortless.", "intelligent.", "simple."];
const STEP_MS = 620;
export const INTRO_MS = STEP_MS * INTRO.length + 500;

export default function SplashScreen({ label }) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const m = requestAnimationFrame(() => setMounted(true));
    let n = 0;
    const timer = setInterval(() => {
      // Stop on the last word; if loading takes longer than the intro, the
      // line just rests there rather than cycling forever.
      if (n >= INTRO.length - 1) { clearInterval(timer); return; }
      setVisible(false);
      setTimeout(() => {
        n += 1;
        setI(n);
        setVisible(true);
      }, 180);
    }, STEP_MS);
    return () => { cancelAnimationFrame(m); clearInterval(timer); };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex select-none items-center justify-center bg-[#021a3b] px-6">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.14] blur-3xl"
        style={{ background: "radial-gradient(circle, #4cc247, transparent 62%)" }}
      />
      <div className="relative flex w-full max-w-md flex-col items-center text-center">
        <span
          style={{ background: "#ffffff" }}
          className={`grid h-[76px] w-[76px] place-items-center rounded-[22px] shadow-[0_10px_40px_rgba(0,0,0,0.35)] transition-all duration-700 ease-out ${
            mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-90 opacity-0"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lcl-logo.png" alt="" className="h-14 w-14 object-contain" />
        </span>

        {/* Two lines on phones, one on wider screens — the rotating word
            used to sit in a fixed-width, left-aligned box, which on a narrow
            screen wrapped and hung off to one side. */}
        <h1
          className={`mt-8 text-[24px] font-medium leading-snug tracking-[-0.01em] text-white/90 transition-opacity delay-200 duration-700 sm:text-[30px] ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="block sm:inline">Managing compliance made </span>
          <span className="relative block h-[1.35em] overflow-hidden sm:inline-block sm:min-w-[7.2em] sm:text-left">
            <span
              className={`inline-block font-semibold text-[#4cc247] transition-all duration-200 ease-out ${
                visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
              }`}
            >
              {INTRO[i]}
            </span>
          </span>
        </h1>

        <p className="mt-8 text-[12px] tracking-wide text-white/45">{label || "Connecting workspace"}</p>
        <div className="mt-3 h-[3px] w-28 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full origin-left animate-[lcl-load_2.6s_ease-in-out_forwards] rounded-full bg-[#4cc247]/80" />
        </div>
      </div>
      <style>{`@keyframes lcl-load { from { transform: scaleX(0.05); } to { transform: scaleX(1); } }`}</style>
    </div>
  );
}
