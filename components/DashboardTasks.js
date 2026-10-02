"use client";

// "Your tasks" on the dashboard, and the one button to give someone a task.
//
// What each person has to do today — what a colleague asked of them, and
// what the app raised from the jobs — in the order to do it. Anyone can hand
// a task to anyone: pick the person, say what, optionally link the job, and
// they get a notification that opens it.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { taskDeepLink } from "@/lib/tasks";
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

  const done = (task) => save({
    ...task, status: "done", completedAt: new Date().toISOString(), completedBy: { id: user.id, name: user.name || user.email },
    updates: [...(task.updates || []), { at: new Date().toISOString(), by: { id: user.id, name: user.name || user.email }, kind: "status", text: "Marked done" }],
  });

  if (!user) return null;
  const mine = orderMyDay(tasks, user.id).map((x) => x.t);
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="section-label text-sm">Your tasks</h2>
        <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => setOpen(true)}>
          <FiPlus /> Assign a task
        </button>
      </div>
      {/* The first eight, in the order to do them; the rest are on Team. */}
      <MyDay tasks={mine.slice(0, 8)} userId={user.id} onOpen={(t) => router.push(taskDeepLink(t))} onDone={done} />
      {mine.length > 8 && <Link href="/team?tab=myday" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">See all {mine.length} →</Link>}
      <NewTaskModal open={open} onClose={() => setOpen(false)} team={team} prefill={null} onCreate={create} />
    </section>
  );
}
