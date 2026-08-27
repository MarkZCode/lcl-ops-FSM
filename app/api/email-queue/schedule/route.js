// Schedule one or more follow-up (chase) emails. Called by the campaign UI
// once per recipient when "Schedule chase if no reply" is enabled. The actual
// send happens later, from the cron worker at /api/email-queue/process.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

const MAX_BATCH = 500;
const MAX_DAYS_AHEAD = 90; // a chase 3 months out is almost certainly a mistake

function makeId() {
  return "eq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Reuse the prospect-upsert bucket — same realistic abuse profile.
  const limited = rateLimitOr429(`queue-schedule:${user.id}`, LIMITS.prospectUpsert);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "No items" }, { status: 400 });
  if (items.length > MAX_BATCH) {
    return NextResponse.json({ error: `Max ${MAX_BATCH} per request.` }, { status: 413 });
  }

  const now = Date.now();
  const horizon = now + MAX_DAYS_AHEAD * 24 * 3600 * 1000;
  const rows = [];
  const errors = [];

  for (const it of items) {
    if (!isEmail(it?.toEmail)) { errors.push({ toEmail: it?.toEmail, reason: "invalid email" }); continue; }
    if (typeof it.subject !== "string" || !it.subject.trim()) { errors.push({ toEmail: it.toEmail, reason: "missing subject" }); continue; }
    if (typeof it.body !== "string" || !it.body.trim()) { errors.push({ toEmail: it.toEmail, reason: "missing body" }); continue; }
    const scheduledMs = Number(it.scheduledFor) || (now + (Number(it.delayDays) || 3) * 24 * 3600 * 1000);
    if (scheduledMs <= now) { errors.push({ toEmail: it.toEmail, reason: "scheduled in the past" }); continue; }
    if (scheduledMs > horizon) { errors.push({ toEmail: it.toEmail, reason: `more than ${MAX_DAYS_AHEAD} days ahead` }); continue; }

    rows.push({
      id: makeId(),
      prospect_id: it.prospectId || null,
      to_email: String(it.toEmail).trim().toLowerCase(),
      subject: it.subject.slice(0, 998),
      body: it.body.slice(0, 200_000),
      from_name: it.fromName || null,
      reply_to: it.replyTo || null,
      bcc: it.bcc || null,
      campaign_label: it.campaignLabel || null,
      parent_send_id: it.parentSendId || null,
      step_index: Number(it.stepIndex) || 1,
      scheduled_for: new Date(scheduledMs).toISOString(),
      status: "pending",
      created_by: user.id,
      data: { ...(it.data || {}), provider: it.provider || undefined, identity: it.identity || undefined },
    });
  }

  if (!rows.length) {
    return NextResponse.json({ error: "No valid items", rejected: errors }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("email_queue").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scheduled: rows.length, rejected: errors });
}
