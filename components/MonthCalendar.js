"use client";

import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
  format,
} from "date-fns";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MonthCalendar({ monthRef, onPickDay }) {
  const { jobs, clients, engineerById } = useStore();

  const monthStart = startOfMonth(monthRef);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthRef), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const jobsOn = (day) =>
    jobs
      .filter((j) => j.scheduledAt && isSameDay(parseISO(j.scheduledAt), day))
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  return (
    <div className="card overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-navy-100 bg-navy-50">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-navy-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayJobs = jobsOn(day);
          const muted = !isSameMonth(day, monthRef);
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onPickDay && onPickDay(day)}
              className={`min-h-[92px] border-b border-r border-navy-100 p-1.5 text-left align-top transition hover:bg-navy-50 ${
                muted ? "bg-navy-50/40" : "bg-white"
              }`}
            >
              <span
                className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                  today
                    ? "bg-brand-500 text-white"
                    : muted
                    ? "text-navy-300"
                    : "text-navy-700"
                }`}
              >
                {format(day, "d")}
              </span>
              <div className="mt-1 space-y-1">
                {dayJobs.slice(0, 3).map((job) => {
                  const client = clients.find((c) => c.id === job.clientId);
                  const eng = engineerById(job.engineerId);
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 truncate rounded bg-navy-50 px-1 py-0.5 text-[10px] text-navy-700 hover:bg-navy-100"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: eng.color }}
                      />
                      <span className="truncate">
                        {fmtTime(job.scheduledAt)} {client?.name}
                      </span>
                    </Link>
                  );
                })}
                {dayJobs.length > 3 && (
                  <span className="block px-1 text-[10px] font-semibold text-brand-600">
                    +{dayJobs.length - 3} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
