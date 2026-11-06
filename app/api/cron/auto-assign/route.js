// Vercel cron — runs daily at ~5:30 AM UK, BEFORE the 8am reminder digest
// so newly-created tasks land in that morning's push. This is the
// automation heart of the outreach system: every prospect due in the next
// 14 days, every stale reply, every unassigned job gets a real assigned
// task with a real owner, without anyone having to remember to check.
//
// Fair share:
//   • Round-robin picker keyed on agent-role users only (never engineers)
//   • "Same face" continuity — a prospect last contacted by agent X gets
//     its follow-up task assigned back to X so the client doesn't get
//     re-introduced every round
//   • Escalation kinds (stale quotes, unassigned jobs, monthly campaigns)
//     always go to admin
//
// Dedup:
//   • Any existing OPEN task linked to the same FSM record blocks a new
//     auto-task for that same record (so re-running the cron is idempotent)
//   • Monthly-campaign task blocked by a same-month same-segment source
//     tag (so 1st-of-month kicks in exactly once per month)
//
// Secured by CRON_SECRET, same pattern as the other cron routes.
import { NextResponse } from "next/server";
import { sendPush, webPushConfigured } from "@/lib/webPush";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { currentCycleDue, serviceLabel } from "@/lib/prospects";
import { runTaskSync } from "@/lib/taskSync";

const STATE_ID = "auto_assign_state";
const DUE_WITHIN_DAYS = 14;
const REPLY_STALE_HOURS = 24;
const QUOTE_STALE_DAYS = 3;
// Per-assignee daily cap on new auto-generated tasks. Escalations (jobs
// unassigned, replies) and monthly campaigns bypass this — those are
// time-critical. Prospect renewals get throttled so a big backlog rolls
// out over several days instead of arriving as a wall on day one.
const DAILY_CAP_PER_ASSIGNEE = 30;
const THROTTLED_KINDS = new Set(["prospect_renewal"]);
const CAMPAIGN_SEGMENTS = [
  { key: "residential", label: "residential landlord list" },
  { key: "commercial",  label: "commercial lead list" },
  { key: "engineers",   label: "engineer network list" },
];

