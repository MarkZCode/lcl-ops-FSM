// Email send log + today's quota usage. Backs the /email-log dashboard page.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { EMAIL_PROVIDERS } from "@/lib/emailProviders";

const DAILY_CAP = EMAIL_PROVIDERS.main.dailyCap; // mirror of /api/send-email's "main" cap

function startOfTodayUtcIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 200)));
  const status = searchParams.get("status"); // 'sent' | 'failed' | 'replied' | null (all)
  const prospectId = searchParams.get("prospectId"); // filter to one prospect
  const toEmail = searchParams.get("toEmail"); // filter to one recipient
  const since = searchParams.get("since"); // ISO timestamp

  // Today's count (drives the quota meter)
  const today = startOfTodayUtcIso();
  // Probe the table once — if it doesn't exist, the user hasn't run the
  // migration yet. Surface that as a structured `setupRequired` response so
  // the UI can render a one-click setup card instead of a raw Postgres error.
  const probe = await supabaseAdmin
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", today)
    .or("data->>provider.is.null,data->>provider.eq.main")
    .in("status", ["sent", "replied"]);
  if (probe.error) {
    const msg = (probe.error.message || "").toLowerCase();
    if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("email_sends")) {
      return NextResponse.json({ setupRequired: true });
    }
    return NextResponse.json({ error: probe.error.message }, { status: 500 });
  }
  const sentTodayCount = probe.count;

  // Resend pool — shared across commercial/engineers/agents outreach.
  const { count: resendSentToday } = await supabaseAdmin
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", today)
    .eq("data->>provider", "resend")
    .in("status", ["sent", "replied"]);

  // Today's totals by status
  const { data: todayRows } = await supabaseAdmin
    .from("email_sends")
    .select("status")
    .gte("sent_at", today);
  const todayBreakdown = { sent: 0, failed: 0, replied: 0 };
  for (const r of todayRows || []) {
    if (todayBreakdown[r.status] != null) todayBreakdown[r.status] += 1;
  }

  // Recent rows
  let q = supabaseAdmin
    .from("email_sends")
    .select("id, to_email, subject, status, sent_at, message_id, prospect_id, campaign_label, error, replied_at, reply_snippet")
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (prospectId) q = q.eq("prospect_id", prospectId);
  if (toEmail) q = q.eq("to_email", String(toEmail).trim().toLowerCase());
  if (since) q = q.gte("sent_at", since);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Overall reply rate over the last 30 days — single useful KPI.
  const thirty = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count: sent30 } = await supabaseAdmin
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", thirty)
    .in("status", ["sent", "replied"]);
  const { count: replied30 } = await supabaseAdmin
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", thirty)
    .eq("status", "replied");

  // Queued emails (both primary sends AND their scheduled chases — despite
  // the UI tab historically being labelled "Scheduled chases", this table
  // holds both). `queueCounts` used to be derived by counting only the 200
  // EARLIEST-scheduled rows returned by the row-list query below — with
  // months of accumulated history, those 200 were dominated by old,
  // already-resolved rows, so the "pending" count shown in the UI could
  // read 0 while hundreds of rows were genuinely still pending. That's
  // exactly what made an operator's just-launched campaign look like it
  // vanished into nothing. Counts are now real, unsampled `count: exact`
  // queries per status — always accurate regardless of table size.
  let queue = [];
  let queueCounts = { pending: 0, sending: 0, sent: 0, cancelled: 0, failed: 0 };
  let queueAvailable = true;
  {
    const STATUSES = ["pending", "sending", "sent", "cancelled", "failed"];
    const countResults = await Promise.all(
      STATUSES.map((s) =>
        supabaseAdmin.from("email_queue").select("id", { count: "exact", head: true }).eq("status", s)
      )
    );
    const firstError = countResults.find((r) => r.error)?.error;
    if (firstError) {
      const msg = (firstError.message || "").toLowerCase();
      if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("email_queue")) {
        queueAvailable = false;
      }
    } else {
      STATUSES.forEach((s, i) => { queueCounts[s] = countResults[i].count || 0; });
    }

    if (queueAvailable) {
      // Row list: what's actually still in flight (pending/sending) is what
      // an operator opening this tab wants to see — soonest-scheduled
      // first — not old resolved history, which already lives in the Sent
      // tab. Only backfill with recently-resolved rows if there's room.
      const { data: activeRows } = await supabaseAdmin
        .from("email_queue")
        .select("id, to_email, subject, status, scheduled_for, sent_at, sent_send_id, prospect_id, campaign_label, step_index, cancelled_reason, failure_reason, parent_send_id")
        .in("status", ["pending", "sending"])
        .order("scheduled_for", { ascending: true })
        .limit(300);
      queue = activeRows || [];
      if (queue.length < 200) {
        const { data: recentResolved } = await supabaseAdmin
          .from("email_queue")
          .select("id, to_email, subject, status, scheduled_for, sent_at, sent_send_id, prospect_id, campaign_label, step_index, cancelled_reason, failure_reason, parent_send_id")
          .in("status", ["sent", "cancelled", "failed"])
          .order("scheduled_for", { ascending: false })
          .limit(200 - queue.length);
        queue = [...queue, ...(recentResolved || [])];
      }
    }
  }

  return NextResponse.json({
    // Kept flat for existing callers (ProspectCampaign.js etc.) — this is
    // always the "main" (Gmail) quota, unchanged in shape.
    quota: {
      sentToday: sentTodayCount || 0,
      dailyCap: DAILY_CAP,
      remaining: Math.max(0, DAILY_CAP - (sentTodayCount || 0)),
      breakdown: todayBreakdown,
    },
    // Per-provider breakdown — CampaignBuilder.js reads whichever one
    // applies to the segment it's sending (main or resend).
    quotaByProvider: {
      main: {
        sentToday: sentTodayCount || 0,
        dailyCap: EMAIL_PROVIDERS.main.dailyCap,
        remaining: Math.max(0, EMAIL_PROVIDERS.main.dailyCap - (sentTodayCount || 0)),
      },
      resend: {
        sentToday: resendSentToday || 0,
        dailyCap: EMAIL_PROVIDERS.resend.dailyCap,
        remaining: Math.max(0, EMAIL_PROVIDERS.resend.dailyCap - (resendSentToday || 0)),
      },
    },
    stats30d: {
      sent: sent30 || 0,
      replied: replied30 || 0,
      replyRate: sent30 ? Math.round(((replied30 || 0) / sent30) * 100) : 0,
    },
    sends: data || [],
    queue,
    queueCounts,
    queueAvailable,
  });
}
