// Pushes an immediate notification to a task's assignee (or, for an
// "everyone" task, to every subscribed device except the creator). Also
// stamps `lastRemindedAt` on the task row so the daily/aggressive
// reminder crons don't fire a duplicate ping the same day.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, webPushConfigured } from "@/lib/webPush";
import { taskDeepLink } from "@/lib/tasks";

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin || !webPushConfigured) {
    return NextResponse.json({ skipped: true, reason: "Push not configured" });
  }

  const { assigneeId, title, taskId, priority } = await request.json().catch(() => ({}));
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

  const payload = {
    title: assigneeId
      ? `${priority === "urgent" ? "Urgent — " : ""}${task?.createdBy?.name && task.createdBy.id !== "system" ? `${String(task.createdBy.name).split("@")[0]} gave you a task` : "New task for you"}`
      : "New team task",
    body: task?.linkedTo?.label ? `${title} · ${task.linkedTo.label}` : title,
    url: taskDeepLink(task || (taskId ? { id: taskId } : null)),
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
  if (taskId) {
    const { data: row } = await supabaseAdmin.from("tasks").select("data").eq("id", taskId).maybeSingle();
    if (row?.data) {
      const next = { ...row.data, lastRemindedAt: new Date().toISOString() };
      await supabaseAdmin.from("tasks").upsert({ id: taskId, data: next });
    }
  }

  return NextResponse.json({ ok: true, devicesNotified: sent });
}
