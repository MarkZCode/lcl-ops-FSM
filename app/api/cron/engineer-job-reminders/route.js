// Vercel cron — runs each morning (after job-day-start, before auto-assign)
// and creates an aggressive-cadence reminder task for every job scheduled
// TODAY that has a real engineer assigned. This exists because a confirmed
// job can still get forgotten: an engineer can confirm days in advance and
// still need a same-day nudge, and the admin can forget to chase them.
//
// Two-layer reminder, matching how the FSM already pushes tasks:
//   • If the assigned engineer has a login whose email matches their
//     engineer record, the task is assigned directly to them — they get
//     pushed at the existing 8am / 2pm / 6pm task-reminder slots
//     (aggressive cadence) via /api/cron/task-reminders, same as any task.
//   • Either way, admin also gets a task naming the engineer and the job,
//     so the FSM is actively "urging" a human reminder rather than relying
//     on someone remembering — this is the part that was missing when a
//     confirmed job got cancelled because nobody chased the engineer.
//
// Idempotent: dedupes per job per UK-day via `forDate` on the task, so
// re-running (or a job spanning statuses) never spams duplicates. Reuses
// the auto-close sweep in /api/cron/auto-assign (source-agnostic on
// completed/paid/cancelled jobs) to clear these once the job is done.
//
// Secured by CRON_SECRET, same pattern as the other cron routes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serviceName, isAddonCode } from "@/lib/format";

function ukDateStr(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
function ukTimeStr(d) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
function newId() {
  return "tk-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const now = new Date();
  const todayKey = ukDateStr(now);
  const force = new URL(request.url).searchParams.get("force") === "1";

  const [{ data: jobRows }, { data: clientRows }, { data: engineerRows }, { data: taskRows }, usersRes] = await Promise.all([
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("clients").select("id,data"),
    supabaseAdmin.from("engineers").select("id,data"),
    supabaseAdmin.from("tasks").select("id,data"),
    supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const users = usersRes?.data?.users || [];
  const normRole = (r) => (r === "admin" || r === "engineer" ? r : "agent");
  const admins = users
    .map((u) => ({ id: u.id, name: u.user_metadata?.name || u.email, role: normRole(u.app_metadata?.role), created_at: u.created_at }))
    .filter((u) => u.role === "admin")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  // The office nudge goes to an agent (admins supervise, they don't get
  // routine tasks). No agent at all → open to everyone.
  const agents = users
    .filter((u) => u.app_metadata?.role === "agent")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const officeId = agents[0]?.id || null;
  const officeName = agents[0] ? agents[0].user_metadata?.name || agents[0].email : "Everyone";

  // Engineer record → matching login, by email (same match rule as lib/scope.js).
  const engineerById = new Map((engineerRows || []).map((r) => [r.id, r.data]));
  const userIdByEmail = new Map(users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));
  const clientsById = new Map((clientRows || []).map((r) => [r.id, r.data]));

  const openJobReminderDates = new Set(
    (taskRows || [])
      .map((r) => r.data)
      .filter((t) => t && t.status !== "done" && t.source === "job_reminder" && t.linkedTo?.kind === "job")
      .map((t) => `${t.linkedTo.id}:${t.forDate}`)
  );

  const created = [];
  const nowIso = now.toISOString();

  for (const row of jobRows || []) {
    const job = row.data;
    if (!job || !job.scheduledAt) continue;
    if (!["scheduled", "in_progress"].includes(job.status)) continue;
    if (ukDateStr(new Date(job.scheduledAt)) !== todayKey) continue;
    if (!job.engineerId || job.engineerId === "unassigned") continue;
    const dedupeKey = `${row.id}:${todayKey}`;
    if (openJobReminderDates.has(dedupeKey) && !force) continue;

    const engineer = engineerById.get(job.engineerId);
    const engineerName = engineer?.name || "the assigned engineer";
    const engineerUserId = engineer?.email ? userIdByEmail.get(engineer.email.toLowerCase()) : null;
    const client = clientsById.get(job.clientId);
    const property = client?.properties?.find((p) => p.id === job.propertyId);
    const service = (job.services || []).filter((c) => !isAddonCode(c)).map(serviceName).join(", ") || "job";
    const time = ukTimeStr(new Date(job.scheduledAt));
    const addressLine = property ? `${property.label}, ${property.postcode}` : "";

    // Layer 1 — the engineer themself, if their login is known, so they get
    // pushed directly via the existing aggressive-cadence task reminders.
    if (engineerUserId) {
      created.push({
        id: newId(),
        title: `Today's job at ${time} — ${service}${client?.name ? ` for ${client.name}` : ""}`,
        notes: addressLine,
        assigneeId: engineerUserId,
        assigneeName: engineerName,
        dueDate: todayKey,
        priority: "urgent",
        reminderCadence: "aggressive",
        linkedTo: { kind: "job", id: row.id, label: `${row.id} · ${client?.name || ""}`.trim() },
        status: "open",
        source: "job_reminder",
        forDate: todayKey,
        autoAssign: true,
        createdBy: { id: "system", name: "Job reminders" },
        createdAt: nowIso,
        updatedAt: nowIso,
        updates: [{
          at: nowIso, by: { id: "system", name: "Job reminders" }, kind: "status",
          text: "Auto-created — job scheduled for today.",
        }],
      });
    }

    // Layer 2 — always also nudge the office (an agent) by name, so the FSM actively urges
    // a human check-in even if the engineer's own push never lands.
    {
      const titlePrefix = job.engineerConfirmed ? "" : "⚠ NEVER CONFIRMED — ";
      created.push({
        id: newId(),
        title: `${titlePrefix}Remind ${engineerName} — today's job at ${time}${client?.name ? ` · ${client.name}` : ""}`,
        notes: `${addressLine ? `${addressLine} · ` : ""}${service}${!engineerUserId ? " · engineer has no login on file — call/message them directly" : ""}${!job.engineerConfirmed ? " · this engineer never marked the job confirmed" : ""}`,
        assigneeId: officeId,
        assigneeName: officeName,
        dueDate: todayKey,
        priority: "urgent",
        reminderCadence: "aggressive",
        linkedTo: { kind: "job", id: row.id, label: `${row.id} · ${client?.name || ""}`.trim() },
        status: "open",
        source: "job_reminder",
        forDate: todayKey,
        autoAssign: true,
        createdBy: { id: "system", name: "Job reminders" },
        createdAt: nowIso,
        updatedAt: nowIso,
        updates: [{
          at: nowIso, by: { id: "system", name: "Job reminders" }, kind: "status",
          text: "Auto-created — make sure the engineer is actually reminded about today's job.",
        }],
      });
    }
  }

  if (created.length) {
    await supabaseAdmin.from("tasks").upsert(created.map((t) => ({ id: t.id, data: t })));
  }

  return NextResponse.json({
    ok: true,
    created: created.length,
    jobsToday: created.reduce((set, t) => set.add(t.linkedTo.id), new Set()).size,
  });
}
