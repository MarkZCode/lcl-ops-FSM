"use client";

// "My day" — only your open tasks, in the order to do them: anything past
// its time first, then urgent, then by when it's due. One list, top to
// bottom, with the button that takes you to the job.
import Link from "next/link";
import { FiCheck, FiArrowRight } from "react-icons/fi";
import { taskDeepLink, priorityMeta } from "@/lib/tasks";

function timeLeft(task, now) {
  if (!task.dueAt) return task.dueDate ? { text: `Due ${new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, late: task.dueDate < new Date(now).toISOString().slice(0, 10) } : null;
  const ms = new Date(task.dueAt).getTime() - now;
  const m = Math.round(Math.abs(ms) / 60000);
  const span = m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d`;
  return ms < 0 ? { text: `${span} over`, late: true } : { text: `${span} left`, late: false };
}

export function orderMyDay(tasks, userId, now = Date.now()) {
  const rank = { urgent: 0, normal: 1, low: 2 };
  return tasks
    .filter((t) => t && t.status !== "done" && t.assigneeId === userId)
    .map((t) => ({ t, left: timeLeft(t, now) }))
    .sort((a, b) =>
      (b.left?.late ? 1 : 0) - (a.left?.late ? 1 : 0) ||
      (rank[a.t.priority] ?? 1) - (rank[b.t.priority] ?? 1) ||
      new Date(a.t.dueAt || a.t.dueDate || 8.64e15) - new Date(b.t.dueAt || b.t.dueDate || 8.64e15)
    );
}

export default function MyDay({ tasks, userId, onOpen, onDone }) {
  const list = orderMyDay(tasks, userId);
  if (!list.length) return <div className="card p-6 text-center text-sm text-navy-500">Nothing on your list. New work appears here as soon as it&apos;s given to you.</div>;
  const late = list.filter((x) => x.left?.late).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-600">{list.length} to do{late ? <> · <strong className="text-rose-600">{late} past {late === 1 ? "its" : "their"} time</strong></> : ""}. Work down the list.</p>
      <ol className="card divide-y divide-navy-100">
        {list.map(({ t, left }, i) => {
          const p = priorityMeta(t.priority);
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-100 text-xs font-bold text-navy-700">{i + 1}</span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t)}>
                <span className="block truncate text-sm font-semibold text-navy-900">{t.title}</span>
                <span className="block truncate text-xs text-navy-500">{t.createdBy?.id && t.createdBy.id !== "system" && t.createdBy.id !== userId ? `From ${t.createdBy.name || "a colleague"} · ` : ""}{t.linkedTo?.label || t.notes?.split("\n")[0] || ""}</span>
              </button>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.chip}`}>{p.label}</span>
              {left && <span className={`shrink-0 text-xs font-semibold ${left.late ? "text-rose-600" : "text-navy-500"}`}>{left.text}</span>}
              <span className="flex shrink-0 gap-1.5">
                <button type="button" className="btn-outline py-1 text-xs" onClick={() => onDone(t)} title="Mark done"><FiCheck /></button>
                <Link href={taskDeepLink(t)} className="btn-primary py-1 text-xs">Open <FiArrowRight /></Link>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
