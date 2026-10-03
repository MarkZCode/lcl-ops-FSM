// Pushes an immediate notification to a task's assignee (or, for an
// "everyone" task, to every subscribed device except the creator). Also
// stamps `lastRemindedAt` on the task row so the daily/aggressive
// reminder crons don't fire a duplicate ping the same day.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, webPushConfigured } from "@/lib/webPush";
import { taskDeepLink, daysUntilDue } from "@/lib/tasks";

const looksLikeEmail = (v) => /@|^[a-z0-9._-]{12,}$/i.test(String(v || "").trim()) && !/\s/.test(String(v || "").trim());

// The person who gave the task, by their NAME. Tasks store whatever the app
// knew at the time, which for an account with no name set was the email —
// so the notification read "businessforzainsajjad gave yo…". Look the name
// up now; if there still isn't a real one, leave the sender out rather
// than show an email.
async function senderName(createdBy) {
  if (!createdBy || createdBy.id === "system") return null;
  let name = createdBy.name;
  if (looksLikeEmail(name) && createdBy.id) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(createdBy.id);
      name = data?.user?.user_metadata?.name || name;
    } catch {}
  }
  name = String(name || "").trim();
  return name && !looksLikeEmail(name) ? name.split(/\s+/)[0] : null;
}

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin || !webPushConfigured) {
    return NextResponse.json({ skipped: true, reason: "Push not configured" });
  }

  // `heading` replaces the default "X gave you a task" (e.g. "Zain took over
  // a task of yours"); such a heads-up isn't a reminder, so it doesn't stamp
  // lastRemindedAt.
  const { assigneeId, title, taskId, priority, heading } = await request.json().catch(() => ({}));
  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  // Load the full task so we can deep-link to its linked FSM record if any.
  let task = null;
  if (taskId) {
    const { data: row } = await supabaseAdmin.from("tasks").select("data").eq("id", taskId).maybeSingle();
    task = row?.data || null;
  }

  let query = supabaseAdmin.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
  if (assigneeId) query = query.eq("user_id", assigneeId);
  const { data: subs } = await query;

  // Short and readable on a lock screen: who it's from in the title, what
  // to do first in the body, then who/which job and when it's due. Android
  // cuts the title at ~35 characters, so the long bit never goes there.
  const from = assigneeId && !heading ? await senderName(task?.createdBy) : null;
  const urgent = priority === "urgent";
  const d = task ? daysUntilDue(task) : null;
  const due = d == null ? "" : d < 0 ? `${Math.abs(d)} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : "";
  const what = String(title).trim().replace(/^./, (c) => c.toUpperCase());
  const payload = {
    title: heading
      ? String(heading).slice(0, 80)
      : assigneeId
        ? `${urgent ? "Urgent task" : "New task"}${from ? ` from ${from}` : " for you"}`
        : "New team task",
    body: [what, task?.linkedTo?.label, due].filter(Boolean).join(" · "),
    url: taskDeepLink(task || (taskId ? { id: taskId } : null)),
    actions: [{ action: "open", title: "Open task" }],
  };

  let sent = 0;
  const dead = [];
  for (const sub of subs || []) {
    if (sub.user_id === user.id && !assigneeId) continue;
    const result = await sendPush(sub, payload);
    if (result.ok) sent++;
    if (result.gone) dead.push(sub.id);
  }
  if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);

  // Stamp lastRemindedAt so the reminder cron treats the assignment push as
  // today's notification for this task — avoids double-pinging the assignee
  // if the digest runs shortly after they were just assigned it.
  if (taskId && !heading) {
    const { data: row } = await supabaseAdmin.from("tasks").select("data").eq("id", taskId).maybeSingle();
    if (row?.data) {
      const next = { ...row.data, lastRemindedAt: new Date().toISOString() };
      await supabaseAdmin.from("tasks").upsert({ id: taskId, data: next });
    }
  }

  return NextResponse.json({ ok: true, devicesNotified: sent });
}
