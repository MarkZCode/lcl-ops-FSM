"use client";

// Task card used inside the Board columns and the compact list rows.
// Shows: title, priority dot, due-day chip, assignee, linked-entity chip.

import { FiUser, FiUsers, FiCalendar, FiLink, FiMessageCircle } from "react-icons/fi";
import { priorityMeta, daysUntilDue, urgencyClass, LINK_KINDS } from "@/lib/tasks";

export default function TaskCard({ task, onOpen }) {
  const p = priorityMeta(task.priority);
  const d = daysUntilDue(task);
  const overdue = d != null && d < 0 && task.status !== "done";
  const dueSoon = d != null && d >= 0 && d <= 2 && task.status !== "done";
  const dueLabel = d == null
    ? null
    : overdue ? `${Math.abs(d)}d overdue`
    : d === 0 ? "Today"
    : d === 1 ? "Tomorrow"
    : `${d}d left`;
  const updates = task.updates?.length || 0;

  return (
    <button
      onClick={() => onOpen(task)}
      className={`group relative w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-brand-400 hover:shadow-md dark:bg-navy-900 dark:border-white/10 ${urgencyClass(task) || "border-navy-100"}`}
    >
      {/* Priority accent stripe */}
      <span className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${p.dot}`} aria-hidden />

      <div className="pl-2 space-y-1.5">
        <p className={`text-sm font-semibold ${task.status === "done" ? "text-navy-400 line-through" : "text-navy-900 dark:text-white"}`}>
          {task.title}
        </p>

        {task.linkedTo && (
          <div className="inline-flex max-w-full items-center gap-1 rounded-md bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-600 dark:bg-white/10 dark:text-slate-300">
            <FiLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{LINK_KINDS[task.linkedTo.kind]?.label || task.linkedTo.kind}: {task.linkedTo.label}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-navy-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            {task.assigneeId ? <FiUser className="h-3 w-3" /> : <FiUsers className="h-3 w-3" />}
            {task.assigneeName || "Everyone"}
          </span>
          {dueLabel && (
            <span className={`inline-flex items-center gap-1 font-semibold ${overdue ? "text-rose-600" : dueSoon ? "text-amber-600" : ""}`}>
              <FiCalendar className="h-3 w-3" />
              {dueLabel}
            </span>
          )}
          {updates > 0 && (
            <span className="inline-flex items-center gap-1">
              <FiMessageCircle className="h-3 w-3" />
              {updates}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
