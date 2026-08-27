"use client";

// Small floating banner shown at the top of an FSM page (prospects, jobs,
// clients) when the URL carries ?task=<id> — i.e. the user arrived here
// via a task notification. Displays the task title with a one-click "Mark
// done" button so they can complete the task without leaving the record
// they came here to work on. Removes itself once the task is marked done
// (or the user dismisses it manually).

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FiCheckSquare, FiCheck, FiX, FiClock, FiExternalLink } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { daysUntilDue, priorityMeta } from "@/lib/tasks";

export default function TaskCompletionBanner() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const taskId = search.get("task");
  const [task, setTask] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!taskId) { setTask(null); return; }
    setDismissed(false);
    let live = true;
    (async () => {
      const { data } = await supabase.from("tasks").select("data").eq("id", taskId).maybeSingle();
      if (live) setTask(data?.data || null);
    })();
    return () => { live = false; };
  }, [taskId]);

  const clearTaskParam = () => {
    const params = new URLSearchParams(search.toString());
    params.delete("task");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const markDone = async () => {
    if (!task) return;
    setSaving(true);
    const next = {
      ...task,
      status: "done",
      completedAt: new Date().toISOString(),
      completedBy: { id: user.id, name: user.name || user.email },
      updates: [
        ...(task.updates || []),
        { at: new Date().toISOString(), by: { id: user.id, name: user.name || user.email }, kind: "status", text: "Marked done from linked record" },
      ],
      updatedAt: new Date().toISOString(),
    };
    await supabase.from("tasks").upsert({ id: task.id, data: next });
    setSaving(false);
    clearTaskParam();
    setDismissed(true);
  };

  if (!taskId || !task || dismissed || task.status === "done") return null;

  const p = priorityMeta(task.priority);
  const d = daysUntilDue(task);
  const dueLabel = d == null ? null : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `${d}d left`;

  return (
    <div className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500 text-white">
          <FiCheckSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">From task</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${p.chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />{p.label}
            </span>
            {dueLabel && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${d != null && d < 0 ? "text-rose-700" : "text-amber-800 dark:text-amber-200"}`}>
                <FiClock className="h-3 w-3" />{dueLabel}
              </span>
            )}
          </div>
          <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{task.title}</p>
        </div>
        <a
          href={`/team?tab=board&task=${task.id}`}
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-white/10 dark:text-slate-200"
          title="Open task detail"
        >
          <FiExternalLink className="inline h-3 w-3 mr-1" />Open task
        </a>
        <button
          onClick={markDone}
          disabled={saving}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <FiCheck className="inline h-3 w-3 mr-1" />{saving ? "Saving…" : "Mark done"}
        </button>
        <button
          onClick={() => { clearTaskParam(); setDismissed(true); }}
          className="shrink-0 rounded-lg p-1 text-navy-500 hover:bg-white/50 dark:hover:bg-white/10"
          aria-label="Dismiss"
        >
          <FiX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
