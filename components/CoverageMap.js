"use client";

// CoverageMap — service-line capacity strip.
// Shows how many active engineers cover each service code. Used on the
// Dashboard and on /engineers (handoff doc §4.1 + §4.5).
//
// The capacity ceiling for the business is on the SUPPLY side — every "0" here
// is a service line we can't actually sell. Permanent visibility is the point.

import { useMemo } from "react";
import { SERVICE_CATALOG } from "@/lib/constants";
import { useStore } from "@/lib/store";

export default function CoverageMap({ compact = false }) {
  const { engineers } = useStore();

  // count active engineers per service code (engineer.services[] is the source of truth)
  const counts = useMemo(() => {
    const c = {};
    for (const e of engineers || []) {
      if (e.archived) continue;
      for (const s of e.services || []) c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [engineers]);

  const tile = (code, n) => {
    const ok = n > 0;
    return (
      <div
        key={code}
        title={`${n} active engineer${n === 1 ? "" : "s"} covering ${code}`}
        className={`rounded-lg border px-2 py-1.5 text-center ${
          ok
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
            : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        }`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider">{code}</div>
        <div className={`mt-0.5 text-sm font-bold ${ok ? "" : "text-rose-700 dark:text-rose-300"}`}>
          {n}{ok ? " ✓" : " ⚠"}
        </div>
      </div>
    );
  };

  return (
    <section className={`rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900 ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-navy-600 dark:text-slate-300">Coverage map</h3>
        <span className="text-[11px] text-navy-500 dark:text-slate-400">Active engineers per service</span>
      </div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {SERVICE_CATALOG.map((s) => tile(s.code, counts[s.code] || 0))}
      </div>
    </section>
  );
}
