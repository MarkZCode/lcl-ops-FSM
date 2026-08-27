"use client";

// Admin-only workload strip at the top of the Board tab. Shows one card per
// teammate (agents + admins) with their open/overdue/urgent/done counts.
// Clicking a card filters the Board to just their tasks so admin can see
// what's on that person's plate and bulk-reassign if needed. Hidden for
// non-admin users — they only see their own workload via "Mine" chip.

import { useMemo, useState } from "react";
import {
  FiUsers, FiUser, FiAlertTriangle, FiFlag, FiCheckSquare, FiChevronDown, FiChevronUp,
} from "react-icons/fi";
import { useAuth } from "@/lib/auth";

const MAX_LOAD = 40; // cards past this many open tasks show a full red bar

export default function WorkloadPanel({ tasks, team, onSelectAssignee, currentAssignee }) {
  const { isAdmin } = useAuth();
  const [expanded, setExpanded] = useState(true);

  const rows = useMemo(() => {
    // Build a row per teammate + one for "Everyone" tasks (unassigned).
    const now = new Date();
    const empty = () => ({ open: 0, overdue: 0, urgent: 0, doneWeek: 0 });
    const byId = new Map();
    const everyoneStats = empty();
    const weekAgo = now.getTime() - 7 * 86400_000;

    for (const t of tasks) {
      if (!t) continue;
      const bucket = t.assigneeId
        ? (byId.get(t.assigneeId) || byId.set(t.assigneeId, empty()).get(t.assigneeId))
        : everyoneStats;
      if (t.status === "done") {
        const at = t.completedAt ? new Date(t.completedAt).getTime() : 0;
        if (at >= weekAgo) bucket.doneWeek++;
      } else {
        bucket.open++;
        if (t.priority === "urgent") bucket.urgent++;
        if (t.dueDate && new Date(t.dueDate + "T23:59:59") < now) bucket.overdue++;
      }
    }

    const list = team.map((m) => ({
      id: m.id, name: m.name, role: m.role, ...(byId.get(m.id) || empty()),
    }));
    // Add any assignee id that isn't in the team roster (older tasks, deleted users)
    for (const [id, stats] of byId.entries()) {
      if (!list.some((r) => r.id === id)) {
        list.push({ id, name: "Unknown user", role: "agent", ...stats });
      }
    }
    // Always include an Everyone card so unassigned team tasks are visible.
    list.push({ id: "__unassigned", name: "Everyone (unassigned)", role: null, ...everyoneStats });

    // Sort: highest overdue → highest urgent → highest open.
    list.sort((a, b) => (b.overdue - a.overdue) || (b.urgent - a.urgent) || (b.open - a.open));
    return list;
  }, [tasks, team]);

  if (!isAdmin) return null;
  const totalOpen = rows.reduce((s, r) => s + r.open, 0);
  if (totalOpen === 0 && rows.every((r) => r.doneWeek === 0)) return null;

  return (
    <div className="rounded-2xl border border-navy-100 bg-white dark:border-white/10 dark:bg-navy-900">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-900 text-white dark:bg-white/15">
          <FiUsers className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-900 dark:text-white">Team workload</p>
          <p className="text-xs text-navy-500 dark:text-slate-400">
            {rows.length} {rows.length === 1 ? "person" : "people"} · click a card to filter the board to their tasks
          </p>
        </div>
        {expanded ? <FiChevronUp className="h-4 w-4 text-navy-400" /> : <FiChevronDown className="h-4 w-4 text-navy-400" />}
      </button>

      {expanded && (
        <div className="grid grid-cols-1 gap-3 border-t border-navy-100 p-3 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => {
            const isActive = currentAssignee === r.id || (r.id === "__unassigned" && currentAssignee === "unassigned");
            const loadPct = Math.min(100, Math.round((r.open / MAX_LOAD) * 100));
            const barTone = r.overdue > 0 ? "bg-rose-500" : r.open > MAX_LOAD * 0.6 ? "bg-amber-500" : "bg-brand-500";
            const filterKey = r.id === "__unassigned" ? "unassigned" : r.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelectAssignee(filterKey)}
                className={`group rounded-xl border p-3 text-left transition ${
                  isActive
                    ? "border-navy-800 bg-navy-50 shadow-sm dark:border-white/30 dark:bg-white/[0.04]"
                    : "border-navy-100 hover:border-brand-300 dark:border-white/10 dark:hover:border-brand-500/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    r.id === "__unassigned" ? "bg-navy-100 text-navy-500 dark:bg-white/10 dark:text-slate-400" : "bg-brand-500 text-white"
                  }`}>
                    {r.id === "__unassigned" ? <FiUsers className="h-3.5 w-3.5" /> : initials(r.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-900 dark:text-white">{r.name}</p>
                    {r.role && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-400 dark:text-slate-500">
                        {r.role}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right">
                    <p className="tnum text-2xl font-extrabold leading-none text-navy-900 dark:text-white">{r.open}</p>
                    <p className="text-[9px] font-medium uppercase text-navy-400 dark:text-slate-500">open</p>
                  </span>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-100 dark:bg-white/10">
                  <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${loadPct}%` }} />
                </div>

                <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold">
                  <span className={`inline-flex items-center gap-1 ${r.overdue > 0 ? "text-rose-600" : "text-navy-400 dark:text-slate-500"}`}>
                    <FiAlertTriangle className="h-3 w-3" />{r.overdue} overdue
                  </span>
                  <span className={`inline-flex items-center gap-1 ${r.urgent > 0 ? "text-amber-700 dark:text-amber-400" : "text-navy-400 dark:text-slate-500"}`}>
                    <FiFlag className="h-3 w-3" />{r.urgent} urgent
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
                    <FiCheckSquare className="h-3 w-3" />{r.doneWeek}/wk
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function initials(name) {
  return (name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
