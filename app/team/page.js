"use client";

// Unified Team workspace — replaces the old separate /team (agent scorecards
// only) and /tasks (basic list) with a single tabbed page:
//
//   • Board    — kanban with drag-to-status, priority accents, suggested
//                tasks strip pulling FSM signals for one-click promotion
//   • List     — dense table view of every visible task
//   • Activity — the preserved per-agent call/email scorecards
//
// Tasks link back to their FSM entity (prospect / job / client / engineer)
// so the whole thing feels like an extension of the FSM rather than a
// side app.
//
// Deep-linkable via ?tab=board|list|activity and ?task=<id> — the daily
// digest push and instant-assign push both use those params.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FiActivity, FiCheckSquare, FiPlus, FiList, FiGrid, FiAlertTriangle,
  FiSearch, FiUser, FiUsers, FiFlag,
} from "react-icons/fi";
import PageHeader from "@/components/PageHeader";
import RequirePermission from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { PRIORITIES, STATUSES, filterTasks } from "@/lib/tasks";
import TaskBoardGrouped from "@/components/team/TaskBoardGrouped";
import MyDay from "@/components/team/MyDay";
import WeekSummary from "@/components/team/WeekSummary";
import TaskBoard from "@/components/team/TaskBoardGrouped";
import TaskList from "@/components/team/TaskList";
import NewTaskModal from "@/components/team/NewTaskModal";
import TeamOverview from "@/components/team/TeamOverview";
import TaskDetailPanel from "@/components/team/TaskDetailPanel";
import SuggestedTasks from "@/components/team/SuggestedTasks";
import BulkActionsBar from "@/components/team/BulkActionsBar";
import WorkloadPanel from "@/components/team/WorkloadPanel";
import AgentActivity from "@/components/team/AgentActivity";
import { useConfirm } from "@/components/ConfirmProvider";

export default function TeamPage() {
  return (
    <RequirePermission perm="team">
      <Suspense fallback={null}>
        <TeamInner />
      </Suspense>
    </RequirePermission>
  );
}

function uid() {
  return "tk-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
async function authedFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
}

const TABS = [
  { key: "people",   label: "People",   icon: FiUsers },
  { key: "board",    label: "Board",    icon: FiGrid },
  { key: "list",     label: "List",     icon: FiList },
  { key: "activity", label: "Activity", icon: FiActivity },
];

