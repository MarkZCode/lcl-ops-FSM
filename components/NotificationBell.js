"use client";

// Unified in-app notification inbox — the bell icon in the top bar.
// Three sections:
//   1. My tasks — everything assigned to the current user or "Everyone",
//      broken into overdue / due today / open, priority-first.
//   2. Team tasks — recent "Everyone" tasks (broader team context).
//   3. Replies — inbound client replies across all jobs (as before).
//
// Task counters + reply counters merge into one badge on the bell, and
// each item deep-links via taskDeepLink so tapping a linked task jumps
// to the prospect/job/client the task is about (matching what the phone
// push notification does).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FiBell, FiX, FiCornerDownLeft, FiCheckSquare, FiClock, FiAlertTriangle,
  FiUsers, FiUser, FiChevronRight,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { daysUntilDue, priorityMeta, taskDeepLink } from "@/lib/tasks";
import { playPing } from "@/lib/sound";

const SEEN_KEY = "lcl-seen-activity";
const TASK_REFRESH_MS = 45_000;

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
}
function saveSeen(set) {
  const arr = [...set].slice(-500);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr)); } catch {}
  if (supabase) supabase.auth.updateUser({ data: { seen_notifications: arr } }).catch(() => {});
}
async function hydrateSeenFromServer() {
  if (!supabase) return new Set();
  try {
    const { data } = await supabase.auth.getUser();
    const serverSeen = data?.user?.user_metadata?.seen_notifications;
    if (Array.isArray(serverSeen) && serverSeen.length) {
      const merged = new Set([...loadSeen(), ...serverSeen]);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...merged].slice(-500))); } catch {}
      return merged;
    }
  } catch {}
  return loadSeen();
}

