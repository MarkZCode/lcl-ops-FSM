// Vercel cron — runs early each morning (before auto-assign/task-reminders)
// and does two things for every job still sitting in "scheduled":
//   1. If its scheduled date is today (or earlier — catches a missed run),
//      flip it to "in_progress" so the board reflects reality without
//      someone having to remember to click it.
//   2. Sends ONE digest alert (not one per job — that's exactly the
//      spam pattern that got push disabled before) summarising which jobs
//      just started, via push (if configured) AND email (always-on
//      fallback, since push has a history of going quiet).
//
// Secured by CRON_SECRET, same pattern as the other cron routes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, webPushConfigured } from "@/lib/webPush";
import { sendEmailRaw } from "@/lib/emailSend";
import { site } from "@/lib/site";
import { serviceName, isAddonCode } from "@/lib/format";

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const now = new Date();

  const [{ data: jobRows }, { data: clientRows }] = await Promise.all([
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("clients").select("id,data"),
  ]);
  const clientsById = new Map((clientRows || []).map((r) => [r.id, r.data]));

  const started = [];
  for (const row of jobRows || []) {
    const j = row.data;
    if (!j || j.status !== "scheduled" || !j.scheduledAt) continue;
    // Was date-only: any job scheduled for TODAY flipped to in_progress the
    // instant this ran at 5am, regardless of whether the appointment was at
    // 8am or 5pm. A 5pm job read "in progress" twelve hours before the
    // engineer had even left for it. Reported directly: a 1pm job still
    // correctly read "Scheduled" mid-morning, which surfaced that the
    // reverse case (an early job) had been firing far too soon.
    //
    // /api/cron/auto-start-jobs now owns the actual moment-of-start flip,
    // running through the day. This morning pass keeps its original job —
    // catching anything whose appointment time has ALREADY passed by 5am
    // (an early job, or one from a missed run) — so it only ever needs a
    // real time comparison, not a same-day one.
    if (new Date(j.scheduledAt).getTime() > now.getTime()) continue;
    const client = clientsById.get(j.clientId);
    const property = client?.properties?.find((p) => p.id === j.propertyId);
    started.push({
      id: row.id,
      data: { ...j, status: "in_progress" },
      clientName: client?.name || "Client",
      service: (j.services || []).filter((c) => !isAddonCode(c)).map(serviceName).join(", ") || "Job",
      address: property ? `${property.label}, ${property.postcode}` : "",
    });
  }

  if (!started.length) {
    return NextResponse.json({ ok: true, started: 0, note: "No jobs due to start today." });
  }

  await supabaseAdmin.from("jobs").upsert(started.map((s) => ({ id: s.id, data: s.data })));

  const lines = started.map((s) => `• ${s.id} — ${s.clientName} — ${s.service}${s.address ? ` — ${s.address}` : ""}`);
  const title = started.length === 1
    ? `1 job started today — ${started[0].id}`
    : `${started.length} jobs started today`;
  const body = lines.join("\n");

  // Push — digest style, ONE notification for the whole run.
  let pushSent = 0;
  const deadSubs = [];
  if (webPushConfigured) {
    const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id,endpoint,p256dh,auth");
    for (const sub of subs || []) {
      const result = await sendPush(sub, { title, body, url: "/jobs" });
      if (result.ok) pushSent++;
      if (result.gone) deadSubs.push(sub.id);
    }
    if (deadSubs.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", deadSubs);
  }

  // Email — always-on fallback to the office inbox, since push has a
  // history of silently not reaching anyone.
  let emailSent = false;
  if (process.env.GMAIL_USER) {
    const res = await sendEmailRaw({
      to: site.email,
      subject: title,
      text: `${body}\n\nStatus auto-updated to "In progress" on the LCL Ops dashboard.`,
      fromName: site.name,
    });
    emailSent = !!res.ok;
  }

  return NextResponse.json({
    ok: true,
    started: started.length,
    jobIds: started.map((s) => s.id),
    pushSent,
    pushDevicesPruned: deadSubs.length,
    emailSent,
  });
}
