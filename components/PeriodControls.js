"use client";

// The Day / Week / Month / Year / Range picker, shared by Reports and Jobs so
// the two behave identically rather than drifting apart as separate copies.
// State lives in lib/usePeriodRange.js; this is only its face.

import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { PERIODS, PERIODS_WITH_ALL, todayISO } from "@/lib/usePeriodRange";

export default function PeriodControls({ ctl, withAll = false, className = "", children }) {
  const {
    period, setPeriod, range, isCurrent, shift, reset,
    customRange, setCustomRange, endFollowsToday, setEndFollowsToday,
  } = ctl;
  const options = withAll ? PERIODS_WITH_ALL : PERIODS;

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${className}`}>
      {/* Scrolls sideways on a phone rather than WRAPPING. Six options in a
          bordered box with flex-wrap dropped "Range" onto its own line inside
          the border, which read as a broken control. `shrink-0` on the buttons
          stops them being squashed to fit. */}
      <div className="scroll-area flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-navy-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]">
        {options.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              period === p.key ? "bg-navy-800 text-white" : "text-navy-500 hover:bg-navy-50 dark:hover:bg-white/[0.06]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        {period === "all" ? (
          <span className="text-sm font-semibold text-navy-500">Everything, all dates</span>
        ) : period === "custom" ? (
          <div className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
            <label className="text-xs font-semibold text-navy-500">From</label>
            <input
              type="date"
              className="bg-transparent text-sm font-semibold text-navy-800 outline-none dark:text-slate-100"
              value={customRange.start}
              max={customRange.end}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
            />
            <label className="text-xs font-semibold text-navy-500">To</label>
            <input
              type="date"
              className="bg-transparent text-sm font-semibold text-navy-800 outline-none dark:text-slate-100"
              value={customRange.end}
              min={customRange.start}
              max={todayISO()}
              onChange={(e) => {
                const val = e.target.value;
                // Picking today's actual date keeps the range auto-advancing
                // tomorrow; picking anything else pins it there.
                setEndFollowsToday(val === todayISO());
                setCustomRange((r) => ({ ...r, end: val }));
              }}
            />
            {endFollowsToday && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wide text-brand-600"
                title="Moves forward with today automatically"
              >
                Today
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center rounded-lg border border-navy-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
              <button onClick={() => shift(-1)} aria-label="Previous period" className="grid h-9 w-9 place-items-center text-navy-600 hover:bg-navy-50 dark:hover:bg-white/[0.06]">
                <FiChevronLeft />
              </button>
              <span className="min-w-[150px] border-x border-navy-200 px-3 text-center text-sm font-semibold text-navy-800 dark:border-white/10 dark:text-slate-100">
                {range.label}
              </span>
              <button onClick={() => shift(1)} disabled={isCurrent} aria-label="Next period" className="grid h-9 w-9 place-items-center text-navy-600 hover:bg-navy-50 disabled:opacity-30 dark:hover:bg-white/[0.06]">
                <FiChevronRight />
              </button>
            </div>
            {!isCurrent && <button onClick={reset} className="btn-outline">Today</button>}
          </>
        )}
        {children}
      </div>
    </div>
  );
}
