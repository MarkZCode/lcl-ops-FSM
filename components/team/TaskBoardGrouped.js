"use client";

// Grouped Kanban — collapses tasks that share a linked FSM record into one
// row so a big backlog is scannable. A prospect with 3 open tasks (chase,
// follow-up call, whatsapp check-in) becomes ONE card with a "3 tasks"
// chip; expanding the group shows each individual task inline.
//
// Unlinked tasks fall back to individual cards. This preserves the drag-
// to-status behaviour of the original board while cutting visible rows.

import { useState } from "react";
import { FiInbox, FiPlay, FiCheckCircle, FiChevronDown, FiChevronRight, FiLink } from "react-icons/fi";
import TaskCard from "./TaskCard";
import { STATUSES, sortTasks, LINK_KINDS, priorityMeta, urgencyClass } from "@/lib/tasks";

const COLUMN_ICONS = { open: FiInbox, in_progress: FiPlay, done: FiCheckCircle };

export default function TaskBoardGrouped({ tasks, onOpen, onStatusChange }) {
  const [dragOver, setDragOver] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const byStatus = { open: [], in_progress: [], done: [] };
  for (const t of tasks) (byStatus[t.status] || byStatus.open).push(t);

  // Build per-column groups: one row per {kind:id} link, plus a "solo"
  // row for every unlinked task.
  const buildRows = (list) => {
    const grouped = new Map();
    const solo = [];
    for (const t of list) {
      if (!t.linkedTo?.id) { solo.push(t); continue; }
      const key = `${t.linkedTo.kind}:${t.linkedTo.id}`;
      if (!grouped.has(key)) grouped.set(key, { key, kind: t.linkedTo.kind, id: t.linkedTo.id, label: t.linkedTo.label, tasks: [] });
      grouped.get(key).tasks.push(t);
    }
    for (const g of grouped.values()) g.tasks = sortTasks(g.tasks);
    // Sort groups by their most-urgent task, then solos.
    const groupRows = [...grouped.values()].sort((a, b) => {
      const priRank = { urgent: 0, normal: 1, low: 2 };
      const ap = priRank[a.tasks[0]?.priority] ?? 1;
      const bp = priRank[b.tasks[0]?.priority] ?? 1;
      return ap - bp;
    });
    return { groups: groupRows, solos: sortTasks(solo) };
  };

  const toggleGroup = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {STATUSES.map((s) => {
        const Icon = COLUMN_ICONS[s.key];
        const { groups, solos } = buildRows(byStatus[s.key]);
        const total = byStatus[s.key].length;
        const isOver = dragOver === s.key;
        return (
          <div
            key={s.key}
            onDragOver={(e) => { e.preventDefault(); setDragOver(s.key); }}
            onDragLeave={() => setDragOver((v) => (v === s.key ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) onStatusChange(id, s.key);
            }}
            className={`rounded-2xl border-2 ${isOver ? "border-brand-400 bg-brand-50/40 dark:bg-brand-500/5" : "border-transparent bg-navy-50/50 dark:bg-white/[0.02]"} p-3 transition-colors`}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${s.key === "done" ? "text-brand-600" : s.key === "in_progress" ? "text-amber-600" : "text-navy-500"}`} />
                <h3 className="text-xs font-bold uppercase tracking-wider text-navy-700 dark:text-slate-200">{s.label}</h3>
                <span className="text-[10px] text-navy-400">{groups.length + solos.length} rows · {total} tasks</span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-navy-600 shadow-sm dark:bg-white/10 dark:text-slate-300">
                {total}
              </span>
            </div>

            {total === 0 ? (
              <div className="rounded-xl border border-dashed border-navy-200 py-6 text-center text-xs text-navy-400 dark:border-white/10">
                {s.key === "open" ? "No open tasks" : s.key === "in_progress" ? "None in progress" : "Nothing done yet"}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Grouped rows */}
                {groups.map((g) => (
                  <GroupCard
                    key={g.key}
                    group={g}
                    expanded={expanded.has(g.key)}
                    onToggle={() => toggleGroup(g.key)}
                    onOpen={onOpen}
                  />
                ))}
                {/* Unlinked / solo tasks — same drag behaviour as before */}
                {solos.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; }}
                  >
                    <TaskCard task={task} onOpen={onOpen} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// A "group" is 2+ tasks linked to the same FSM record. A single-task
// "group" renders as a normal TaskCard (no need for the extra chrome).
function GroupCard({ group, expanded, onToggle, onOpen }) {
  if (group.tasks.length === 1) {
    const t = group.tasks[0];
    return (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
      >
        <TaskCard task={t} onOpen={onOpen} />
      </div>
    );
  }
  const worst = group.tasks[0];
  const p = priorityMeta(worst.priority);
  const linkLabel = LINK_KINDS[group.kind]?.label || group.kind;
  const urgent = group.tasks.some((t) => t.priority === "urgent");
  return (
    <div className={`rounded-xl border bg-white shadow-sm dark:bg-navy-900 dark:border-white/10 ${urgencyClass(worst) || "border-navy-100"}`}>
      <button
        onClick={onToggle}
        className="relative flex w-full items-start gap-2 p-3 text-left"
      >
        <span className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${p.dot}`} aria-hidden />
        <span className="mt-0.5 shrink-0 text-navy-500 dark:text-slate-400">
          {expanded ? <FiChevronDown className="h-4 w-4" /> : <FiChevronRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1 pl-1">
          <div className="flex items-center gap-1.5">
            <FiLink className="h-3 w-3 shrink-0 text-navy-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-navy-500 dark:text-slate-400">{linkLabel}</span>
            {urgent && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">URGENT</span>}
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-navy-900 dark:text-white">{group.label}</p>
          <p className="text-[11px] text-navy-500 dark:text-slate-400">{group.tasks.length} tasks — {worst.title}</p>
        </div>
        <span className="ml-2 shrink-0 rounded-full bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-white/15">
          {group.tasks.length}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-navy-100 dark:border-white/5">
          <div className="space-y-1.5 bg-navy-50/50 p-2 dark:bg-white/[0.02]">
            {group.tasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("text/plain", task.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <TaskCard task={task} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
