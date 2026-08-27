"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  addYears,
  format,
} from "date-fns";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

const WD = ["M", "T", "W", "T", "F", "S", "S"];

// Compact month picker for the dispatch left rail. `selected` is the active day;
// `onSelect(day)` fires when a day is clicked. `counts` maps yyyy-MM-dd -> job count
// so days with work show a dot.
export default function MiniCalendar({ selected, onSelect, counts = {} }) {
  const [view, setView] = useState(startOfMonth(selected || new Date()));

  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(view), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="card p-2.5">
      {/* Month + year nav in one compact row */}
      <div className="mb-1.5 flex items-center justify-between">
        <button
          onClick={() => setView((v) => addMonths(v, -1))}
          className="grid h-6 w-6 place-items-center rounded text-navy-500 hover:bg-navy-100"
          aria-label="Previous month"
        >
          <FiChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-navy-900">
            {format(view, "MMM yyyy")}
          </span>
          <button
            onClick={() => setView((v) => addYears(v, -1))}
            className="px-1 text-[10px] text-navy-400 hover:text-navy-700"
            aria-label="Previous year"
            title="Previous year"
          >
            «
          </button>
          <button
            onClick={() => setView((v) => addYears(v, 1))}
            className="px-1 text-[10px] text-navy-400 hover:text-navy-700"
            aria-label="Next year"
            title="Next year"
          >
            »
          </button>
        </div>
        <button
          onClick={() => setView((v) => addMonths(v, 1))}
          className="grid h-6 w-6 place-items-center rounded text-navy-500 hover:bg-navy-100"
          aria-label="Next month"
        >
          <FiChevronRight size={14} />
        </button>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7">
        {WD.map((d, i) => (
          <div
            key={i}
            className="text-center text-[9px] font-bold text-navy-300"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const muted = !isSameMonth(day, view);
          const isSel = selected && isSameDay(day, selected);
          const today = isToday(day);
          const key = format(day, "yyyy-MM-dd");
          const hasJobs = counts[key] > 0;
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelect && onSelect(day)}
              className={`relative mx-auto grid h-7 w-7 place-items-center rounded-md text-[11px] transition ${
                isSel
                  ? "bg-brand-500 font-bold text-white"
                  : today
                  ? "bg-brand-50 font-bold text-brand-700"
                  : muted
                  ? "text-navy-300 hover:bg-navy-50"
                  : "text-navy-700 hover:bg-navy-100"
              }`}
            >
              {format(day, "d")}
              {hasJobs && !isSel && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Today shortcut */}
      <button
        onClick={() => {
          const t = new Date();
          setView(startOfMonth(t));
          onSelect && onSelect(t);
        }}
        className="mt-1.5 w-full rounded-md border border-navy-200 py-1 text-[11px] font-semibold text-navy-600 hover:bg-navy-50"
      >
        Today
      </button>
    </div>
  );
}