export default function NotificationBell() {
  const { jobs, clients } = useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => loadSeen());
  const [tasks, setTasks] = useState([]);
  const panelRef = useRef(null);

  // Hydrate seen state from server in the background.
  useEffect(() => {
    hydrateSeenFromServer().then((serverSeen) => {
      setSeen((local) => {
        const merged = new Set([...local, ...serverSeen]);
        return merged.size === local.size ? local : merged;
      });
    });
  }, []);

  // Fetch tasks periodically. Cheap query — a couple of hundred rows max.
  useEffect(() => {
    let cancelled = false;
    const fetchTasks = async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id,data")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!cancelled) setTasks((data || []).map((r) => r.data));
    };
    fetchTasks();
    const t = setInterval(fetchTasks, TASK_REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // ── Notification list build-up ──────────────────────────────────────────
  // Client replies (unchanged from before).
  const replies = useMemo(() => {
    const out = [];
    for (const job of jobs) {
      const client = clients.find((c) => c.id === job.clientId);
      for (const a of job.activity || []) {
        if (a.direction === "in") out.push({ ...a, jobId: job.id, clientName: client?.name || "Client" });
      }
    }
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
  }, [jobs, clients]);

  // Tasks — split into "mine", "team", filter out done.
  const now = new Date();
  const myTasks = useMemo(() => {
    if (!user) return [];
    return tasks.filter((t) => t && t.status !== "done" && t.assigneeId === user.id);
  }, [tasks, user]);

  // Chime when a NEW task lands in "mine" between refreshes. First
  // hydration is silent (the ref is null → we just seed it) so the ping
  // only fires for genuinely-new assignments, not the initial load.
  const knownMineIds = useRef(null);
  useEffect(() => {
    if (!user) return;
    const currentIds = new Set(myTasks.map((t) => t.id));
    if (knownMineIds.current === null) {
      knownMineIds.current = currentIds;
      return;
    }
    const fresh = [...currentIds].filter((id) => !knownMineIds.current.has(id));
    // Chime disabled for now — was firing/spamming on app open. The bell
    // badge count above still updates normally; only the audio ping is off.
    // if (fresh.length > 0) playPing();
    knownMineIds.current = currentIds;
  }, [myTasks, user]);
  const teamTasks = useMemo(() => {
    return tasks
      .filter((t) => t && t.status !== "done" && !t.assigneeId)
      // Only show recent everyone-tasks (last 14 days) so ancient ones don't clog the bell.
      .filter((t) => (now - new Date(t.createdAt || 0)) < 14 * 86400_000);
  }, [tasks, now]);

  // Split my-tasks by urgency for the panel headings + counters.
  const myBuckets = useMemo(() => {
    const overdue = [], dueToday = [], upcoming = [];
    for (const t of myTasks) {
      const d = daysUntilDue(t);
      if (d != null && d < 0) overdue.push(t);
      else if (d === 0) dueToday.push(t);
      else upcoming.push(t);
    }
    const priRank = { urgent: 0, normal: 1, low: 2 };
    const sortByPri = (a, b) => (priRank[a.priority] ?? 1) - (priRank[b.priority] ?? 1);
    return {
      overdue: overdue.sort(sortByPri),
      dueToday: dueToday.sort(sortByPri),
      upcoming: upcoming.sort(sortByPri).slice(0, 6),
    };
  }, [myTasks]);

  // Merge everything into one flat feed for the unread counter.
  const allItems = useMemo(() => {
    const items = [];
    for (const t of myBuckets.overdue)  items.push({ id: `task-od-${t.id}`, at: t.updatedAt || t.createdAt, kind: "task_overdue" });
    for (const t of myBuckets.dueToday) items.push({ id: `task-du-${t.id}`, at: t.updatedAt || t.createdAt, kind: "task_due" });
    for (const t of myBuckets.upcoming) items.push({ id: `task-up-${t.id}`, at: t.createdAt, kind: "task_upcoming" });
    for (const t of teamTasks)          items.push({ id: `task-tm-${t.id}`, at: t.createdAt, kind: "task_team" });
    for (const r of replies)            items.push({ id: r.id, at: r.at, kind: "reply" });
    return items;
  }, [myBuckets, teamTasks, replies]);

  // Auto-mark old items as seen so the badge only reflects genuinely new stuff.
  const jobsLoaded = useRef(false);
  useEffect(() => {
    if (jobsLoaded.current || allItems.length === 0) return;
    jobsLoaded.current = true;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    setSeen((prev) => {
      const updated = new Set(prev);
      let changed = false;
      allItems.forEach((it) => {
        if (!updated.has(it.id) && new Date(it.at).getTime() < cutoff) {
          updated.add(it.id); changed = true;
        }
      });
      if (changed) saveSeen(updated);
      return changed ? updated : prev;
    });
  }, [allItems]);

  const unreadCount = useMemo(
    () => allItems.filter((it) => !seen.has(it.id)).length,
    [allItems, seen]
  );

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Mark visible items as seen when opening.
      setSeen((prev) => {
        const updated = new Set(prev);
        allItems.forEach((it) => updated.add(it.id));
        saveSeen(updated);
        return updated;
      });
    }
  };

  const isNew = (id) => !seen.has(id);
  const totalMine = myBuckets.overdue.length + myBuckets.dueToday.length + myBuckets.upcoming.length;
  const anything = totalMine || teamTasks.length || replies.length;

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={handleToggle}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-navy-400 hover:bg-navy-800 hover:text-white"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      >
        <FiBell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-4 top-[3.75rem] z-[9998] w-[min(calc(100vw-2rem),22rem)] rounded-2xl border border-navy-700 bg-navy-900 shadow-2xl lg:absolute lg:left-full lg:right-auto lg:top-0 lg:ml-2 lg:w-96">
          <div className="flex items-center justify-between border-b border-navy-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-white">Notifications</p>
              {unreadCount > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
            </div>
            <div className="flex items-center gap-1">
              <Link href="/notifications" onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-navy-300 hover:bg-navy-800 hover:text-white">
                See all →
              </Link>
              <button onClick={() => setOpen(false)} className="text-navy-400 hover:text-white">
                <FiX className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="scroll-area max-h-[70vh] overflow-y-auto">
            {!anything ? (
              <p className="px-4 py-10 text-center text-xs text-navy-500">You&apos;re all clear.</p>
            ) : (
              <>
                {/* My tasks */}
                {totalMine > 0 && (
                  <Section title="My tasks" count={totalMine}>
                    {myBuckets.overdue.length > 0 && (
                      <SubHead icon={FiAlertTriangle} tone="rose" label={`Overdue (${myBuckets.overdue.length})`} />
                    )}
                    {myBuckets.overdue.map((t) => (
                      <TaskRow key={t.id} task={t} kind="overdue" isNew={isNew(`task-od-${t.id}`)} onClose={() => setOpen(false)} />
                    ))}
                    {myBuckets.dueToday.length > 0 && (
                      <SubHead icon={FiClock} tone="amber" label={`Due today (${myBuckets.dueToday.length})`} />
                    )}
                    {myBuckets.dueToday.map((t) => (
                      <TaskRow key={t.id} task={t} kind="due" isNew={isNew(`task-du-${t.id}`)} onClose={() => setOpen(false)} />
                    ))}
                    {myBuckets.upcoming.length > 0 && (
                      <SubHead icon={FiUser} tone="blue" label={`Assigned to you (${myBuckets.upcoming.length})`} />
                    )}
                    {myBuckets.upcoming.map((t) => (
                      <TaskRow key={t.id} task={t} kind="upcoming" isNew={isNew(`task-up-${t.id}`)} onClose={() => setOpen(false)} />
                    ))}
                  </Section>
                )}

                {/* Team tasks */}
                {teamTasks.length > 0 && (
                  <Section title="Team tasks" count={teamTasks.length}>
                    <SubHead icon={FiUsers} tone="violet" label="Assigned to everyone" />
                    {teamTasks.slice(0, 8).map((t) => (
                      <TaskRow key={t.id} task={t} kind="team" isNew={isNew(`task-tm-${t.id}`)} onClose={() => setOpen(false)} />
                    ))}
                  </Section>
                )}

                {/* Replies */}
                {replies.length > 0 && (
                  <Section title="Recent replies" count={replies.length}>
                    {replies.map((a) => (
                      <Link
                        key={a.id}
                        href={`/jobs/${a.jobId}`}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 border-b border-navy-800 px-4 py-3 hover:bg-navy-800"
                      >
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-900 text-blue-400">
                          <FiCornerDownLeft className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="truncate text-xs font-semibold text-white">{a.clientName}</p>
                            <span className="shrink-0 text-[10px] text-navy-500">{fmtDate(a.at)}</span>
                          </div>
                          <p className="text-[11px] text-navy-400">{a.jobId}</p>
                          <p className="mt-0.5 text-xs text-navy-300 line-clamp-2">{(a.detail || "").split("\n")[0]}</p>
                        </div>
                        {isNew(a.id) && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
                      </Link>
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div className="border-b border-navy-800 last:border-b-0">
      <div className="flex items-center justify-between px-4 py-2 bg-navy-950/40">
        <span className="text-[10px] font-bold uppercase tracking-wider text-navy-400">{title}</span>
        <span className="rounded-full bg-navy-800 px-1.5 py-0.5 text-[10px] font-bold text-navy-300">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SubHead({ icon: Icon, tone, label }) {
  const toneClass = {
    rose:   "text-rose-300",
    amber:  "text-amber-300",
    blue:   "text-blue-300",
    violet: "text-violet-300",
  }[tone] || "text-navy-300";
  return (
    <div className={`flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider ${toneClass}`}>
      <Icon className="h-3 w-3" />{label}
    </div>
  );
}

function TaskRow({ task, kind, isNew, onClose }) {
  const p = priorityMeta(task.priority);
  const d = daysUntilDue(task);
  const overdue = d != null && d < 0;
  const dueLabel = d == null ? null
    : overdue ? `${Math.abs(d)}d overdue`
    : d === 0 ? "Today"
    : d === 1 ? "Tomorrow"
    : `${d}d`;
  const linkedLabel = task.linkedTo?.label;
  return (
    <Link
      href={taskDeepLink(task)}
      onClick={onClose}
      className="flex items-start gap-3 border-b border-navy-800 px-4 py-3 last:border-b-0 hover:bg-navy-800 transition"
    >
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-800">
        <FiCheckSquare className={`h-3.5 w-3.5 ${kind === "overdue" ? "text-rose-400" : kind === "due" ? "text-amber-400" : "text-brand-400"}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <p className="truncate text-xs font-semibold text-white">{task.title}</p>
          <span className={`shrink-0 text-[10px] font-semibold ${overdue ? "text-rose-400" : d === 0 ? "text-amber-400" : "text-navy-500"}`}>
            {dueLabel || fmtDate(task.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${p.chip}`}>
            <span className={`h-1 w-1 rounded-full ${p.dot}`} />{p.label}
          </span>
          {linkedLabel && (
            <span className="truncate text-[11px] text-navy-400">→ {linkedLabel}</span>
          )}
        </div>
      </div>
      {isNew && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
      <FiChevronRight className="mt-2 h-3 w-3 shrink-0 text-navy-600" />
    </Link>
  );
}
