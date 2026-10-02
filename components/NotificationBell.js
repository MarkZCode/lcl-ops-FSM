"use client";

// Unified in-app notification inbox — the bell icon in the top bar.
// Three sections:
//   1. Needs you now — a task newly assigned to YOU, and anything of
//      yours that is overdue or due today, priority-first.
//   2. Replies — inbound client replies on jobs that are yours to answer.
//
// WHAT IS DELIBERATELY NOT HERE
// A notification is something you have to act on today. Two things used to
// be counted that aren't:
//   • a task assigned to you with a future due date, AFTER you have seen
//     it. The assignment itself is an event and is counted once; what was
//     wrong before was counting it again every day until it was done, so
//     a task due in three weeks sat on the badge for three weeks. Event,
//     then silence — not a standing tally.
//   • every unassigned "Everyone" task created in the last fortnight. Work
//     nobody has picked up is a queue to review on the Tasks page, not an
//     alert to each person individually — and it meant the same badge
//     number appeared for everyone regardless of what they were doing.
// Both are still one tap away on /tasks. The bell now only carries things
// with a deadline that has arrived.
//
// Task counters + reply counters merge into one badge on the bell, and
// each item deep-links via taskDeepLink so tapping a linked task jumps
// to the prospect/job/client the task is about (matching what the phone
// push notification does).

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
// Backstop only — the live subscription below is what makes an assignment
// land immediately. 45s was the whole delivery mechanism, so "assign a task
// and get told" could take three quarters of a minute.
const TASK_REFRESH_MS = 20_000;

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


