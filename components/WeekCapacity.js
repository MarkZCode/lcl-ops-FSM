"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, parseISO, isToday,
} from "date-fns";
import { useStore } from "@/lib/store";
import { serviceShort, gbp } from "@/lib/format";
import StatusBadge from "./StatusBadge";

export default function WeekCapacity({ weekRef, onPickDay }) {
  const { jobs, clients, engineers } = useStore();

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
              {row.map(({ day, jobs: cellJobs }) => (
                <td
                  key={day.toISOString()}
                  className={`min-w-[90px] border-b border-l border-navy-100 p-1 align-top ${
                    isToday(day) ? "bg-brand-50/40" : "bg-white"
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
                            className="block rounded bg-white p-1 shadow-sm border border-navy-100 hover:border-brand-300 transition"
                          >
                            <p className="font-semibold text-navy-800 truncate">{client?.name || j.id}</p>
                            <p className="text-navy-400 truncate">{(j.services || []).map(serviceShort).join(", ")}</p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