function ukDateStr(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}
function ukMonthKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(now);
}
function ukDayOfMonth(now = new Date()) {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" }).format(now), 10);
}
function newId() {
  return "tk-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function isoDatePlusDays(now, days) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Round-robin picker weighted by lowest current load. Falls back to the
// admin id when no agents are available so escalation tasks always route.
function makePicker(agents, byAgentCounts, adminFallbackId) {
  if (!agents.length) return () => ({ id: adminFallbackId, name: null });
  const sortedAgents = [...agents].sort((a, b) => {
    const ca = byAgentCounts[a.id] || 0;
    const cb = byAgentCounts[b.id] || 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id); // deterministic tie-breaker
  });
  let cursor = 0;
  const counts = { ...byAgentCounts };
  return () => {
    const pick = sortedAgents[cursor % sortedAgents.length];
    counts[pick.id] = (counts[pick.id] || 0) + 1;
    cursor++;
    // Re-sort so the next call picks the newly-lowest.
    sortedAgents.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
    return { id: pick.id, name: pick.name };
  };
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const now = new Date();
  const force = new URL(request.url).searchParams.get("force") === "1";

  // ── Roster ─────────────────────────────────────────────────────────────
  const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const users = usersRes?.users || [];
  const normRole = (r) => (r === "admin" || r === "engineer" ? r : "agent");
  const agents = users
    .map((u) => ({ id: u.id, name: u.user_metadata?.name || u.email, role: normRole(u.app_metadata?.role) }))
    .filter((u) => u.role === "agent");
  const admins = users
    .map((u) => ({ id: u.id, name: u.user_metadata?.name || u.email, role: normRole(u.app_metadata?.role), created_at: u.created_at }))
    .filter((u) => u.role === "admin")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const adminId = admins[0]?.id || null;
  const adminName = admins[0]?.name || null;

  // ── FSM state ──────────────────────────────────────────────────────────
  const [prospectsRes, jobsRes, clientsRes, tasksRes, stateRes] = await Promise.all([
    supabaseAdmin.from("prospects").select("id,data"),
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("clients").select("id,data"),
    supabaseAdmin.from("tasks").select("id,data"),
    supabaseAdmin.from("app_settings").select("data").eq("id", STATE_ID).maybeSingle(),
  ]);

  const state = stateRes.data?.data || { byAgent: {}, lastRunAt: null, monthlyDoneFor: null };

  // ── AUTO-CLOSE SWEEP ────────────────────────────────────────────────
  // Before creating any new tasks, close any open ones whose underlying
  // work is definitely done: prospect moved to booked/dnc, job completed
  // or cancelled, engineer assigned to a job_unassigned task, or a
  // prospect_renewal task whose prospect was contacted since the task was
  // created. Stops the task list ballooning even if the client-side hooks
  // missed something (offline write, direct DB edit, etc).
  const prospectById = new Map((prospectsRes.data || []).map((r) => [r.id, r.data]));
  const jobById = new Map((jobsRes.data || []).map((r) => [r.id, r.data]));
  const autoClosed = [];
  const nowIsoEarly = new Date().toISOString();
  const nowMs = now.getTime();
  for (const row of tasksRes.data || []) {
    const t = row.data;
    if (!t || t.status === "done" || !t.linkedTo?.id) continue;
    let reason = null;

    if (t.linkedTo.kind === "prospect") {
      const p = prospectById.get(t.linkedTo.id);
      if (!p) continue;
      if (p.stage === "booked") reason = "Prospect booked — chase no longer needed.";
      else if (p.stage === "dnc") reason = "Prospect marked Do Not Contact — chase closed.";
      else if (t.source === "prospect_renewal" && p.lastContactedAt) {
        // If the prospect was contacted AFTER the task was created, treat
        // that outbound touch as fulfilling the chase.
        const taskAt = new Date(t.createdAt || 0).getTime();
        const contactAt = new Date(p.lastContactedAt).getTime();
        if (!isNaN(contactAt) && contactAt >= taskAt) {
          reason = "Prospect contacted since task was created — auto-completed.";
        }
      }
    }

    if (!reason && t.linkedTo.kind === "job") {
      const j = jobById.get(t.linkedTo.id);
      if (!j) continue;
      if (["completed", "paid", "cancelled"].includes(j.status)) {
        reason = `Job ${j.status} — task closed.`;
      } else if (t.source === "job_unassigned" && j.engineerId && j.engineerId !== "unassigned") {
        reason = "Engineer assigned — task closed.";
      } else if (t.source === "job_unconfirmed" && (j.engineerConfirmed || !j.engineerId || j.engineerId === "unassigned")) {
        reason = j.engineerConfirmed ? "Engineer confirmed — task closed." : "Engineer unassigned — task closed.";
      } else if (t.source === "reply") {
        // Reply task closes as soon as an outbound activity happens after
        // the reply that triggered it (i.e. someone answered).
        const lastIn = (j.activity || []).filter((a) => a.direction === "in").sort((a, b) => new Date(b.at) - new Date(a.at))[0];
        if (lastIn) {
          const answered = (j.activity || []).some((a) => a.direction !== "in" && new Date(a.at).getTime() > new Date(lastIn.at).getTime());
          if (answered) reason = "Client reply has been answered — task closed.";
        }
      } else if (t.source === "quote_followup" && j.status !== "quote") {
        reason = `Quote moved to ${j.status} — task closed.`;
      }
    }

    if (reason) {
      autoClosed.push({
        id: row.id,
        data: {
          ...t,
          status: "done",
          completedAt: nowIsoEarly,
          completedBy: { id: "system", name: "Auto-close" },
          updatedAt: nowIsoEarly,
          updates: [
            ...(t.updates || []),
            { at: nowIsoEarly, by: { id: "system", name: "Auto-close" }, kind: "status", text: reason },
          ],
        },
      });
    }
  }
  if (autoClosed.length) {
    await supabaseAdmin.from("tasks").upsert(autoClosed);
  }

  // Any open task already linked to an entity blocks a new one for that
  // same entity. Kills the risk of the cron piling identical follow-ups.
  // (Recomputed after auto-close so newly-closed tasks free their slot.)
  const closedIds = new Set(autoClosed.map((r) => r.id));
  const openLinkedKeys = new Set(
    (tasksRes.data || [])
      .filter((r) => !closedIds.has(r.id))
      .map((r) => r.data)
      .filter((t) => t && t.status !== "done" && t.linkedTo?.id)
      .map((t) => `${t.linkedTo.kind}:${t.linkedTo.id}`)
  );

  // Map prospect → last-contacted agent (for same-face continuity).
  const lastAgentForProspect = new Map();
  for (const row of prospectsRes.data || []) {
    const p = row.data;
    if (!p?.contactLog) continue;
    const lastOut = [...p.contactLog]
      .filter((e) => e && e.direction !== "in" && e.by)
      .sort((a, b) => new Date(b.at || b.ts || 0) - new Date(a.at || a.ts || 0))[0];
    if (!lastOut?.by) continue;
    const byId = typeof lastOut.by === "string" ? null : lastOut.by.id;
    if (byId && agents.some((a) => a.id === byId)) {
      lastAgentForProspect.set(row.id, { id: byId, name: agents.find((a) => a.id === byId)?.name });
    }
  }

  // Map job → last-actor agent (best-effort — jobs.activity entries carry
  // the agent's user in `by` for outbound emails/whatsapp/calls).
  const lastAgentForJob = new Map();
  for (const row of jobsRes.data || []) {
    const j = row.data;
    if (!j?.activity) continue;
    const lastOut = [...j.activity]
      .filter((e) => e && e.direction !== "in" && e.by)
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0];
    if (!lastOut?.by) continue;
    const byId = typeof lastOut.by === "string" ? null : lastOut.by.id;
    if (byId && agents.some((a) => a.id === byId)) {
      lastAgentForJob.set(row.id, { id: byId, name: agents.find((a) => a.id === byId)?.name });
    }
  }

  const pickAgent = makePicker(agents, state.byAgent || {}, adminId);
  const chosen = { byAgent: { ...(state.byAgent || {}) } };
  const bump = (id) => { if (id) chosen.byAgent[id] = (chosen.byAgent[id] || 0) + 1; };

  // Per-assignee, per-UK-day cap. Resets whenever the date rolls over so
  // yesterday's cap doesn't bleed into today.
  const todayKey = ukDateStr(now);
  const dailyState = state.dailyByAgent?.date === todayKey
    ? { date: todayKey, counts: { ...(state.dailyByAgent.counts || {}) } }
    : { date: todayKey, counts: {} };
  let throttled = 0;

  const created = [];
  const nowIso = new Date().toISOString();

  const makeTask = (spec) => {
    // Throttle: prospect renewals honor the daily-per-assignee cap so a
    // huge backlog rolls out over several days. Urgent escalations
    // (unassigned jobs, replies, quotes, monthly campaigns) bypass.
    if (spec.assigneeId && THROTTLED_KINDS.has(spec.source)) {
      const cur = dailyState.counts[spec.assigneeId] || 0;
      if (cur >= DAILY_CAP_PER_ASSIGNEE) { throttled++; return null; }
      dailyState.counts[spec.assigneeId] = cur + 1;
    }
    const task = {
      id: newId(),
      title: spec.title,
      notes: spec.notes || "",
      assigneeId: spec.assigneeId,
      assigneeName: spec.assigneeName || (spec.assigneeId ? users.find((u) => u.id === spec.assigneeId)?.user_metadata?.name || users.find((u) => u.id === spec.assigneeId)?.email : "Everyone"),
      dueDate: spec.dueDate,
      priority: spec.priority,
      reminderCadence: spec.cadence,
      linkedTo: spec.linkedTo || null,
      status: "open",
      source: spec.source,
      autoAssign: true,
      createdBy: { id: "system", name: "Auto-assign" },
      createdAt: nowIso,
      updatedAt: nowIso,
      updates: [{
        at: nowIso,
        by: { id: "system", name: "Auto-assign" },
        kind: "status",
        text: spec.reason || "Auto-assigned by the daily automation.",
      }],
    };
    created.push(task);
    if (spec.linkedTo?.id) openLinkedKeys.add(`${spec.linkedTo.kind}:${spec.linkedTo.id}`);
    bump(spec.assigneeId);
    return task;
  };

  const clientsById = new Map((clientsRes.data || []).map((r) => [r.id, r.data]));

  // ── 1. Renewal outreach — ONE task a day ───────────────────────────────
  // How outreach actually runs: the month's emails go out in daily batches
  // from Campaigns, then a handful of prospects are chased on WhatsApp each
  // day. That is one piece of work a day, so it is one task a day — not a
  // task (and three reminders) per prospect, which is what buried every
  // other notification under "Chase X — renewal".
  //
  // The old per-prospect tasks still open are closed here, once.
  const staleRenewals = (tasksRes.data || []).filter((r) => r.data && r.data.status !== "done" && r.data.source === "prospect_renewal" && !closedIds.has(r.id));
  for (let i = 0; i < staleRenewals.length; i += 200) {
    await supabaseAdmin.from("tasks").upsert(staleRenewals.slice(i, i + 200).map((r) => ({
      id: r.id,
      data: {
        ...r.data, status: "done", completedAt: nowIso, completedBy: { id: "system", name: "Auto-close" }, updatedAt: nowIso,
        updates: [...(r.data.updates || []), { at: nowIso, by: { id: "system", name: "Auto-close" }, kind: "status", text: "Renewal outreach is now one daily task — closed." }],
      },
    })));
  }
  const dueProspects = (prospectsRes.data || []).filter((row) => {
    const p = row.data;
    if (!p || p.stage === "dnc" || p.stage === "booked") return false;
    const due = currentCycleDue(p, now);
    return due && Math.ceil((due - now) / 86400_000) <= DUE_WITHIN_DAYS;
  }).length;
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(now);
  const outreachOpen = (tasksRes.data || []).some((r) => r.data && r.data.status !== "done" && r.data.source === "outreach_daily");
  if (dueProspects > 0 && !["Sat", "Sun"].includes(weekday) && !outreachOpen && state.outreachDate !== todayKey) {
    const owner = agents[0] ? pickAgent() : { id: null, name: "Everyone" };
    makeTask({
      title: "Renewal outreach — today's WhatsApp chases",
      notes: `${dueProspects} prospect${dueProspects === 1 ? "" : "s"} due or overdue. Chase today's batch (10–15) from Prospects and log what each said.`,
      assigneeId: owner.id,
      assigneeName: owner.name,
      dueDate: isoDatePlusDays(now, 0),
      priority: "normal",
      cadence: "none",
      linkedTo: null,
      source: "outreach_daily",
      reason: "One outreach task per working day.",
    });
  }

  // ── 2. Stale unread client replies (>24h since inbound) ────────────────
  // Job tasks (reply to the client, chase the quote, assign or confirm an
  // engineer, mark done, invoice, chase payment, send the certificate) are
  // no longer written here. They come from lib/taskEngine.js, which reads
  // every job with the same rules as the job page's "Next step" — see
  // runTaskSync at the end of this run.

  const dayOfMonth = ukDayOfMonth(now);
  const monthKey = ukMonthKey(now);
  const alreadyDoneThisMonth = state.monthlyDoneFor === monthKey;
  if (adminId && (dayOfMonth === 1 || force) && !alreadyDoneThisMonth) {
    for (const seg of CAMPAIGN_SEGMENTS) {
      makeTask({
        title: `Send ${monthKey} campaign — ${seg.label}`,
        notes: `Start of month: bulk-email the ${seg.label} for renewal outreach.`,
        // An agent sends it (admins only supervise); none → everyone.
        ...(agents[0] ? (({ id, name }) => ({ assigneeId: id, assigneeName: name }))(pickAgent()) : { assigneeId: null, assigneeName: "Everyone" }),
        dueDate: isoDatePlusDays(now, 3),
        priority: "urgent",
        cadence: "aggressive",
        linkedTo: null,
        source: "monthly_campaign",
        reason: "Auto-created on the 1st of the month.",
      });
    }
  }

  // Persist all created tasks (batched upsert).
  if (created.length > 0) {
    await supabaseAdmin.from("tasks").upsert(created.map((t) => ({ id: t.id, data: t })));
  }

  // Tell each assignee on their phone — ONE summary push per person per run,
  // never one per task (a push per item is what made notifications feel like
  // spam before). Tasks made here used to arrive silently; the only push an
  // automated task ever got was the reminder cron, which itself wasn't firing.
  let pushed = 0;
  if (created.length && webPushConfigured) {
    const byAssignee = new Map();
    for (const t of created) {
      if (!t.assigneeId) continue;
      if (!byAssignee.has(t.assigneeId)) byAssignee.set(t.assigneeId, []);
      byAssignee.get(t.assigneeId).push(t);
    }
    if (byAssignee.size) {
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth,user_id")
        .in("user_id", [...byAssignee.keys()]);
      const dead = [];
      for (const sub of subs || []) {
        const mine = byAssignee.get(sub.user_id) || [];
        if (!mine.length) continue;
        const urgent = mine.filter((t) => t.priority === "urgent").length;
        const result = await sendPush(sub, {
          title: mine.length === 1
            ? (urgent ? "URGENT task assigned to you" : "New task assigned to you")
            : `${mine.length} new tasks for you${urgent ? ` · ${urgent} urgent` : ""}`,
          body: mine.length === 1 ? mine[0].title : mine.slice(0, 3).map((t) => t.title).join(" · "),
          url: "/team",
        });
        if (result.ok) pushed++;
        if (result.gone) dead.push(sub.id);
      }
      if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
    }
  }

  // Update round-robin state.
  await supabaseAdmin.from("app_settings").upsert({
    id: STATE_ID,
    data: {
      byAgent: chosen.byAgent,
      dailyByAgent: dailyState,
      lastRunAt: nowIso,
      monthlyDoneFor: (adminId && dayOfMonth === 1) ? monthKey : state.monthlyDoneFor,
      outreachDate: todayKey,
    },
  });

  // Job tasks: the morning backstop for the live sync.
  const jobTasks = await runTaskSync({ force: true });

  return NextResponse.json({
    ok: true,
    jobTasks,
    created: created.length,
    devicesNotified: pushed,
    autoClosed: autoClosed.length,
    throttled,
    dailyCap: DAILY_CAP_PER_ASSIGNEE,
    byKind: created.reduce((m, t) => { m[t.source] = (m[t.source] || 0) + 1; return m; }, {}),
    byAssignee: created.reduce((m, t) => { const k = t.assigneeName || t.assigneeId || "unassigned"; m[k] = (m[k] || 0) + 1; return m; }, {}),
    agentsAvailable: agents.length,
    adminId,
    dayOfMonth,
    monthlyCampaignFired: adminId && (dayOfMonth === 1 || force) && !alreadyDoneThisMonth,
  });
}