// The first line of a reply that actually says something.
//
// Leading with line one produced a bell full of rows reading "Hi", "Hi
// Lisa" and "On Wed, Sep 23 2026 at 1:50 AM Landlord Compliance London <"
// — the greeting and the quoted header, never the message. Skips both, and
// falls back to the raw first line rather than showing nothing.
const GREETING_ONLY = /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening))\b[\s,.!-]*[a-z'’-]*[\s,.!-]*$/i;
const QUOTED_HEADER = /^(on\s.+wrote:?$|on\s.+<|-{2,}\s*original message|from:\s)/i;

function replyPreview(detail) {
  const lines = String(detail || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const meaty = lines.find(
    (l) => l.length > 2 && !GREETING_ONLY.test(l) && !QUOTED_HEADER.test(l) && !l.startsWith(">")
  );
  return meaty || lines[0] || "(no text)";
}

export default function NotificationBell() {
  const { jobs, clients } = useStore();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => loadSeen());
  const [tasks, setTasks] = useState([]);
  // Unique per MOUNT. supabase.channel(name) returns the EXISTING channel
  // when one of that name is already registered, and calling .on() on a
  // channel that has already subscribed throws — which took the whole page
  // down, because this component is mounted twice (the desktop top bar and
  // the mobile bar both render a bell; only one is visible, but both mount).
  const channelId = useId();
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

    // Live. A task assigned to someone should reach their bell in about a
    // second, not on the next poll. Needs `tasks` in the supabase_realtime
    // publication (supabase/ENABLE-REALTIME.sql); until it is, the poll
    // above still delivers it, just slower.
    // Live sync is a convenience on top of the poll above. It must never be
    // able to break the page: everything here is wrapped, and if the
    // subscription can't be created the poll still delivers, just slower.
    let channel = null;
    try {
      channel = supabase
        .channel(`lcl-tasks-live-${channelId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fetchTasks)
        .subscribe();
    } catch (err) {
      console.warn("[tasks] live sync unavailable — falling back to polling.", err);
    }

    return () => {
      cancelled = true;
      clearInterval(t);
      try { if (channel) supabase.removeChannel(channel); } catch {}
    };
  }, [channelId]);

  // ── Notification list build-up ──────────────────────────────────────────
  // Client replies (unchanged from before).
  // An engineer sees replies on the jobs they're actually on; the office
  // sees all of them. A client reply is only a notification for the person
  // who has to answer it — everyone else getting the same badge is how a
  // number stops meaning anything.
  const replies = useMemo(() => {
    const mine = (job) => {
      if (isAdmin || user?.role !== "engineer") return true;
      if (job.engineerId === user.engineerId) return true;
      return (job.visits || []).some((v) => v.engineerId === user.engineerId);
    };
    const out = [];
    for (const job of jobs) {
      if (!mine(job)) continue;
      const client = clients.find((c) => c.id === job.clientId);
      for (const a of job.activity || []) {
        if (a.direction === "in") out.push({ ...a, jobId: job.id, clientName: client?.name || "Client" });
      }
    }
    // One row per CONVERSATION, not per message. A client who replies four
    // times about one job is one thing to deal with; four identical-looking
    // rows in the bell is how a notification list stops being read at all.
    // Newest reply wins, and it carries the count.
    const latestPerJob = new Map();
    for (const r of out.sort((a, b) => new Date(b.at) - new Date(a.at))) {
      const existing = latestPerJob.get(r.jobId);
      if (existing) { existing.replyCount += 1; continue; }
      latestPerJob.set(r.jobId, { ...r, replyCount: 1 });
    }
    return [...latestPerJob.values()].slice(0, 20);
  }, [jobs, clients, isAdmin, user]);

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
    // An URGENT task created in the last few minutes does chime — that is
    // the "new enquiry needs answering now" case. Anything older (the list
    // loading, a re-sync) stays silent.
    const justNow = Date.now() - 3 * 60 * 1000;
    if (myTasks.some((t) => fresh.includes(t.id) && t.priority === "urgent" && new Date(t.createdAt || 0).getTime() > justNow)) playPing();
    knownMineIds.current = currentIds;
  }, [myTasks, user]);
  // Unassigned "Everyone" tasks are intentionally NOT surfaced here any
  // more — see the header. They're a queue to pick up on /tasks, not an
  // alert delivered identically to every person in the company.

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
    // Only what has a deadline that has already arrived, plus replies.
    // Upcoming and unassigned tasks are shown on /tasks, never counted here.
    for (const t of myBuckets.overdue)  items.push({ id: `task-od-${t.id}`, at: t.updatedAt || t.createdAt, kind: "task_overdue" });
    for (const t of myBuckets.dueToday) items.push({ id: `task-du-${t.id}`, at: t.updatedAt || t.createdAt, kind: "task_due" });
    // Keyed on task AND assignee, so re-assigning an existing task to you
    // is a fresh event rather than something already marked seen.
    for (const t of myBuckets.upcoming) items.push({ id: `task-as-${t.id}-${t.assigneeId}`, at: t.updatedAt || t.createdAt, kind: "task_assigned" });
    for (const r of replies)            items.push({ id: r.id, at: r.at, kind: "reply" });
    return items;
  }, [myBuckets, replies]);

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
  const anything = totalMine || myBuckets.upcoming.length || replies.length;

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={handleToggle}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-900 dark:text-navy-400 dark:hover:bg-navy-800 dark:hover:text-white"
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
        // Anchored to the bell's RIGHT edge and dropping below it.
        // `lg:left-full` opened the panel to the right of the button — which
        // was right when the bell lived in the sidebar rail, and wrong the
        // moment it moved to the top bar, where the button already sits at
        // the right edge of the window. The panel simply ran off the screen.
        <div className="fixed right-4 top-[3.75rem] z-[9998] w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-2xl lg:absolute lg:right-0 lg:left-auto lg:top-full lg:mt-2 lg:w-96 dark:border-navy-700 dark:bg-navy-900">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3 dark:border-navy-700">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-navy-900 dark:text-white">Notifications</p>
              {unreadCount > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>}
            </div>
            <div className="flex items-center gap-1">
              <Link href="/notifications" onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-[11px] font-semibold text-navy-500 hover:bg-navy-100 hover:text-navy-900 dark:text-navy-300 dark:hover:bg-navy-800 dark:hover:text-white">
                See all →
              </Link>
              <button onClick={() => setOpen(false)} className="text-navy-400 hover:text-navy-900 dark:hover:text-white">
                <FiX className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="scroll-area max-h-[70vh] overflow-y-auto">
            {!anything ? (
              <p className="px-4 py-10 text-center text-xs text-navy-500 dark:text-navy-400">You&apos;re all clear.</p>
            ) : (
              <>
                {/* Needs you now */}
                {totalMine > 0 && (
                  <Section title="Needs you now" count={totalMine}>
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
                  </Section>
                )}

                {/* Assigned to you. Counted while unseen, quiet afterwards —
                    the badge marks the arrival, not the existence. */}
                {myBuckets.upcoming.length > 0 && (
                  <Section title="Assigned to you" count={myBuckets.upcoming.length}>
                    <SubHead icon={FiUser} tone="blue" label={`${myBuckets.upcoming.length} open`} />
                    {myBuckets.upcoming.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        kind="upcoming"
                        isNew={isNew(`task-as-${t.id}-${t.assigneeId}`)}
                        onClose={() => setOpen(false)}
                      />
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
                        className="flex items-start gap-3 border-b border-navy-100 px-4 py-3 hover:bg-navy-50 dark:border-navy-800 dark:hover:bg-navy-800"
                      >
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400">
                          <FiCornerDownLeft className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <p className="truncate text-xs font-semibold text-navy-900 dark:text-white">{a.clientName}</p>
                            <span className="shrink-0 text-[10px] text-navy-400">{fmtDate(a.at)}</span>
                          </div>
                          <p className="text-[11px] text-navy-500 dark:text-navy-400">
                            {a.jobId}
                            {a.replyCount > 1 && (
                              <span className="ml-1.5 rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-600 dark:bg-navy-800 dark:text-navy-300">
                                {a.replyCount} replies
                              </span>
                            )}
                          </p>
                          {/* First NON-EMPTY line. Leading with line one gave
                              a wall of rows reading "Hi" and "Hi Lisa" — the
                              greeting, never the message. */}
                          <p className="mt-0.5 text-xs text-navy-600 line-clamp-2 dark:text-navy-300">{replyPreview(a.detail)}</p>
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
    <div className="border-b border-navy-100 last:border-b-0 dark:border-navy-800">
      <div className="flex items-center justify-between bg-navy-50 px-4 py-2 dark:bg-navy-950/40">
        <span className="text-[10px] font-bold uppercase tracking-wider text-navy-500 dark:text-navy-400">{title}</span>
        <span className="rounded-full bg-navy-200 px-1.5 py-0.5 text-[10px] font-bold text-navy-700 dark:bg-navy-800 dark:text-navy-300">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SubHead({ icon: Icon, tone, label }) {
  // The -300 shades were picked to sit on a dark sidebar. On the white
  // panel they're barely legible, so each tone gets a readable light-mode
  // weight and keeps the original for dark.
  const toneClass = {
    rose:   "text-rose-600 dark:text-rose-300",
    amber:  "text-amber-600 dark:text-amber-300",
    blue:   "text-blue-600 dark:text-blue-300",
    violet: "text-violet-600 dark:text-violet-300",
  }[tone] || "text-navy-500 dark:text-navy-300";
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
      className="flex items-start gap-3 border-b border-navy-100 px-4 py-3 transition last:border-b-0 hover:bg-navy-50 dark:border-navy-800 dark:hover:bg-navy-800"
    >
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-100 dark:bg-navy-800">
        <FiCheckSquare className={`h-3.5 w-3.5 ${kind === "overdue" ? "text-rose-400" : kind === "due" ? "text-amber-400" : "text-brand-400"}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <p className="truncate text-xs font-semibold text-navy-900 dark:text-white">{task.title}</p>
          <span className={`shrink-0 text-[10px] font-semibold ${overdue ? "text-rose-400" : d === 0 ? "text-amber-400" : "text-navy-500"}`}>
            {dueLabel || fmtDate(task.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${p.chip}`}>
            <span className={`h-1 w-1 rounded-full ${p.dot}`} />{p.label}
          </span>
          {linkedLabel && (
            <span className="truncate text-[11px] text-navy-500 dark:text-navy-400">→ {linkedLabel}</span>
          )}
        </div>
      </div>
      {isNew && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
      <FiChevronRight className="mt-2 h-3 w-3 shrink-0 text-navy-300 dark:text-navy-600" />
    </Link>
  );
}
