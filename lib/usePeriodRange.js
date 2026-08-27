"use client";

// The Day / Week / Month / Year / Range control, as state.
//
// Lifted out of app/reports/page.js so any list can have the same period
// picker with the same behaviour — including the two parts that are easy to
// get wrong and were already solved there:
//
//   • it REMEMBERS what you picked, per page, so switching away and back
//     doesn't silently reset you to "this month";
//   • a custom range whose end is today keeps MOVING with today. Without
//     that, a saved range freezes: reopen it tomorrow and the "To" date is
//     still yesterday. A tab left open overnight is handled too, which a
//     load-time-only fix would miss.

import { useEffect, useMemo, useRef, useState } from "react";
import { getPeriodRange, shiftRef, ALL_TIME_RANGE } from "./stats";

export const PERIODS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Range" },
];

// Same list plus an explicit "everything" option, for pages where hiding
// records behind a date filter by default would be the wrong starting point.
export const PERIODS_WITH_ALL = [{ key: "all", label: "All" }, ...PERIODS];

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function usePeriodRange(storageKey, { defaultPeriod = "month", extra, onRestore } = {}) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [ref, setRef] = useState(() => new Date());
  const [customRange, setCustomRange] = useState(() => ({ start: todayISO(), end: todayISO() }));
  // Whether the "To" date tracks today or was deliberately pinned to a past
  // date. Absent from older saves means "follow", matching the behaviour
  // those saves were written under.
  const [endFollowsToday, setEndFollowsToday] = useState(true);

  const loaded = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { saved = null; }
    if (saved) {
      if (saved.period) setPeriod(saved.period);
      if (saved.ref) setRef(new Date(saved.ref));
      const follow = saved.endFollowsToday !== false;
      setEndFollowsToday(follow);
      if (saved.customRange) {
        // Following today when saved → don't restore the by-now stale frozen
        // "To"; resolve it to today's actual date.
        setCustomRange(follow ? { ...saved.customRange, end: todayISO() } : saved.customRange);
      }
      onRestoreRef.current?.(saved);
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const extraJson = JSON.stringify(extra ?? null);
  useEffect(() => {
    if (!loaded.current) return; // never overwrite a save with the defaults
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        period, ref: ref.toISOString(), customRange, endFollowsToday,
        ...(extra || {}),
      }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, period, ref, customRange, endFollowsToday, extraJson]);

  // Roll the end date forward as the day turns, including on a tab that's
  // been sitting open — a load-time-only check would keep showing yesterday.
  useEffect(() => {
    if (!endFollowsToday) return;
    const tick = () => {
      const t = todayISO();
      setCustomRange((r) => (r.end === t ? r : { ...r, end: t }));
    };
    tick();
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endFollowsToday]);

  const customDates = useMemo(
    () => ({ start: new Date(`${customRange.start}T00:00:00`), end: new Date(`${customRange.end}T23:59:59`) }),
    [customRange]
  );

  const range = useMemo(() => {
    if (period === "all") return ALL_TIME_RANGE;
    return getPeriodRange(period, ref, period === "custom" ? customDates : undefined);
  }, [period, ref, customDates]);

  // Is the viewed window the CURRENT one? Drives the disabled "next" arrow
  // and the "Today" reset button.
  const isCurrent = useMemo(() => {
    if (period === "custom" || period === "all") return true;
    return getPeriodRange(period, new Date()).label === range.label;
  }, [period, range]);

  return {
    period, setPeriod,
    ref, setRef,
    customRange, setCustomRange,
    endFollowsToday, setEndFollowsToday,
    range, isCurrent,
    shift: (dir) => setRef((r) => shiftRef(period, r, dir)),
    reset: () => setRef(new Date()),
  };
}