function TeamInner() {
  const ask = useConfirm();
  const { user } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  // "myday" was the old name of the default view — old links still land here.
  const tab = TABS.some((t) => t.key === search.get("tab")) ? search.get("tab") : "people";
  const openTaskId = search.get("task");

  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrefill, setModalPrefill] = useState(null);
  const [openTask, setOpenTask] = useState(null);

  const [filters, setFilters] = useState({
    assignee: "mine",
    status: "all",
    priority: "all",
    linkKind: "all",
    search: "",
  });
  const [selected, setSelected] = useState(() => new Set());
  const [grouped, setGrouped] = useState(false);
  useEffect(() => { try { setGrouped(localStorage.getItem("lcl-tasks-grouped") === "1"); } catch {} }, []);
  const [focusApplied, setFocusApplied] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rows }, teamRes] = await Promise.all([
      supabase.from("tasks").select("id,data").order("updated_at", { ascending: false }),
      authedFetch("/api/team/list").then((r) => r.json()).catch(() => ({ users: [] })),
    ]);
    // The retired one-per-prospect renewal chases are not shown anywhere.
    // Admins supervise, so they see everyone's; an agent sees their own,
    // the ones open to everyone, and the ones they gave someone.
    const admin = user?.role === "admin";
    setTasks((rows || []).map((r) => r.data).filter((t) => t && t.source !== "prospect_renewal"
      && (admin || !t.assigneeId || t.assigneeId === user?.id || t.createdBy?.id === user?.id)));
    setTeam(teamRes.users || []);
    setLoading(false);
  }, [user?.id, user?.role]);

  useEffect(() => { load(); }, [load]);

  // Deep-link: open a specific task from ?task=…
  useEffect(() => {
    if (!openTaskId || !tasks.length) return;
    const found = tasks.find((t) => t.id === openTaskId);
    if (found) setOpenTask(found);
  }, [openTaskId, tasks]);

  const setTab = (key) => {
    const params = new URLSearchParams(search.toString());
    params.set("tab", key);
    router.replace(`/team?${params.toString()}`);
  };

  const filtered = useMemo(() => filterTasks(tasks, filters, user?.id), [tasks, filters, user?.id]);

  const counts = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    const mine = open.filter((t) => t.assigneeId === user?.id || !t.assigneeId);
    const overdue = open.filter((t) => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate + "T23:59:59") < new Date();
    });
    const urgent = open.filter((t) => t.priority === "urgent");
    return {
      total: tasks.length,
      open: open.length,
      mine: mine.length,
      overdue: overdue.length,
      urgent: urgent.length,
      done: tasks.length - open.length,
    };
  }, [tasks, user?.id]);

  // Focus mode — when someone (usually admin) has a huge backlog assigned
  // to them (>50), auto-narrow the default view to Urgent-only so the
  // Board isn't a wall of noise. Runs exactly once per hydration; the user
  // can widen it manually at any time and their choice sticks.
  useEffect(() => {
    if (focusApplied || !user || loading) return;
    if (counts.mine > 50 && filters.assignee === "mine" && filters.priority === "all") {
      setFilters((f) => ({ ...f, priority: "urgent" }));
    }
    setFocusApplied(true);
  }, [counts.mine, user, loading, focusApplied, filters.assignee, filters.priority]);

  const saveTask = async (task) => {
    const next = { ...task, updatedAt: new Date().toISOString() };
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === next.id);
      return exists ? prev.map((t) => (t.id === next.id ? next : t)) : [next, ...prev];
    });
    if (openTask?.id === next.id) setOpenTask(next);
    await supabase.from("tasks").upsert({ id: next.id, data: next });
  };

  const createTask = async (form) => {
    const task = {
      id: uid(),
      title: form.title,
      notes: form.notes,
      assigneeId: form.assigneeId,
      assigneeName: form.assigneeId ? team.find((t) => t.id === form.assigneeId)?.name : "Everyone",
      dueDate: form.dueDate,
      priority: form.priority,
      reminderCadence: form.reminderCadence,
      linkedTo: form.linkedTo,
      status: "open",
      source: modalPrefill?.kind || "manual",
      createdBy: { id: user.id, name: user.name || user.email },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updates: [],
    };
    await saveTask(task);
    setModalOpen(false);
    setModalPrefill(null);
    toast.success("Task created");
    authedFetch("/api/tasks/notify", {
      method: "POST",
      body: JSON.stringify({
        assigneeId: task.assigneeId,
        title: task.title,
        taskId: task.id,
        priority: task.priority,
      }),
    }).catch(() => {});
  };

  const me = () => ({ id: user.id, name: user.name || user.email });
  // Ticking done only closes the task — it never changes the job. A slip
  // of the finger is undone from the toast for 8 seconds, or with Reopen.
  const toggleDone = async (task) => {
    const reopening = task.status === "done";
    const at = new Date().toISOString();
    await saveTask({
      ...task,
      status: reopening ? "open" : "done",
      completedAt: reopening ? null : at,
      completedBy: reopening ? null : me(),
      dismissed: reopening ? undefined : task.dismissed,
      updates: [...(task.updates || []), { at, by: me(), kind: "status", text: reopening ? "Reopened" : "Marked done" }],
    });
    if (!reopening) toast.undo("Marked done", () => saveTask(task));
  };

  // "Remove" — for a task that shouldn't exist. An automatic task is closed
  // as not needed (deleting it would only let the engine raise it again a
  // minute later); it stays away until the job changes. A task someone
  // typed is deleted. Either can be undone from the toast.
  const removeTask = async (task) => {
    const auto = !!task.autoKey || task.createdBy?.id === "system";
    if (!await ask({
      title: "Remove this task?",
      body: auto ? "It's closed as not needed and won't come back unless the job changes. Nothing on the job is changed." : "It's deleted. Nothing on the job is changed.",
      confirmLabel: "Remove",
    })) return;
    setOpenTask(null);
    if (auto) {
      const at = new Date().toISOString();
      await saveTask({ ...task, status: "done", dismissed: true, completedAt: at, completedBy: me(),
        updates: [...(task.updates || []), { at, by: me(), kind: "status", text: "Removed — not needed" }] });
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      await supabase.from("tasks").delete().eq("id", task.id);
    }
    toast.undo("Task removed", () => saveTask(task));
  };

  // An admin stepping in on someone else's task.
  const takeOver = async (task) => {
    const at = new Date().toISOString();
    await saveTask({ ...task, assigneeId: user.id, assigneeName: user.name || user.email,
      escalatedFrom: [...(task.escalatedFrom || []), { id: task.assigneeId || null, name: task.assigneeName || "", at }],
      updates: [...(task.updates || []), { at, by: me(), kind: "status", text: `Taken over from ${task.assigneeName || "everyone"}` }] });
    toast.undo(`Taken over from ${task.assigneeName || "everyone"}`, () => saveTask(task));
    // Tell the person it was taken from, so nobody does it twice.
    if (task.assigneeId && task.assigneeId !== user.id) authedFetch("/api/tasks/notify", { method: "POST", body: JSON.stringify({ assigneeId: task.assigneeId, taskId: task.id, title: task.title, heading: `${String(user.name || user.email).split("@")[0]} took this over from you` }) }).catch(() => {});
  };

  const setStatus = async (taskId, nextStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === nextStatus) return;
    await saveTask({
      ...task,
      status: nextStatus,
      completedAt: nextStatus === "done" ? new Date().toISOString() : null,
      updates: [
        ...(task.updates || []),
        { at: new Date().toISOString(), by: { id: user.id, name: user.name || user.email }, kind: "status", text: `Moved to ${STATUSES.find((s) => s.key === nextStatus)?.label}` },
      ],
    });
  };

  const promoteSuggestion = (suggestion) => {
    setModalPrefill({
      title: suggestion.title,
      notes: suggestion.subtitle,
      priority: suggestion.priority,
      dueOffsetDays: suggestion.dueOffsetDays,
      cadence: suggestion.priority === "urgent" ? "aggressive" : "daily",
      linkedTo: suggestion.linkedTo,
      kind: suggestion.kind,
    });
    setModalOpen(true);
  };

  const openNew = () => { setModalPrefill(null); setModalOpen(true); };
  const closeDetail = () => {
    setOpenTask(null);
    const params = new URLSearchParams(search.toString());
    params.delete("task");
    router.replace(`/team?${params.toString()}`);
  };

  // ── Bulk-select handlers (List view only) ─────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleSelectAll = useCallback((ids, on) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const bulkReassign = async (assigneeId, assigneeName) => {
    const ids = [...selected];
    if (!ids.length) return;
    const affected = tasks.filter((t) => selected.has(t.id));
    const nowIso = new Date().toISOString();
    const updated = affected.map((t) => ({
      ...t,
      assigneeId,
      assigneeName: assigneeId ? assigneeName : "Everyone",
      updatedAt: nowIso,
      updates: [
        ...(t.updates || []),
        { at: nowIso, by: { id: user.id, name: user.name || user.email }, kind: "status", text: `Reassigned to ${assigneeName || "Everyone"}` },
      ],
    }));
    // Optimistic
    setTasks((prev) => prev.map((t) => updated.find((u) => u.id === t.id) || t));
    clearSelection();
    await supabase.from("tasks").upsert(updated.map((t) => ({ id: t.id, data: t })));
    toast.success(`Reassigned ${ids.length} task${ids.length === 1 ? "" : "s"} to ${assigneeName || "Everyone"}`);
    // Fire notifications to new assignees (batched, single push each).
    if (assigneeId) {
      authedFetch("/api/tasks/notify", {
        method: "POST",
        body: JSON.stringify({
          assigneeId,
          title: `${ids.length} task${ids.length === 1 ? "" : "s"} reassigned to you`,
          taskId: updated[0].id,
          priority: updated.some((t) => t.priority === "urgent") ? "urgent" : "normal",
        }),
      }).catch(() => {});
    }
  };

  const bulkMarkDone = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!await ask(`Mark ${ids.length} task${ids.length === 1 ? "" : "s"} as done?`)) return;
    const nowIso = new Date().toISOString();
    const affected = tasks.filter((t) => selected.has(t.id));
    const updated = affected.map((t) => ({
      ...t,
      status: "done",
      completedAt: nowIso,
      completedBy: { id: user.id, name: user.name || user.email },
      updatedAt: nowIso,
    }));
    setTasks((prev) => prev.map((t) => updated.find((u) => u.id === t.id) || t));
    clearSelection();
    await supabase.from("tasks").upsert(updated.map((t) => ({ id: t.id, data: t })));
    toast.undo(`Marked ${ids.length} done`, () => restore(affected));
  };

  // Put tasks back exactly as they were (the Undo on a bulk action).
  const restore = async (list) => {
    setTasks((prev) => [...list, ...prev.filter((t) => !list.some((x) => x.id === t.id))]);
    await supabase.from("tasks").upsert(list.map((t) => ({ id: t.id, data: t })));
  };

  // Same rule as removing one: automatic tasks are closed as not needed
  // (so they don't come straight back), typed ones are deleted.
  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!await ask({ title: `Remove ${ids.length} task${ids.length === 1 ? "" : "s"}?`, body: "Nothing on the jobs is changed. You can undo straight after.", confirmLabel: "Remove" })) return;
    const affected = tasks.filter((t) => selected.has(t.id));
    const auto = affected.filter((t) => t.autoKey || t.createdBy?.id === "system");
    const typed = affected.filter((t) => !auto.includes(t));
    const at = new Date().toISOString();
    const by = { id: user.id, name: user.name || user.email };
    const closed = auto.map((t) => ({ ...t, status: "done", dismissed: true, completedAt: at, completedBy: by, updatedAt: at,
      updates: [...(t.updates || []), { at, by, kind: "status", text: "Removed — not needed" }] }));
    setTasks((prev) => prev.filter((t) => !typed.some((x) => x.id === t.id)).map((t) => closed.find((c) => c.id === t.id) || t));
    clearSelection();
    if (closed.length) await supabase.from("tasks").upsert(closed.map((t) => ({ id: t.id, data: t })));
    if (typed.length) await supabase.from("tasks").delete().in("id", typed.map((t) => t.id));
    toast.undo(`Removed ${ids.length}`, () => restore(affected));
  };

  // Clear stale selections when the filter changes (a row you can't see
  // shouldn't stay silently selected in the bulk bar).
  useEffect(() => {
    const visibleIds = new Set(filtered.map((t) => t.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  return (
    <>
      <PageHeader
        icon={FiCheckSquare}
        title="Team"
        subtitle="Who is doing what"
        actions={
          <button className="btn-primary" onClick={openNew}>
            <FiPlus /> {user?.role === "admin" ? "Assign a task" : "Add a task"}
          </button>
        }
      />

      <div className="page space-y-5">
        <div className="scroll-area flex overflow-x-auto">
          <div className="inline-flex rounded-full border border-navy-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 font-semibold transition ${active ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900" : "text-navy-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200"}`}
                >
                  <Icon className="h-4 w-4" />{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "activity" ? (
          <AgentActivity />
        ) : tab === "people" ? (
          <TeamOverview tasks={tasks} team={user?.role === "admin" ? team : team.filter((p) => p.id === user?.id)} userId={user?.id} isAdmin={user?.role === "admin"} onOpen={setOpenTask} onDone={toggleDone} onTakeOver={takeOver} loading={loading} />
        ) : (
          <>
            {/* Filter bar shared by Board + List */}
            <FilterBar filters={filters} setFilters={setFilters} team={team} counts={counts} />

            {/* Focus-mode active banner — visible whenever we've narrowed the
                initial view because the assignee has too many tasks. */}
            {filters.assignee === "mine" && filters.priority === "urgent" && counts.mine > 50 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <span className="font-semibold">Focus mode on</span>
                <span className="text-xs">Showing urgent only ({filtered.length} of {counts.mine} tasks). Clear the priority filter to see everything.</span>
                <button
                  onClick={() => setFilters((f) => ({ ...f, priority: "all" }))}
                  className="ml-auto rounded-lg border border-amber-400 bg-white/60 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-white"
                >
                  Show all my tasks
                </button>
              </div>
            )}

            {loading ? (
              <div className="card p-8 text-center text-sm text-navy-400">Loading tasks…</div>
            ) : tab === "board" ? (
              <TaskBoard tasks={filtered} onOpen={setOpenTask} onStatusChange={setStatus} />
            ) : (
              <TaskList
                tasks={filtered}
                onOpen={setOpenTask}
                onToggleDone={toggleDone}
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
              />
            )}
          </>
        )}
      </div>

      <BulkActionsBar
        count={selected.size}
        team={team}
        onReassign={bulkReassign}
        onMarkDone={bulkMarkDone}
        onDelete={bulkDelete}
        onClear={clearSelection}
      />

      <NewTaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setModalPrefill(null); }}
        team={team}
        prefill={modalPrefill}
        onCreate={createTask}
      />
      <TaskDetailPanel
        task={openTask}
        onClose={closeDetail}
        onSave={saveTask}
        onDelete={removeTask}
        team={team}
        onTakeOver={user?.role === "admin" ? takeOver : null}
        userId={user?.id}
      />
    </>
  );
}

const KPI_TONES = {
  navy:  "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-200",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300",
  blue:  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  rose:  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

function Kpi({ label, value, icon: Icon, tone }) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-2">
        <span className="metric-label">{label}</span>
        <span className={`metric-chip ${KPI_TONES[tone]}`}><Icon className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="metric-value mt-3">{value}</p>
    </div>
  );
}

function FilterBar({ filters, setFilters, team, counts }) {
  const upd = (patch) => setFilters((f) => ({ ...f, ...patch }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-navy-200 dark:border-white/10">
        {[
          ["mine", `Mine (${counts.mine})`],
          ["all", `All (${counts.open + counts.done})`],
          ["unassigned", "Unassigned"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => upd({ assignee: k })}
            className={`px-3 py-1.5 text-xs font-semibold transition ${
              filters.assignee === k
                ? "bg-navy-900 text-white dark:bg-white/15"
                : "bg-white text-navy-500 hover:bg-navy-50 dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/5"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <select className="input h-9 w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => upd({ status: e.target.value })}>
        <option value="all">Any status</option>
        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>

      <select className="input h-9 w-auto py-1.5 text-xs" value={filters.priority} onChange={(e) => upd({ priority: e.target.value })}>
        <option value="all">Any priority</option>
        {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>

      <select className="input h-9 w-auto py-1.5 text-xs" value={filters.linkKind} onChange={(e) => upd({ linkKind: e.target.value })}>
        <option value="all">Any link</option>
        <option value="prospect">Prospect</option>
        <option value="client">Client</option>
        <option value="job">Job</option>
        <option value="engineer">Engineer</option>
        <option value="none">Not linked</option>
      </select>

      {team.length > 0 && filters.assignee !== "mine" && filters.assignee !== "unassigned" && (
        <select className="input h-9 w-auto py-1.5 text-xs" value={filters.assignee} onChange={(e) => upd({ assignee: e.target.value })}>
          <option value="all">Any assignee</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      {/* Explicit-user chip — shown when Board was filtered to one person via
          the Workload panel so the state is obvious at a glance. */}
      {(() => {
        const chosen = team.find((t) => t.id === filters.assignee);
        if (!chosen) return null;
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-800 bg-navy-800 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-white/15">
            Viewing {chosen.name}
            <button onClick={() => upd({ assignee: "all" })} className="ml-0.5 rounded-full bg-white/20 px-1 text-white hover:bg-white/30" aria-label="Clear assignee filter">×</button>
          </span>
        );
      })()}

      <div className="relative ml-auto">
        <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
        <input
          className="input h-9 w-52 py-1.5 pl-8 text-xs"
          placeholder="Search title, notes, linked…"
          value={filters.search}
          onChange={(e) => upd({ search: e.target.value })}
        />
      </div>
    </div>
  );
}
