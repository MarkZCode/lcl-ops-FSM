"use client";

// Kanban board — three columns (Open · In progress · Done). Uses native
// HTML5 drag-and-drop for stage moves; each column's task order stays
// urgency-sorted so re-ordering within a column is meaningful only across
// columns (drop target = new status).

import { useState } from "react";
import { FiInbox, FiPlay, FiCheckCircle } from "react-icons/fi";
import TaskCard from "./TaskCard";
import { STATUSES, sortTasks } from "@/lib/tasks";

const COLUMN_ICONS = { open: FiInbox, in_progress: FiPlay, done: FiCheckCircle };

export default function TaskBoard({ tasks, onOpen, onStatusChange }) {
  const [dragOver, setDragOver] = useState(null);

  const byStatus = { open: [], in_progress: [], done: [] };
  for (const t of tasks) (byStatus[t.status] || byStatus.open).push(t);
  for (const k of Object.keys(byStatus)) byStatus[k] = sortTasks(byStatus[k]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {STATUSES.map((s) => {
        const Icon = COLUMN_ICONS[s.key];
        const items = byStatus[s.key];
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
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-navy-600 shadow-sm dark:bg-white/10 dark:text-slate-300">
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-navy-200 py-6 text-center text-xs text-navy-400 dark:border-white/10">
                {s.key === "open" ? "No open tasks" : s.key === "in_progress" ? "None in progress" : "Nothing done yet"}
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((task) => (
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
