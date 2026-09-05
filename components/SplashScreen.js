"use client";

import { useState, useEffect } from "react";

const ROTATING_WORDS = ["simple.", "seamless.", "effortless.", "intelligent."];

export default function SplashScreen({ label }) {
  const [index, setIndex] = useState(0);
  const [animState, setAnimState] = useState("enter"); // "enter" | "exit"

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimState("exit");
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        setAnimState("enter");
      }, 250);
    }, 2200);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#09090b] px-6 select-none">
      <div className="flex flex-col items-center text-center">
        {/* Subtle top pill */}
        <span className="mb-6 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-400">
          LCL Console
        </span>

        {/* Apple-inspired typography statement */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 text-2xl font-normal tracking-tight text-zinc-200 sm:text-3xl">
          <span className="text-zinc-300">Managing compliance made</span>
          <span className="relative inline-flex overflow-hidden font-semibold text-emerald-400 min-w-[130px] justify-start text-left">
            <span
              className={`transition-all duration-300 ease-out transform ${
                animState === "exit"
                  ? "-translate-y-4 opacity-0 scale-95"
                  : "translate-y-0 opacity-100 scale-100"
              }`}
            >
              {ROTATING_WORDS[index]}
            </span>
          </span>
        </div>

        {/* Muted indicator label */}
        <p className="mt-8 text-xs font-normal text-zinc-500 tracking-wide">
          {label || "Connecting workspace"}
        </p>

        {/* Subtle hairline pulse bar */}
        <div className="mt-4 h-0.5 w-24 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full w-1/2 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-emerald-500/60" />
        </div>
      </div>
    </div>
  );
}
