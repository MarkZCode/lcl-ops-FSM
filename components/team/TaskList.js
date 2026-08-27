"use client";

// Compact table view of every visible task — useful when you want to scan
// dozens at a glance. Clicking a row opens the same detail slide-over as
// the kanban card. Sorted urgency-first (via lib/tasks/sortTasks).

import Link from "next/link";
import { FiUser, FiUsers, FiLink, FiCheck } from "react-icons/fi";
import {
  priorityMeta, statusMeta, daysUntilDue, urgencyClass, sortTasks, LINK_KINDS,
} from "@/lib/tasks";

export default function TaskList({ tasks, onOpen, onToggleDone, selected, onToggleSelect, onToggleSelectAll }) {
  const sorted = sortTasks(tasks);
  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-navy-200 py-16 text-center dark:border-white/10">
        <p className="text-sm font-semibold text-navy-500">No tasks match these filters.</p>
      </div>
    );
  }
  const allChecked = selected && sorted.length > 0 && sorted.every((t) => selected.has(t.id));
  const someChecked = selected && sorted.some((t) => selected.has(t.id));

  return (
    <>
    {/* Phone list. The 8-column table below needs a 520px sideways drag to
        read one task; a task list you have to scroll horizontally is a task
        list you stop using. Tick, title, and when it's due lead here. */}
    <div className="m-group lg:hidden">
      {sorted.map((t) => {
        const p = priorityMeta(t.priority);
        const d = daysUntilDue(t);
        const overdue = d != null && d < 0 && t.status !== "done";
        const dueSoon = d != null && d >= 0 && d <= 2 && t.status !== "done";
        const dueLabel = d == null ? "—"
          : overdue ? `${Math.abs(d)}d overdue`
          : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`;
        return (
          <div key={t.id} className={`m-row ${selected?.has(t.id) ? "bg-brand-50/60 dark:bg-brand-500/5" : ""}`}>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleDone(t); }}
              aria-label="Toggle done"
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${
                t.status === "done" ? "border-brand-500 bg-brand-500 text-white" : "border-navy-300"
              }`}
            >
              {t.status === "done" && <FiCheck className="h-3 w-3" />}
            </button>
            <span className="m-row-main" onClick={() => onOpen(t)}>
              <span className={`m-row-label ${t.status === "done" ? "text-navy-400 line-through" : ""}`}>
                {t.title}
              </span>
              <span className="m-row-sub">
                {[t.assigneeName || "Everyone", t.linkedTo?.label, p.label].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className={`shrink-0 text-xs font-semibold ${
              overdue ? "text-rose-600" : dueSoon ? "text-amber-600" : "text-navy-500"
            }`}>
              {dueLabel}
            </span>
          </div>
        );
      })}
    </div>

    <div className="scroll-area hidden overflow-x-auto rounded-2xl border border-navy-100 lg:block dark:border-white/10">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-navy-100 bg-navy-50/60 text-left text-[11px] font-bold uppercase tracking-wider text-navy-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
            {onToggleSelect && (
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                  onChange={() => onToggleSelectAll(sorted.map((t) => t.id), !allChecked)}
                  className="h-4 w-4 cursor-pointer rounded border-navy-300"
                  aria-label="Select all visible"
                />
              </th>
            )}
            <th className="px-3 py-2 w-10"></th>
            <th className="px-3 py-2">Task</th>
            <th className="px-3 py-2">Assignee</th>
            <th className="px-3 py-2">Linked to</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const p = priorityMeta(t.priority);
            const s = statusMeta(t.status);
            const d = daysUntilDue(t);
            const overdue = d != null && d < 0 && t.status !== "done";
            const dueSoon = d != null && d >= 0 && d <= 2 && t.status !== "done";
            const dueLabel = d == null
              ? "—"
              : overdue ? `${Math.abs(d)}d overdue`
              : d === 0 ? "Today"
              : d === 1 ? "Tomorrow"
              : `${d}d`;
            return (
              <tr
                key={t.id}
                className={`border-t border-navy-100 hover:bg-navy-50/60 dark:border-white/5 dark:hover:bg-white/[0.03] cursor-pointer ${urgencyClass(t)} ${selected?.has(t.id) ? "bg-brand-50/60 dark:bg-brand-500/5" : ""}`}
                onClick={() => onOpen(t)}
              >
                {onToggleSelect && (
                  <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); onToggleSelect(t.id); }}>
                    <input
                      type="checkbox"
                      checked={selected?.has(t.id) || false}
                      onChange={() => {}}
                      className="h-4 w-4 cursor-pointer rounded border-navy-300"
                    />
                  </td>
                )}
                <td className="px-3 py-2.5" onClick={(e) => { e.stopPropagation(); onToggleDone(t); }}>
                  <button
                    className={`grid h-5 w-5 place-items-center rounded-md border-2 transition ${
                      t.status === "done" ? "border-brand-500 bg-brand-500 text-white" : "border-navy-300 hover:border-brand-500"
                    }`}
                    aria-label="Toggle done"
                  >
                    {t.status === "done" && <FiCheck className="h-3 w-3" />}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <p className={`font-semibold ${t.status === "done" ? "text-navy-400 line-through" : "text-navy-900 dark:text-white"}`}>
                    {t.title}
                  </p>
                  {t.notes && <p className="mt-0.5 line-clamp-1 text-xs text-navy-500 dark:text-slate-500">{t.notes}</p>}
                </td>
                <td className="px-3 py-2.5 text-navy-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1 text-xs">
                    {t.assigneeId ? <FiUser className="h-3 w-3" /> : <FiUsers className="h-3 w-3" />}
                    {t.assigneeName || "Everyone"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-navy-600 dark:text-slate-300">
                  {t.linkedTo ? (
                    <Link
                      href={LINK_KINDS[t.linkedTo.kind]?.path(t.linkedTo.id) || "#"}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-md bg-navy-100 px-1.5 py-0.5 text-xs font-semibold text-navy-700 hover:bg-navy-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
                    >
                      <FiLink className="h-2.5 w-2.5" />
                      <span className="max-w-[16ch] truncate">{t.linkedTo.label}</span>
                    </Link>
                  ) : (
                    <span className="text-navy-300 text-xs">—</span>
                  )}
                </td>
                <td className={`tnum px-3 py-2.5 text-xs font-semibold ${overdue ? "text-rose-600" : dueSoon ? "text-amber-600" : "text-navy-500"}`}>
                  {dueLabel}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                    {p.label}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
