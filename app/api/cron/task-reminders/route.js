// Vercel cron — runs several times a day to nudge assignees about overdue
// or due-today tasks. Cadence is per-task:
//   • daily      — one push at ~8am UK if not already pushed today
//   • aggressive — three pushes a day (~9am / ~3pm / ~7pm UK) from the day
//                  it's given until it's done, on top of the instant push
//   • once       — never re-pushed here (assignment push is the only ping)
//
// Uses task.lastRemindedAt to dedupe within the same UK-clock slot so a
// double cron fire or a manual ?force=1 test doesn't double-notify.
// Secured by CRON_SECRET, same pattern as the other cron routes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, webPushConfigured } from "@/lib/webPush";
import { taskDeepLink } from "@/lib/tasks";

// UK clock hour → which cadences fire in this slot.
// 8am is the "morning" slot (daily + aggressive fire).
// 14 (2pm) and 18 (6pm) are "aggressive-only" catch-ups.
const SLOTS = {
  8:  { key: "morning",  cadences: ["daily", "aggressive"] },
  14: { key: "midday",   cadences: ["aggressive"] },
  18: { key: "evening",  cadences: ["aggressive"] },
};

function ukHour(now = new Date()) {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(now),
    10
  );
}
function ukDateStr(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

// Reminder key stamped onto lastRemindedAt-scoped guard so we know whether
// THIS slot has already been notified for THIS task today.
function slotKey(now, slotKey) {
  return `${ukDateStr(now)}:${slotKey}`;
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin || !webPushConfigured) {
    return NextResponse.json({ skipped: true, reason: "Not configured" });
  }

  const now = new Date();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const forcedSlot = url.searchParams.get("slot"); // "morning" | "midday" | "evening"

  let slot;
  if (forcedSlot) {
    slot = Object.values(SLOTS).find((s) => s.key === forcedSlot);
    if (!slot) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
  } else {
    // The crons are scheduled in UTC (08/14/18). In British Summer Time
    // that's 09/15/19 on the UK clock, which matched no slot — so for half
    // the year every scheduled reminder silently skipped. Accept the slot
    // hour or the hour after it, which covers both GMT and BST.
    const h = ukHour(now);
    slot = SLOTS[h] || SLOTS[h - 1];
    if (!slot) {
      return NextResponse.json({ skipped: true, reason: `Not a reminder slot (currently ${ukHour(now)}:00 UK)` });
    }
  }

  const stamp = slotKey(now, slot.key);

  const [{ data: taskRows }, { data: subRows }] = await Promise.all([
    supabaseAdmin.from("tasks").select("id,data"),
    supabaseAdmin.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id"),
  ]);

  // Group subscriptions by user for fast lookup.
  const subsByUser = new Map();
  const everyoneSubs = [];
  for (const s of subRows || []) {
    everyoneSubs.push(s);
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id).push(s);
  }

  let sent = 0;
  let tasksNotified = 0;
  const dead = [];

  for (const row of taskRows || []) {
    const t = row.data;
    if (!t || t.status === "done") continue;
    const cadence = t.reminderCadence || "daily";
    if (!slot.cadences.includes(cadence)) continue;
    // Daily: only once it's due today or overdue — no early nagging.
    // Aggressive: every slot from the day it was given, whatever the due date.
    const due = t.dueDate ? new Date(t.dueDate + "T23:59:59") : null;
    if (cadence !== "aggressive" && (!due || due > now)) continue;
    // Dedup: skip if already reminded in THIS slot on THIS UK date.
    if (t.lastReminderSlot === stamp && !force) continue;

    const target = t.assigneeId ? subsByUser.get(t.assigneeId) || [] : everyoneSubs;
    if (!target.length) continue;

    const overdueDays = due ? Math.floor((now - due) / 86400_000) : 0;
    const overdueLabel = !due ? "Still open" : due > now ? (ukDateStr(due) === ukDateStr(now) ? "Due today" : `Due ${new Date(t.dueDate + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`) : overdueDays > 0 ? `${overdueDays}d overdue` : "Due today";
    const payload = {
      title: t.priority === "urgent" ? "URGENT task reminder" : "Task reminder",
      body: `${t.title}\n${overdueLabel}${t.assigneeName ? ` · assigned to ${t.assigneeName}` : ""}`,
      url: taskDeepLink({ id: row.id, linkedTo: t.linkedTo }),
    };

    let notifiedForThisTask = false;
    for (const sub of target) {
      const result = await sendPush(sub, payload);
      if (result.ok) { sent++; notifiedForThisTask = true; }
      if (result.gone) dead.push(sub.id);
    }

    if (notifiedForThisTask) {
      tasksNotified++;
      await supabaseAdmin.from("tasks").upsert({
        id: row.id,
        data: { ...t, lastRemindedAt: now.toISOString(), lastReminderSlot: stamp },
      });
    }
  }

  // Evening: one summary for each admin of how the team's day went — who
  // finished what, what's still open, what's late. Weekdays only.
  let digest = 0;
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(now);
  if (slot.key === "evening" && !["Sat", "Sun"].includes(weekday)) {
    const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const users = usersRes?.users || [];
    const admins = users.filter((u) => u.app_metadata?.role === "admin").map((u) => u.id);
    const agents = users.filter((u) => u.app_metadata?.role === "agent");
    const today = ukDateStr(now);
    const all = (taskRows || []).map((r) => r.data).filter(Boolean);
    const lines = agents.map((a) => {
      const name = String(a.user_metadata?.name || a.email).split("@")[0];
      const mine = all.filter((t) => t.assigneeId === a.id);
      const done = mine.filter((t) => t.status === "done" && !t.dismissed && t.completedAt && ukDateStr(new Date(t.completedAt)) === today).length;
      const open = mine.filter((t) => t.status !== "done");
      const late = open.filter((t) => (t.dueAt ? new Date(t.dueAt) < now : t.dueDate && t.dueDate < today)).length;
      return `${name}: ${done} done · ${open.length} open${late ? ` · ${late} late` : ""}`;
    });
    if (lines.length) {
      for (const sub of everyoneSubs.filter((x) => admins.includes(x.user_id))) {
        const r = await sendPush(sub, { title: "Team today", body: lines.join("\n"), url: "/team?tab=people" });
        if (r.ok) digest++;
        if (r.gone) dead.push(sub.id);
      }
    }
  }

  if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);

  return NextResponse.json({
    digest,
    ok: true,
    slot: slot.key,
    tasksNotified,
    devicesPushed: sent,
    devicesPruned: dead.length,
  });
}
