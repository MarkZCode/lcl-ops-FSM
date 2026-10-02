"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, parseISO, isToday,
} from "date-fns";
import { useStore } from "@/lib/store";
import { serviceShort, gbp } from "@/lib/format";
import { isSplit } from "@/lib/visits";
import { engineerUnavailable } from "@/lib/booking";
import { ukDateTimeToUtcIso } from "@/lib/ukTime";
import { toast } from "@/lib/toast";
import StatusBadge from "./StatusBadge";

export default function WeekCapacity({ weekRef, onPickDay }) {
  const { jobs, clients, engineers, updateJob, logActivity, rules } = useStore();
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState("");
  const cap = Number(rules?.engineerDailyJobs) || 5;

  // Drop a job on another day (or another engineer's row): the date moves,
  // the arrival window stays, and the engineer has to confirm the new slot.
  const move = (jobId, eng, day) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (isSplit(job)) { toast.error("This job is split into visits — move the visit from the job page."); return; }
    if (["completed", "invoiced", "paid", "cancelled"].includes(job.status)) { toast.error("That job is finished — it can't be moved."); return; }
    const sameDay = isSameDay(parseISO(job.scheduledAt), day);
    if (sameDay && job.engineerId === eng.id) return;
    const patch = { engineerId: eng.id, engineerConfirmed: false, confirmedAt: null, accessConfirmedAt: null };
    if (!sameDay) patch.scheduledAt = ukDateTimeToUtcIso(format(day, "yyyy-MM-dd"), job.windowFrom || "08:00");
    updateJob(job.id, patch);
    logActivity(job.id, { type: "status", title: `Moved on the week board to ${format(day, "EEE d MMM")}${job.engineerId !== eng.id ? ` · ${eng.name}` : ""} — engineer to confirm` });
    toast(`${job.id} moved to ${format(day, "EEE d MMM")}. The engineer needs to confirm the new slot.`);
  };

  const days = useMemo(() => {
    const start = startOfWeek(weekRef, { weekStartsOn: 1 });
    const end = endOfWeek(weekRef, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [weekRef]);

  const engRows = useMemo(() => {
    return engineers.map((eng) => {
      const row = days.map((day) => {
        const dayJobs = jobs.filter((j) => {
          if (!j.scheduledAt) return false;
          if (j.engineerId !== eng.id) return false;
          return isSameDay(parseISO(j.scheduledAt), day);
        });
        return { day, jobs: dayJobs };
      });
      return { eng, row };
    });
  }, [engineers, jobs, days]);

  return (
    <div className="scroll-area overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-32 border-b border-navy-200 bg-navy-50 py-2 pl-3 text-left text-[11px] font-semibold uppercase tracking-wide text-navy-500">
              Engineer
            </th>
            {days.map((d) => (
              <th
                key={d.toISOString()}
                className={`border-b border-l border-navy-200 py-2 text-center text-[11px] font-semibold tracking-wide ${
                  isToday(d) ? "bg-brand-50 text-brand-700" : "bg-navy-50 text-navy-500"
                }`}
              >
                <button onClick={() => onPickDay?.(d)} className="hover:underline">
                  <span className="block uppercase">{format(d, "EEE")}</span>
                  <span className="block text-[13px] font-bold">{format(d, "d")}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {engRows.map(({ eng, row }) => (
            <tr key={eng.id} className="group">
              <td className="border-b border-navy-100 bg-white py-2 pl-3 align-top">
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: eng.color }}
                  >
                    {eng.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <span className="font-medium text-navy-800">{eng.name.split(" ")[0]}</span>
                </div>
              </td>
              {row.map(({ day, jobs: cellJobs }) => {
                const key = `${eng.id}|${day.toISOString()}`;
                const off = engineerUnavailable(eng, day);
                return (
                <td
                  key={day.toISOString()}
                  onDragOver={(e) => { e.preventDefault(); setOver(key); }}
                  onDragLeave={() => setOver((o) => (o === key ? "" : o))}
                  onDrop={() => { if (dragId) move(dragId, eng, day); setDragId(null); setOver(""); }}
                  title={off ? `Off${off.note ? ` — ${off.note}` : ""}` : cellJobs.length > cap ? `More than ${cap} jobs` : undefined}
                  className={`min-w-[90px] border-b border-l border-navy-100 p-1 align-top ${
                    over === key ? "bg-brand-100/70" : off ? "bg-navy-100/80" : cellJobs.length > cap ? "bg-amber-50" : isToday(day) ? "bg-brand-50/40" : "bg-white"
                  }`}
                >
                  {cellJobs.length === 0 ? (
                    <div className="h-8 rounded bg-navy-50/60" />
                  ) : (
                    <div className="space-y-1">
                      {cellJobs.map((j) => {
                        const client = clients.find((c) => c.id === j.clientId);
                        return (
                          <Link
                            key={j.id}
                            href={`/jobs/${j.id}`}
                            draggable
                            onDragStart={() => setDragId(j.id)}
                            onDragEnd={() => setDragId(null)}
                            style={{ borderLeftWidth: 3, borderLeftColor: j.engineerConfirmed ? "#3FA34D" : "#f59e0b" }}
                            className={`block rounded bg-white p-1 shadow-sm border border-navy-100 hover:border-brand-300 transition ${dragId === j.id ? "opacity-50" : ""}`}
                          >
                            <p className="font-semibold text-navy-800 truncate">{client?.name || j.id}</p>
                            <p className="text-navy-400 truncate">{(j.services || []).map(serviceShort).join(", ")}</p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
