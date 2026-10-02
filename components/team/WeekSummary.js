"use client";

// This week, per person: what they finished, what ran past its time, and
// what was moved on to someone else because it wasn't picked up.
import { useMemo } from "react";

export default function WeekSummary({ tasks, team }) {
  const rows = useMemo(() => {
    const d = new Date(); const day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day);
    const wk = d.getTime();
    const inWeek = (iso) => iso && new Date(iso).getTime() >= wk;
    return team.map((m) => {
      const mine = tasks.filter((t) => t.assigneeId === m.id);
      const done = mine.filter((t) => t.status === "done" && inWeek(t.completedAt) && t.completedBy?.id !== "system");
      const lateDone = done.filter((t) => t.dueAt && new Date(t.completedAt) > new Date(t.dueAt)).length;
      const lateOpen = mine.filter((t) => t.status !== "done" && t.dueAt && new Date(t.dueAt).getTime() < Date.now()).length;
      const movedOn = tasks.filter((t) => (t.escalatedFrom || []).some((e) => e.id === m.id && inWeek(e.at))).length;
      const times = done.filter((t) => t.createdAt).map((t) => (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000).filter((h) => h >= 0 && h < 24 * 14);
      return { m, done: done.length, late: lateDone + lateOpen, movedOn, open: mine.filter((t) => t.status !== "done").length, avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null };
    }).filter((r) => r.done || r.late || r.movedOn || r.open);
  }, [tasks, team]);
  if (!rows.length) return null;
  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-navy-800">This week, per person</summary>
      <div className="scroll-area mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-navy-400">
            <tr><th className="py-1.5 font-semibold">Person</th><th className="py-1.5 text-right font-semibold">Done</th><th className="py-1.5 text-right font-semibold">Late</th><th className="py-1.5 text-right font-semibold">Moved on</th><th className="py-1.5 text-right font-semibold">Still open</th><th className="py-1.5 text-right font-semibold">Avg time to finish</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map((r) => (
              <tr key={r.m.id}>
                <td className="py-1.5 font-medium text-navy-900">{r.m.name}</td>
                <td className="tnum py-1.5 text-right text-navy-700">{r.done}</td>
                <td className={`tnum py-1.5 text-right ${r.late ? "font-semibold text-rose-600" : "text-navy-700"}`}>{r.late}</td>
                <td className={`tnum py-1.5 text-right ${r.movedOn ? "font-semibold text-amber-700" : "text-navy-700"}`}>{r.movedOn}</td>
                <td className="tnum py-1.5 text-right text-navy-700">{r.open}</td>
                <td className="tnum py-1.5 text-right text-navy-700">{r.avg == null ? "—" : r.avg < 1 ? `${Math.round(r.avg * 60)}m` : `${r.avg.toFixed(1)}h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-navy-400">“Moved on” = a task taken off them because it wasn&apos;t picked up in time. Tasks closed automatically aren&apos;t counted as done.</p>
    </details>
  );
}
