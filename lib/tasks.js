// Task-management shared model, constants and helpers. Used across the
// unified /team workspace (Board · List · Detail · NewTaskModal) and the
// server-side reminder crons so priority/status/cadence handling stays in
// one place.

export const PRIORITIES = [
  { key: "low",    label: "Low",    dot: "bg-slate-400",  chip: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300" },
  { key: "normal", label: "Normal", dot: "bg-blue-500",   chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  { key: "urgent", label: "Urgent", dot: "bg-rose-500",   chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" },
];

export const STATUSES = [
  { key: "open",        label: "Open",        chip: "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300",     accent: "border-navy-300" },
  { key: "in_progress", label: "In progress", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", accent: "border-amber-300" },
  { key: "done",        label: "Done",        chip: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300", accent: "border-brand-300" },
];

// Reminder cadence for the daily digest + midday/evening crons:
//   once       — instant assignment push, then silent
//   daily      — daily 8am push while overdue or due today
//   aggressive — 8am + 2pm + 6pm on overdue days (for time-critical work)
export const CADENCES = [
  { key: "once",       label: "One notification",       desc: "Instant push when assigned. No follow-ups." },
  { key: "daily",      label: "Daily until done",       desc: "One reminder each morning while overdue." },
  { key: "aggressive", label: "Aggressive (3× / day)",  desc: "Morning, midday, and evening reminders while overdue." },
];

// Entity kinds a task can be linked to. `label` is what shows in the picker
// and on cards; `path` builds a deep link back into the relevant FSM page.
// A task id can optionally be threaded through so the destination page
// shows a "Complete task" banner (see TaskCompletionBanner).
export const LINK_KINDS = {
  prospect: {
    label: "Prospect",
    path: (id, taskId) => `/prospects?open=${encodeURIComponent(id)}${taskId ? `&task=${encodeURIComponent(taskId)}` : ""}`,
  },
  client: {
    label: "Client",
    path: (id, taskId) => `/clients/${encodeURIComponent(id)}${taskId ? `?task=${encodeURIComponent(taskId)}` : ""}`,
  },
  job: {
    label: "Job",
    path: (id, taskId) => `/jobs/${encodeURIComponent(id)}${taskId ? `?task=${encodeURIComponent(taskId)}` : ""}`,
  },
  engineer: {
    label: "Engineer",
    path: (id, taskId) => `/engineers?open=${encodeURIComponent(id)}${taskId ? `&task=${encodeURIComponent(taskId)}` : ""}`,
  },
};

// The URL a push notification should open. If the task links to an FSM
// record, jump straight to that record (with the task threaded through)
// so the assignee can act instead of first opening the Team board.
export function taskDeepLink(task) {
  if (!task) return "/team?tab=board";
  if (task.linkedTo && LINK_KINDS[task.linkedTo.kind]) {
    return LINK_KINDS[task.linkedTo.kind].path(task.linkedTo.id, task.id);
  }
  return `/team?tab=board&task=${encodeURIComponent(task.id)}`;
}

// Source of a task — "manual" (created via New task modal) or one of the
// auto-suggestion kinds surfaced by /api/tasks/suggestions. Kept on the row
// so the Board can show a badge and reports can distinguish organic vs.
// system-suggested work.
export const SOURCE_LABELS = {
  manual: "Manual",
  prospect_renewal: "Renewal",
  reply: "Reply",
  quote_followup: "Quote follow-up",
  job_unassigned: "Unassigned job",
  job_unconfirmed: "Unconfirmed engineer",
  job_reminder: "Job reminder",
  next_reply: "Reply to client",
  next_close: "Mark done",
  next_book: "Book / assign",
  next_confirm: "Engineer to confirm",
  next_quote: "Quote",
  next_tell_client: "Tell the client",
  next_invoice: "Invoice",
  next_payment: "Chase payment",
  next_certificate: "Certificate",
};

export function priorityMeta(key) { return PRIORITIES.find((p) => p.key === key) || PRIORITIES[1]; }
export function statusMeta(key)   { return STATUSES.find((s) => s.key === key) || STATUSES[0]; }
export function cadenceMeta(key)  { return CADENCES.find((c) => c.key === key) || CADENCES[0]; }

// Days between today and the task's due date (positive = future, negative =
// overdue, null when no due date is set). Uses end-of-day so a task due
// today isn't marked overdue until midnight.
export function daysUntilDue(task, now = new Date()) {
  if (!task?.dueDate) return null;
  const due = new Date(task.dueDate + "T23:59:59");
  return Math.ceil((due - now) / 86400000);
}

// Row urgency class used to accent overdue/due-soon cards. Tasks marked
// done get no accent regardless of their date.
export function urgencyClass(task) {
  if (task.status === "done") return "";
  const d = daysUntilDue(task);
  if (d == null) return "";
  if (d < 0) return "border-rose-300 bg-rose-50/40 dark:border-rose-500/40 dark:bg-rose-500/5";
  if (d <= 2) return "border-amber-300 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-500/5";
  return "";
}

// Task list sorter: urgent-first, then overdue-first by due date, then
// most-recently-updated. Called from both Board and List views.
export function sortTasks(tasks) {
  const priRank = { urgent: 0, normal: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    const pa = priRank[a.priority] ?? 1, pb = priRank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

// Snooze options offered on the task detail panel + kebab menu.
export const SNOOZE_OPTIONS = [
  { key: 1, label: "Tomorrow" },
  { key: 3, label: "In 3 days" },
  { key: 7, label: "Next week" },
];

// Push a task's dueDate `days` days forward from today and clear the
// per-slot reminder guard so the next reminder cron treats it fresh.
// Returns a new task object; caller persists it via saveTask.
export function snoozeTask(task, days, actor) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date().toISOString();
  return {
    ...task,
    dueDate: iso,
    lastReminderSlot: null,
    updatedAt: now,
    updates: [
      ...(task.updates || []),
      { at: now, by: actor || { id: "system", name: "System" }, kind: "status", text: `Snoozed to ${iso} (${days === 1 ? "tomorrow" : days === 7 ? "next week" : `+${days}d`})` },
    ],
  };
}

// Client-side auto-close — used by the store when a prospect or job
// progresses in a way that fulfils its linked task, so the assignee
// sees the row disappear instantly instead of waiting for the next
// 5:30am cron sweep to catch it. Silent no-op when supabase isn't wired.
export async function closeLinkedTasks({ supabase, kind, id, reason, actor, sources }) {
  if (!supabase || !kind || !id) return { closed: 0 };
  const { data: rows } = await supabase.from("tasks").select("id,data");
  const now = new Date().toISOString();
  const targets = (rows || [])
    .map((r) => r.data)
    .filter((t) => t && t.status !== "done"
      && t.linkedTo?.kind === kind
      && t.linkedTo?.id === id
      && (!sources || sources.includes(t.source)));
  if (!targets.length) return { closed: 0 };
  const patches = targets.map((t) => ({
    id: t.id,
    data: {
      ...t,
      status: "done",
      completedAt: now,
      completedBy: actor || { id: "system", name: "Auto-close" },
      updatedAt: now,
      updates: [
        ...(t.updates || []),
        { at: now, by: actor || { id: "system", name: "Auto-close" }, kind: "status", text: reason || "Auto-closed by linked-entity progress." },
      ],
    },
  }));
  await supabase.from("tasks").upsert(patches);
  return { closed: patches.length };
}

// Filter predicate — used by both views. `user` is the current viewer, so
// `assignee: "mine"` can compare against their id.
export function filterTasks(tasks, filters, userId) {
  return tasks.filter((t) => {
    if (filters.status && filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.priority && filters.priority !== "all" && t.priority !== filters.priority) return false;
    if (filters.assignee === "mine" && t.assigneeId !== userId && t.assigneeId) return false;
    if (filters.assignee === "unassigned" && t.assigneeId) return false;
    if (filters.assignee && filters.assignee !== "mine" && filters.assignee !== "unassigned" && filters.assignee !== "all") {
      if (t.assigneeId !== filters.assignee) return false;
    }
    if (filters.linkKind && filters.linkKind !== "all") {
      if ((t.linkedTo?.kind || "none") !== filters.linkKind) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = `${t.title || ""} ${t.notes || ""} ${t.linkedTo?.label || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
