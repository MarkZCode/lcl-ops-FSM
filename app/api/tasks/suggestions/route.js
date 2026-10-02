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

  // Job tasks (reply, chase the quote, assign an engineer…) are NOT
  // suggested here any more. They are created automatically, with the same
  // rules as the job page's "Next step" (lib/taskEngine.js) — a second,
  // simpler rule set here was suggesting chases the notes said not to make.

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
