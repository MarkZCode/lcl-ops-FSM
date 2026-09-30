"use client";

// Dispatch "Engineer" view — pick one engineer, see their full upcoming
// schedule across days (not just today). Complements the per-day board.

import Link from "next/link";
import { useMemo, useState } from "react";
import { FiClock, FiMapPin, FiArrowRight } from "react-icons/fi";
import { format, isToday, isTomorrow, parseISO, startOfDay } from "date-fns";
import { useStore } from "@/lib/store";
import { fmtTime, gbp, jobTags } from "@/lib/format";
import { detectConflicts } from "@/lib/dispatch";
import StatusBadge from "./StatusBadge";
import { jobStage } from "@/lib/stages";

export default function EngineerScheduleView() {
  const { jobs, clients, engineers } = useStore();
  const [engId, setEngId] = useState(engineers[0]?.id || "");

  const upcoming = useMemo(() => {
    const now = startOfDay(new Date());
    return jobs
      .filter((j) => j.engineerId === engId && j.scheduledAt && new Date(j.scheduledAt) >= now)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }, [jobs, engId]);

  const conflicts = useMemo(() => detectConflicts(upcoming), [upcoming]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const j of upcoming) {
      const key = format(parseISO(j.scheduledAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    }
    return [...map.entries()];
  }, [upcoming]);

  const eng = engineers.find((e) => e.id === engId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="input max-w-xs"
          value={engId}
          onChange={(e) => setEngId(e.target.value)}
        >
          {engineers.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        {eng && (
          <span className="flex items-center gap-1.5 text-sm text-navy-500">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: eng.color }} />
            {upcoming.length} upcoming job{upcoming.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-sm text-navy-400">
          No upcoming jobs scheduled for this engineer.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dayKey, dayJobs]) => {
            const d = parseISO(dayKey);
            const label = isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEEE d MMM");
            return (
              <div key={dayKey}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</p>
                <div className="overflow-hidden rounded-xl border border-navy-100 dark:border-white/10">
                  {dayJobs.map((job, i) => {
                    const client = clients.find((c) => c.id === job.clientId);
                    const property = client?.properties.find((p) => p.id === job.propertyId);
                    const conflicted = conflicts.has(job.id);
                    return (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        className={`flex items-center gap-3 bg-white px-4 py-3 hover:bg-navy-50 dark:bg-navy-900 dark:hover:bg-white/5 ${i < dayJobs.length - 1 ? "border-b border-navy-100 dark:border-white/10" : ""} ${conflicted ? "bg-rose-50 dark:bg-rose-500/10" : ""}`}
                      >
                        <span className="flex items-center gap-1 text-xs font-semibold text-navy-600 dark:text-slate-300 w-14 shrink-0">
                          <FiClock className="h-3 w-3" />{fmtTime(job.scheduledAt)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{client?.name || job.id}</p>
                          <p className="flex items-center gap-2 truncate text-[11px] text-navy-400 dark:text-slate-500">
                            {jobTags(job).map((t) => t.label).join(", ")}
                            {property?.postcode && (
                              <span className="flex items-center gap-0.5"><FiMapPin className="h-3 w-3" />{property.postcode}</span>
                            )}
                            {conflicted && <span className="font-bold text-rose-600 dark:text-rose-400">Overlaps</span>}
                          </p>
                        </div>
                        {job.price > 0 && <span className="shrink-0 text-xs font-bold text-navy-700 dark:text-slate-200">{gbp(job.price)}</span>}
                        <StatusBadge status={jobStage(job)} size="sm" />
                        <FiArrowRight className="h-3 w-3 shrink-0 text-navy-300 dark:text-slate-600" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
