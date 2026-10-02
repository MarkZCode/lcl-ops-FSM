"use client";

// Shared notification-item builder — used by both the bell dropdown and the
// full-page /notifications inbox so a fix to the "kinds" or the sort order
// lands in both surfaces in one edit. Each item is normalized to a plain
// shape the UI can render without knowing whether it came from a task or a
// client reply.

import { daysUntilDue, taskDeepLink } from "./tasks";

export const KINDS = {
  task_overdue:  { label: "Overdue task",     tone: "rose",   icon: "alert",   category: "tasks" },
  task_due:      { label: "Due today",        tone: "amber",  icon: "clock",   category: "tasks" },
  task_upcoming: { label: "Assigned to you",  tone: "blue",   icon: "user",    category: "tasks" },
  task_team:     { label: "Team task",        tone: "violet", icon: "users",   category: "tasks" },
  reply:         { label: "Client reply",     tone: "blue",   icon: "reply",   category: "replies" },
};

// Build the full flat list of notifications for the given user.
// tasks: array of task rows (from supabase.tasks)
// jobs, clients: from the store, used to expand inbound activity into
// "client reply" notification items.
export function buildNotifications({ tasks, jobs, clients, userId, now = new Date() }) {
  const items = [];

  // ── Tasks ────────────────────────────────────────────────────────────
  for (const t of tasks) {
    if (!t || t.status === "done") continue;
    // Per-prospect renewal chases are retired (one outreach task a day now).
    if (t.source === "prospect_renewal") continue;
    const isMine = t.assigneeId === userId;
    const isEveryone = !t.assigneeId;
    if (!isMine && !isEveryone) continue; // never surface other people's assignments

    if (isMine) {
      const d = daysUntilDue(t, now);
      // A task a PERSON gave you outranks one the system raised.
      const byPerson = t.createdBy?.id && t.createdBy.id !== "system" && t.createdBy.id !== userId;
      let kind = "task_upcoming";
      if (d != null && d < 0) kind = "task_overdue";
      else if (d === 0 && !byPerson) kind = "task_due";
      items.push({
        id: `${kind}-${t.id}`,
        kind,
        at: t.updatedAt || t.createdAt,
        title: t.title,
        subtitle: byPerson ? `From ${t.createdBy.name || "a colleague"}${t.notes ? ` — ${t.notes}` : ""}` : t.linkedTo?.label || t.notes || "",
        url: taskDeepLink(t),
        task: t,
        rank: byPerson ? 0 : kind === "task_overdue" ? 1 : 2,
      });
    } else if (isEveryone) {
      // Only surface recently-created "everyone" tasks (last 14 days) so
      // ancient team-wide items don't clog the inbox.
      const age = now.getTime() - new Date(t.createdAt || 0).getTime();
      if (age > 14 * 86400_000) continue;
      items.push({
        id: `task_team-${t.id}`,
        kind: "task_team",
        at: t.createdAt,
        title: t.title,
        subtitle: t.linkedTo?.label || t.notes || "",
        url: taskDeepLink(t),
        task: t,
      });
    }
  }

  // ── Client replies ───────────────────────────────────────────────────
  const clientById = new Map((clients || []).map((c) => [c.id, c]));
  for (const job of jobs || []) {
    const client = clientById.get(job.clientId);
    for (const a of job.activity || []) {
      if (a.direction !== "in") continue;
      // Recent ones only — a reply from last month is history, not news.
      if (now.getTime() - new Date(a.at || 0).getTime() > 14 * 86400_000) continue;
      items.push({
        id: a.id || `reply-${job.id}-${a.at}`,
        kind: "reply",
        at: a.at,
        title: client?.name || "Client",
        subtitle: (a.detail || "").split("\n")[0]?.slice(0, 160) || job.id,
        url: `/jobs/${job.id}`,
        jobId: job.id,
        rank: 1,
      });
    }
  }

  // What a person asked of you first, then client replies and overdue work,
  // then the rest — newest first within each.
  items.sort((a, b) => (a.rank ?? 2) - (b.rank ?? 2) || new Date(b.at || 0) - new Date(a.at || 0));
  return items;
}
