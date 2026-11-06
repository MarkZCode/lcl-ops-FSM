// Vercel cron job — fires once daily at 07:30 UTC (~8am UK, adjusting for
// GMT/BST) per vercel.json. Bundles three things into a push notification:
//   1. Prospects overdue or due within 7 days who haven't been contacted
//      in the last 3 days (renewal outreach reminders).
//   2. Client replies (email/WhatsApp) received in the last 24h.
//   3. Each device's own overdue/due-today Tasks assignments (personalized
//      per user — the first two parts are identical for everyone).
// Secured by CRON_SECRET, same pattern as /api/cron/gmail-watch. The
// once-per-day dedup guard (app_settings) is a safety net against the cron
// double-firing or being hit manually twice — pass ?force=1 to bypass it
// (and re-send) when testing.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, webPushConfigured } from "@/lib/webPush";
import { currentCycleDue, serviceLabel } from "@/lib/prospects";

const DIGEST_STATE_ID = "push_digest_state";
const CONTACT_COOLDOWN_DAYS = 3; // don't re-nag a prospect contacted this recently
const DUE_WITHIN_DAYS = 7;
const REPLY_LOOKBACK_HOURS = 26; // slight overlap so a delayed cron run can't drop one
const DISPLAY_CAP = 50; // headline reads "50+" past this so a big backlog doesn't look like a typo

function ukDateStr(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now); // YYYY-MM-DD
}

async function findUrgentProspects(now) {
  const { data: rows } = await supabaseAdmin.from("prospects").select("id,data");
  const out = [];
  for (const row of rows || []) {
    const p = row.data;
    if (!p || p.stage === "dnc" || p.stage === "booked") continue;
    const due = currentCycleDue(p, now);
    if (!due) continue;
    const daysLeft = Math.ceil((due - now) / 86400000);
    if (daysLeft > DUE_WITHIN_DAYS) continue;
    if (p.lastContactedAt) {
      const sinceContact = (now - new Date(p.lastContactedAt)) / 86400000;
      if (sinceContact < CONTACT_COOLDOWN_DAYS) continue;
    }
    const svcs = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];
    out.push({
      name: p.nameOnCert || p.ownerName || "Unnamed prospect",
      service: svcs.filter((s) => s !== "CONFIRM").map(serviceLabel).join(", ") || "Compliance cert",
      daysLeft,
    });
  }
  out.sort((a, b) => a.daysLeft - b.daysLeft);
  return out;
}

// Returns { byUser: Map<userId, count>, everyone: count } — open tasks that
// are overdue or due today. "everyone" tasks (no assigneeId) count toward
// every user's own total rather than being reported separately.
async function findOverdueTasks(now) {
  const { data: rows } = await supabaseAdmin.from("tasks").select("data");
  const byUser = new Map();
  let everyone = 0;
  for (const row of rows || []) {
    const t = row.data;
    if (!t || t.status === "done" || !t.dueDate) continue;
    const due = new Date(t.dueDate + "T23:59:59");
    if (due > now) continue;
    if (t.assigneeId) byUser.set(t.assigneeId, (byUser.get(t.assigneeId) || 0) + 1);
    else everyone++;
  }
  return { byUser, everyone };
}

async function findRecentReplies(now) {
  const { data: rows } = await supabaseAdmin.from("jobs").select("id,data");
  const { data: clientRows } = await supabaseAdmin.from("clients").select("id,data");
  const clientsById = new Map((clientRows || []).map((r) => [r.id, r.data]));
  const cutoff = now.getTime() - REPLY_LOOKBACK_HOURS * 3600_000;
  const out = [];
  for (const row of rows || []) {
    const job = row.data;
    if (!job) continue;
    for (const a of job.activity || []) {
      if (a.direction !== "in") continue;
      if (new Date(a.at).getTime() < cutoff) continue;
      const client = clientsById.get(job.clientId);
      out.push({ clientName: client?.name || "A client", jobId: job.id, at: a.at });
    }
  }
  out.sort((a, b) => new Date(b.at) - new Date(a.at));
  return out;
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });
  if (!webPushConfigured) return NextResponse.json({ skipped: true, reason: "Web Push not configured" });

  const now = new Date();
  const force = new URL(request.url).searchParams.get("force") === "1";

  if (!force) {
    const { data: state } = await supabaseAdmin
      .from("app_settings").select("data").eq("id", DIGEST_STATE_ID).maybeSingle();
    if (state?.data?.lastSentDate === ukDateStr(now)) {
      return NextResponse.json({ skipped: true, reason: "Already sent today" });
    }
  }

  const [urgentProspects, recentReplies, overdueTasks] = await Promise.all([
    findUrgentProspects(now),
    findRecentReplies(now),
    findOverdueTasks(now),
  ]);
  const anyTasks = overdueTasks.everyone > 0 || overdueTasks.byUser.size > 0;

  if (!urgentProspects.length && !recentReplies.length && !anyTasks) {
    await supabaseAdmin.from("app_settings").upsert({ id: DIGEST_STATE_ID, data: { lastSentDate: ukDateStr(now) } });
    return NextResponse.json({ ok: true, sent: false, reason: "Nothing urgent today" });
  }

  const parts = [];
  if (urgentProspects.length) {
    const overdue = urgentProspects.filter((p) => p.daysLeft < 0).length;
    const countLabel = urgentProspects.length > DISPLAY_CAP ? `${DISPLAY_CAP}+` : String(urgentProspects.length);
    parts.push(
      overdue
        ? `${countLabel} renewal${urgentProspects.length === 1 ? "" : "s"} to chase (${overdue} overdue)`
        : `${countLabel} renewal${urgentProspects.length === 1 ? "" : "s"} due soon`
    );
  }
  if (recentReplies.length) {
    parts.push(`${recentReplies.length} new repl${recentReplies.length === 1 ? "y" : "ies"}`);
  }
  const top = urgentProspects[0];
  const body = [
    parts.join(" · "),
    top ? `Top: ${top.name} — ${top.service}${top.daysLeft < 0 ? ` (${Math.abs(top.daysLeft)}d overdue)` : ` (${top.daysLeft}d left)`}` : null,
  ].filter(Boolean).join("\n");

  const baseTitle = "LCL Ops — outreach reminder";
  const baseUrl = recentReplies.length && !urgentProspects.length ? "/inbox" : "/prospects";

  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
  let sent = 0;
  const dead = [];
  for (const sub of subs || []) {
    // Personalize: this device's own overdue/due-today tasks, plus any
    // team-wide ("everyone") task also counts toward their number.
    const myTasks = (overdueTasks.byUser.get(sub.user_id) || 0) + overdueTasks.everyone;
    const payload = {
      title: baseTitle,
      body: myTasks
        ? `${body}${body ? "\n" : ""}${myTasks} of your task${myTasks === 1 ? "" : "s"} need${myTasks === 1 ? "s" : ""} attention`
        : body,
      url: !urgentProspects.length && !recentReplies.length ? "/team?tab=board" : baseUrl,
    };
    const result = await sendPush(sub, payload);
    if (result.ok) sent++;
    if (result.gone) dead.push(sub.id);
  }
  if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);

  await supabaseAdmin.from("app_settings").upsert({ id: DIGEST_STATE_ID, data: { lastSentDate: ukDateStr(now) } });

  return NextResponse.json({
    ok: true,
    sent: true,
    devicesNotified: sent,
    devicesPruned: dead.length,
    urgentProspects: urgentProspects.length,
    recentReplies: recentReplies.length,
    overdueTasksEveryone: overdueTasks.everyone,
    overdueTasksAssigned: overdueTasks.byUser.size,
  });
}
