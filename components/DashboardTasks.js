"use client";

// "Your tasks" on the dashboard, and the one button to give someone a task.
//
// What each person has to do today — what a colleague asked of them, and
// what the app raised from the jobs — in the order to do it. Only what is
// due today or late is listed, so nobody does tomorrow's work today. Admins
// also see the team's tasks that have been left too long, to step in.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { taskDeepLink, daysUntilDue } from "@/lib/tasks";
import { toast } from "@/lib/toast";
import Link from "next/link";
import MyDay, { orderMyDay } from "@/components/team/MyDay";
import NewTaskModal from "@/components/team/NewTaskModal";

const uid = () => "tk-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
async function authedFetch(url, options = {}) {
  const { data } = (await supabase?.auth.getSession()) || {};
  const token = data?.session?.access_token || "";
  return fetch(url, { ...options, headers: { ...(options.headers || {}), "Content-Type": "application/json", Authorization: `Bearer ${token}` } });
}

export default function DashboardTasks() {
  const { user } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: rows }, teamRes] = await Promise.all([
      supabase.from("tasks").select("id,data").order("updated_at", { ascending: false }),
      authedFetch("/api/team/list").then((r) => r.json()).catch(() => ({ users: [] })),
    ]);
    // The retired one-per-prospect renewal chases never show here.
    setTasks((rows || []).map((r) => r.data).filter((t) => t && t.source !== "prospect_renewal"));
    setTeam(teamRes.users || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (task) => {
    const next = { ...task, updatedAt: new Date().toISOString() };
    setTasks((prev) => (prev.some((t) => t.id === next.id) ? prev.map((t) => (t.id === next.id ? next : t)) : [next, ...prev]));
    if (supabase) await supabase.from("tasks").upsert({ id: next.id, data: next });
  };

  const create = async (form) => {
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
      source: "manual",
      createdBy: { id: user.id, name: user.name || user.email },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updates: [],
    };
    await save(task);
    setOpen(false);
    toast.success(task.assigneeId ? `Task given to ${task.assigneeName} — they've been notified.` : "Task created for everyone.");
    authedFetch("/api/tasks/notify", { method: "POST", body: JSON.stringify({ assigneeId: task.assigneeId, title: task.title, taskId: task.id, priority: task.priority }) }).catch(() => {});
  };

  const done = async (task) => {
    await save({
      ...task, status: "done", completedAt: new Date().toISOString(), completedBy: { id: user.id, name: user.name || user.email },
      updates: [...(task.updates || []), { at: new Date().toISOString(), by: { id: user.id, name: user.name || user.email }, kind: "status", text: "Marked done" }],
    });
    toast.undo("Marked done", () => save(task));
  };
  const takeOver = async (task) => {
    const at = new Date().toISOString();
    await save({ ...task, assigneeId: user.id, assigneeName: user.name || user.email,
      escalatedFrom: [...(task.escalatedFrom || []), { id: task.assigneeId || null, name: task.assigneeName || "", at }],
      updates: [...(task.updates || []), { at, by: { id: user.id, name: user.name || user.email }, kind: "status", text: `Taken over from ${task.assigneeName || "everyone"}` }] });
    toast.undo(`Taken over from ${task.assigneeName || "everyone"}`, () => save(task));
  };

  if (!user) return null;
  const all = orderMyDay(tasks, user.id).map((x) => x.t);
  // Due today, late, or with no date — the rest waits for its day.
  const notYet = (t) => (daysUntilDue(t) ?? 0) > 0;
  const mine = all.filter((t) => !notYet(t));
  const later = all.length - mine.length;
  const isAdmin = user.role === "admin";
  const lateFor = (t) => (t.dueAt ? new Date(t.dueAt).getTime() < Date.now() : (daysUntilDue(t) ?? 1) < 0);
  const watch = isAdmin
    ? tasks.filter((t) => t.status !== "done" && t.assigneeId !== user.id && (t.flaggedAt || lateFor(t)))
        .sort((a, b) => (b.flaggedAt ? 1 : 0) - (a.flaggedAt ? 1 : 0) || new Date(a.dueAt || a.dueDate || 0) - new Date(b.dueAt || b.dueDate || 0))
    : [];
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="section-label text-sm">Your tasks</h2>
        <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => setOpen(true)}>
          <FiPlus /> {isAdmin ? "Assign a task" : "Add a task"}
        </button>
      </div>
      {/* The first eight, in the order to do them; the rest are on Team. */}
      <MyDay tasks={mine.slice(0, 8)} userId={user.id} onOpen={(t) => router.push(taskDeepLink(t))} onDone={done} />
      {(mine.length > 8 || later > 0) && (
        <Link href="/team?tab=people" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
          {mine.length > 8 ? `See all ${mine.length}` : ""}{mine.length > 8 && later ? " · " : ""}{later ? `${later} more not due yet` : ""} →
        </Link>
      )}

      {/* Supervision — the team's work that has been left too long. */}
      {watch.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-rose-600">Team — left too long · {watch.length}</h3>
          <ul className="card divide-y divide-navy-100 p-0 dark:divide-white/10">
            {watch.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => router.push(taskDeepLink(t))}>
                  <span className="block truncate text-sm font-semibold text-navy-900 dark:text-white">{t.title}</span>
                  <span className="block truncate text-xs text-navy-500">{String(t.assigneeName || "Everyone").split("@")[0]}{t.flaggedAt ? " · not picked up" : " · late"}</span>
                </button>
                <button type="button" className="btn-outline shrink-0 py-1 text-xs" onClick={() => takeOver(t)}>Take over</button>
              </li>
            ))}
          </ul>
          {watch.length > 5 && <Link href="/team?tab=people" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">See all {watch.length} →</Link>}
        </div>
      )}
      <NewTaskModal open={open} onClose={() => setOpen(false)} team={team} prefill={null} onCreate={create} />
    </section>
  );
}
