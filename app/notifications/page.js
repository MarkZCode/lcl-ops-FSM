"use client";

// Notifications, full page. The same things the bell shows, in the same
// order: what a colleague asked of you, client replies, work that is late
// or due today, then what's coming up. Unread first by default.
import { useEffect, useMemo, useState } from "react";
import { LuBellRing, LuCheckCheck } from "react-icons/lu";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { buildNotifications } from "@/lib/notifications";
import { NotifyGroup, NotifyRow, TaskNotifyRow, relTime, replyPreview } from "@/components/notify/Rows";

const SEEN_KEY = "lcl-seen-activity";
function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function saveSeen(set) {
  const arr = [...set].slice(-1000);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr)); } catch {}
  if (supabase) supabase.auth.updateUser({ data: { seen_notifications: arr } }).catch(() => {});
}

const GROUPS = [
  { key: "team", title: "From your team" },
  { key: "reply", title: "Client replies" },
  { key: "now", title: "Late or due today" },
  { key: "later", title: "Coming up" },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  const { jobs, clients } = useStore();
  const [tasks, setTasks] = useState([]);
  const [seen, setSeen] = useState(() => new Set());
  const [show, setShow] = useState("unread");

  useEffect(() => { setSeen(loadSeen()); }, []);
  useEffect(() => {
    if (!supabase) return;
    let off = false;
    const load = async () => {
      const { data } = await supabase.from("tasks").select("id,data").order("updated_at", { ascending: false }).limit(500);
      if (!off) setTasks((data || []).map((r) => r.data));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { off = true; clearInterval(t); };
  }, []);

  const items = useMemo(() => buildNotifications({ tasks, jobs, clients, userId: user?.id }), [tasks, jobs, clients, user?.id]);
  const unread = items.filter((it) => !seen.has(it.id)).length;
  const visible = show === "unread" ? items.filter((it) => !seen.has(it.id)) : items;

  const groupOf = (it) => {
    if (it.kind === "reply") return "reply";
    const byPerson = it.task?.createdBy?.id && it.task.createdBy.id !== "system" && it.task.createdBy.id !== user?.id;
    if (byPerson) return "team";
    return it.kind === "task_overdue" || it.kind === "task_due" ? "now" : "later";
  };
  const grouped = Object.fromEntries(GROUPS.map((g) => [g.key, visible.filter((it) => groupOf(it) === g.key)]));

  const markRead = (ids) => setSeen((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => next.add(id));
    saveSeen(next);
    return next;
  });

  return (
    <>
      <PageHeader
        icon={LuBellRing}
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up"}
        actions={unread > 0 ? (
          <button className="btn-outline" onClick={() => markRead(items.map((it) => it.id))}><LuCheckCheck /> Mark all read</button>
        ) : null}
      />
      <div className="page">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-flex rounded-full border border-navy-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            {[["unread", `Unread${unread ? ` · ${unread}` : ""}`], ["all", "All"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setShow(k)}
                className={`rounded-full px-4 py-1.5 font-semibold transition ${show === k ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900" : "text-navy-500 hover:text-navy-800 dark:text-slate-400"}`}>
                {label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="card px-6 py-14 text-center">
              <p className="text-base font-semibold text-navy-900 dark:text-white">{show === "unread" ? "Nothing new" : "No notifications"}</p>
              <p className="mt-1 text-sm text-navy-500 dark:text-slate-400">Tasks given to you and client replies show here.</p>
            </div>
          ) : (
            <div className="card divide-y divide-navy-100 overflow-hidden p-0 dark:divide-white/10">
              {GROUPS.filter((g) => grouped[g.key].length).map((g) => (
                <NotifyGroup key={g.key} title={g.title} count={grouped[g.key].length}>
                  {grouped[g.key].slice(0, 60).map((it) =>
                    it.kind === "reply" ? (
                      <NotifyRow key={it.id} href={it.url} tone="reply" unread={!seen.has(it.id)} onClick={() => markRead([it.id])}
                        title={it.title} meta={`${it.jobId} — ${replyPreview(it.subtitle)}`} when={relTime(it.at)} />
                    ) : (
                      <TaskNotifyRow key={it.id} task={it.task} userId={user?.id} unread={!seen.has(it.id)} onClick={() => markRead([it.id])} />
                    )
                  )}
                </NotifyGroup>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
