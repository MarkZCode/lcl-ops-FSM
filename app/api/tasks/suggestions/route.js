// Auto-generated task suggestions — surfaced on the Team → Board view so
// the user can one-click promote FSM signals into real assigned tasks
// instead of hand-typing them. Four kinds:
//   • prospect_renewal — uncontacted prospects overdue or due within 7 days
//   • reply            — client replies received in the last 3 days
//   • quote_followup   — quote-status jobs untouched in >3 days
//   • job_unassigned   — scheduled/in-progress jobs with no engineer assigned
//
// Deduped against the existing tasks table so a suggestion the user already
// converted (or explicitly dismissed via a matching manual task) doesn't
// keep showing up.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentCycleDue, serviceLabel } from "@/lib/prospects";

const CONTACT_COOLDOWN_DAYS = 3;
const DUE_WITHIN_DAYS = 7;
const REPLY_LOOKBACK_HOURS = 72;
const QUOTE_STALE_DAYS = 3;

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Suggestions are admin-only — agents just see the tasks they've been
  // assigned, not the raw FSM-signal queue that admin uses to triage.
  if (user.app_metadata?.role !== "admin") {
    return NextResponse.json({ suggestions: [], total: 0, adminOnly: true });
  }
  if (!supabaseAdmin) return NextResponse.json({ suggestions: [] });

  const now = new Date();
  const [prospectRows, jobRows, clientRows, existingTaskRows] = await Promise.all([
    supabaseAdmin.from("prospects").select("id,data").limit(2000),
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("clients").select("id,data"),
    supabaseAdmin.from("tasks").select("data"),
  ]);

  // Any task already linked to entity X blocks a suggestion for X (unless
  // that task is already done, in which case the follow-up is fair game
  // again).
  const linkedOpenKeys = new Set(
    (existingTaskRows.data || [])
      .map((r) => r.data)
      .filter((t) => t && t.status !== "done" && t.linkedTo?.id)
      .map((t) => `${t.linkedTo.kind}:${t.linkedTo.id}`)
  );

  const suggestions = [];

  // ── Prospects due for renewal ────────────────────────────────────────────
  const staleCutoff = now.getTime() - CONTACT_COOLDOWN_DAYS * 86400_000;
  for (const row of prospectRows.data || []) {
    const p = row.data;
    if (!p || p.stage === "dnc" || p.stage === "booked") continue;
    if (p.lastContactedAt && new Date(p.lastContactedAt).getTime() > staleCutoff) continue;
    const due = currentCycleDue(p, now);
    if (!due) continue;
    const daysLeft = Math.ceil((due - now) / 86400000);
    if (daysLeft > DUE_WITHIN_DAYS) continue;
    if (linkedOpenKeys.has(`prospect:${row.id}`)) continue;

    const name = p.nameOnCert || p.ownerName || "Prospect";
    const svcs = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];
    const svcText = svcs.filter((s) => s !== "CONFIRM").map(serviceLabel).join(", ") || "compliance cert";
    suggestions.push({
      kind: "prospect_renewal",
      priority: daysLeft < 0 ? "urgent" : "normal",
      title: `Chase ${name} — ${svcText} renewal`,
      subtitle: daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d until due`,
      dueOffsetDays: Math.max(0, daysLeft),
      linkedTo: { kind: "prospect", id: row.id, label: name },
      sortKey: daysLeft,
    });
  }

  // ── Unread inbound replies (last 3 days) ─────────────────────────────────
  const clientsById = new Map((clientRows.data || []).map((r) => [r.id, r.data]));
  const replyCutoff = now.getTime() - REPLY_LOOKBACK_HOURS * 3600_000;
  for (const row of jobRows.data || []) {
    const job = row.data;
    if (!job) continue;
    const reply = (job.activity || [])
      .filter((a) => a.direction === "in" && new Date(a.at).getTime() >= replyCutoff)
      .sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    if (!reply) continue;
    if (linkedOpenKeys.has(`job:${row.id}`)) continue;
    const client = clientsById.get(job.clientId);
    const hrs = Math.max(0, Math.floor((now.getTime() - new Date(reply.at).getTime()) / 3600_000));
    suggestions.push({
      kind: "reply",
      priority: hrs > 24 ? "urgent" : "normal",
      title: `Reply from ${client?.name || "client"} on ${job.id}`,
      subtitle: hrs < 1 ? "Just now" : hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`,
      dueOffsetDays: 0,
      linkedTo: { kind: "job", id: row.id, label: `${job.id} · ${client?.name || ""}`.trim() },
      sortKey: -hrs,
    });
  }

  // ── Stale quotes (>3 days since last activity) ───────────────────────────
  const quoteStaleCutoff = now.getTime() - QUOTE_STALE_DAYS * 86400_000;
  for (const row of jobRows.data || []) {
    const job = row.data;
    if (!job || job.status !== "quote") continue;
    if (linkedOpenKeys.has(`job:${row.id}`)) continue;
    const lastActivity = (job.activity || [])
      .map((a) => new Date(a.at).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => b - a)[0] || new Date(job.createdAt || 0).getTime();
    if (!lastActivity || lastActivity > quoteStaleCutoff) continue;
    const client = clientsById.get(job.clientId);
    const daysSince = Math.floor((now.getTime() - lastActivity) / 86400_000);
    suggestions.push({
      kind: "quote_followup",
      priority: daysSince > 7 ? "urgent" : "normal",
      title: `Follow up quote ${job.id}${client?.name ? ` · ${client.name}` : ""}`,
      subtitle: `Quote sat ${daysSince}d with no activity`,
      dueOffsetDays: 0,
      linkedTo: { kind: "job", id: row.id, label: `${job.id} · ${client?.name || ""}`.trim() },
      sortKey: -daysSince,
    });
  }

  // ── Booked/scheduled jobs without an assigned engineer ────────────────────
  for (const row of jobRows.data || []) {
    const job = row.data;
    if (!job) continue;
    if (!["scheduled", "in_progress"].includes(job.status)) continue;
    if (job.engineerId && job.engineerId !== "unassigned") continue;
    if (linkedOpenKeys.has(`job:${row.id}`)) continue;
    const client = clientsById.get(job.clientId);
    suggestions.push({
      kind: "job_unassigned",
      priority: "urgent",
      title: `Assign engineer to ${job.id}`,
      subtitle: `${job.status === "scheduled" ? "Scheduled" : "In progress"} · no engineer set`,
      dueOffsetDays: 0,
      linkedTo: { kind: "job", id: row.id, label: `${job.id} · ${client?.name || ""}`.trim() },
      sortKey: -1000,
    });
  }

  // Urgent first, then by their internal sortKey (overdue-most / most stale first).
  suggestions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    return a.sortKey - b.sortKey;
  });

  return NextResponse.json({
    suggestions: suggestions.slice(0, 40),
    total: suggestions.length,
  });
}
