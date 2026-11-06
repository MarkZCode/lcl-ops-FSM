// Email queue worker — picks up due `pending` items, sends them, updates
// status. Called by Vercel Cron every 5 minutes (see vercel.json) and on
// demand from the Email log page's "Process now" button.
//
// Auth: CRON_SECRET (Bearer) for the scheduler, OR an admin session for the
// manual trigger.
//
// Safety:
//   - Respects the daily Gmail cap (mirror of /api/send-email's 400).
//   - Drips with a small delay between sends.
//   - Skips items whose prospect has already replied, opted out, or won.
//   - Logs every send (success or failure) to email_sends, same as 1:1 sends.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";
import { sendEmailRaw } from "@/lib/emailSend";
import { EMAIL_PROVIDERS, resolveProvider } from "@/lib/emailProviders";

export const runtime = "nodejs";
export const maxDuration = 60;

// Highest of the per-provider caps — bounds how much work one run claims.
// Actual stopping is per-provider (see the loop below), so a "main"-heavy
// run doesn't get truncated early just because "resend" also has items due.
const BATCH_LIMIT = Math.max(...Object.values(EMAIL_PROVIDERS).map((p) => p.dailyCap));
const DRIP_DELAY_MS = 400;    // gentle inter-send pause (tightened from 800ms
                              // so more sends fit in one 60s function run —
                              // ~100/run, self-chaining drains the rest)
const SKIP_STAGES = new Set(["dnc", "won", "booked"]);
// Leave a headroom buffer before Vercel's maxDuration kills us mid-send —
// stop the loop cleanly so we can persist state and self-chain to a fresh
// invocation instead of letting the platform truncate a send in flight.
const RUN_BUDGET_MS = 50_000; // out of 60s maxDuration

function makeId() {
  return "es-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function startOfTodayUtcIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function isAuthorised(request) {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return { kind: "cron" };
  }
  const admin = await requireAdmin(request);
  if (admin) return { kind: "admin", user: admin };
  return null;
}

// Per-provider — see the same helper's comment in /api/send-email. Rows
// written before the provider split have no data.provider tag and are
// treated as "main", which is what they actually were.
async function todaysSentCount(provider) {
  let q = supabaseAdmin
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", startOfTodayUtcIso())
    .in("status", ["sent", "replied"]);
  q = provider === "main"
    ? q.or("data->>provider.is.null,data->>provider.eq.main")
    : q.eq("data->>provider", provider);
  const { count } = await q;
  return count || 0;
}

async function todaysCountsByProvider() {
  const entries = await Promise.all(
    Object.keys(EMAIL_PROVIDERS).map(async (p) => [p, await todaysSentCount(p)])
  );
  return Object.fromEntries(entries);
}

// Final BCC guard — every campaign send must land in the operator's own
// inbox so they can verify it went out. If a queue row was created without
// a bcc (older records, or an API caller that forgot), inject the
// operator's fromEmail from settings before we hand off to Nodemailer.
let _bccFallbackPromise = null;
async function operatorBccFallback() {
  if (_bccFallbackPromise) return _bccFallbackPromise;
  _bccFallbackPromise = (async () => {
    try {
      const { data } = await supabaseAdmin
        .from("app_settings")
        .select("data")
        .eq("id", "singleton")
        .maybeSingle();
      return data?.data?.email?.fromEmail || null;
    } catch { return null; }
  })();
  return _bccFallbackPromise;
}

// Stale "sending" claims (from a run that got killed by Vercel's timeout
// mid-batch, before it could mark rows sent/failed) become reclaimable
// after this long, instead of sitting stuck forever.
const STALE_CLAIM_MS = 5 * 60 * 1000;

// Atomically claim due rows before sending them. This route can be invoked
// concurrently — the 5-minute cron, the self-chain fire-and-forget kick at
// the end of a run, the enqueue endpoint's immediate kick, and the manual
// "Process now" button in Email log can all land within the same second.
// The old version just SELECTed pending rows and sent them; every concurrent
// invocation got the SAME rows (nothing had marked them as taken yet), so
// each invocation sent every row independently — one queued email, several
// real sends, all within a second or two of each other. That's what
// produced the multi-sends to the same recipient at the same timestamp.
//
// The fix is a compare-and-swap: flip status pending -> sending with a
// WHERE status = 'pending' guard. Postgres evaluates that WHERE clause
// against the currently-committed row, so only the first invocation to
// reach a given row actually updates it — every other concurrent
// invocation's UPDATE matches zero rows for that id and moves on. Only
// rows this invocation actually won (returned by .select()) get processed.
async function claimDuePending(limit) {
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString();

  // Reclaim anything stuck in "sending" from a prior run that never got to
  // mark it sent/failed (killed by the platform mid-batch) — otherwise a
  // crash mid-run would permanently strand those rows.
  await supabaseAdmin
    .from("email_queue")
    .update({ status: "pending" })
    .eq("status", "sending")
    .lt("sent_at", staleIso);

  const { data: candidates, error: selErr } = await supabaseAdmin
    .from("email_queue")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (selErr) throw new Error(selErr.message);
  if (!candidates?.length) return [];

  const ids = candidates.map((c) => c.id);
  const { data: claimed, error: updErr } = await supabaseAdmin
    .from("email_queue")
    .update({ status: "sending", sent_at: nowIso })
    .in("id", ids)
    .eq("status", "pending")
    .select("*");
  if (updErr) throw new Error(updErr.message);
  // Keep the original scheduled_for ordering — the claim UPDATE doesn't
  // guarantee row order back.
  const order = new Map(ids.map((id, i) => [id, i]));
  return (claimed || []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

// Returns true if the recipient should be skipped (replied / opted out / booked / suppressed / etc).
// Checks both prospects and cold leads tables — queue items can come from either.
async function shouldSkipForProspect(prospectId, toEmail, suppressions) {
  if (toEmail && suppressions?.has(String(toEmail).trim().toLowerCase())) return true;
  if (!prospectId) return false;

  // Try prospects table first.
  const { data: pRow } = await supabaseAdmin
    .from("prospects")
    .select("data")
    .eq("id", prospectId)
    .maybeSingle();
  if (pRow?.data) {
    const p = pRow.data;
    if (SKIP_STAGES.has(p.stage)) return true;
    if (p.lastRepliedAt) return true;
    return false;
  }

  // Try cold leads table (id prefix "cl-").
  const { data: lRow } = await supabaseAdmin
    .from("leads")
    .select("data")
    .eq("id", prospectId)
    .maybeSingle();
  if (lRow?.data) {
    const l = lRow.data;
    if (SKIP_STAGES.has(l.stage)) return true;
    if (l.lastRepliedAt) return true;
    return false;
  }

  return false;
}

// Bump the prospect's `lastContactedAt` + move stage from "new" → "contacted"
// after an actual successful send. This is what makes the FSM's "Contacted"
// pipeline count match what's really in the Sent folder.
async function updateProspectAfterSend(prospectId, stepIndex) {
  const { data } = await supabaseAdmin
    .from("prospects")
    .select("data")
    .eq("id", prospectId)
    .maybeSingle();
  if (!data?.data) return;
  const p = data.data;
  const nowIso = new Date().toISOString();
  const updated = {
    ...p,
    lastContactedAt: nowIso,
    // Only promote "new" → "contacted" on the first primary. Chases don't
    // move the pipeline (a chase means we're STILL waiting, not that a new
    // human touchpoint happened).
    stage: (stepIndex === 1 && (!p.stage || p.stage === "new")) ? "contacted" : p.stage,
    contactLog: [
      ...(Array.isArray(p.contactLog) ? p.contactLog : []),
      { channel: "email", at: nowIso, note: stepIndex === 1 ? "Campaign primary" : `Campaign chase step ${stepIndex}` },
    ],
  };
  await supabaseAdmin
    .from("prospects")
    .update({ data: updated })
    .eq("id", prospectId);
}

async function markCancelled(id, reason) {
  // Clear sent_at — it was only ever the claim timestamp for this row
  // (never actually sent), and leaving it set would misread as a real send
  // time in the Email log.
  await supabaseAdmin
    .from("email_queue")
    .update({ status: "cancelled", cancelled_reason: reason, sent_at: null })
    .eq("id", id);
}

async function markSent(item, sendRow) {
  await supabaseAdmin
    .from("email_queue")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_send_id: sendRow.id,
    })
    .eq("id", item.id);
}

async function markFailed(id, reason) {
  // Clear sent_at for the same reason as markCancelled above — this row
  // was claimed but never actually sent.
  await supabaseAdmin
    .from("email_queue")
    .update({ status: "failed", failure_reason: String(reason).slice(0, 500), sent_at: null })
    .eq("id", id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET(request) { return run(request); }
export async function POST(request) { return run(request); }

async function run(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const auth = await isAuthorised(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const due = await claimDuePending(BATCH_LIMIT);
  if (!due.length) {
    return NextResponse.json({ processed: 0, sent: 0, cancelled: 0, failed: 0, skipped: 0 });
  }

  let sent = 0, cancelled = 0, failed = 0, skipped = 0;
  // Independent counter per provider — a capped-out "resend" pool must not
  // stop "main" (Gmail) items in the same run from sending, and vice versa.
  const [sentTodayByProvider, { data: suppRow }] = await Promise.all([
    todaysCountsByProvider(),
    supabaseAdmin.from("app_settings").select("data").eq("id", "email_suppressions").maybeSingle(),
  ]);
  const suppressions = new Set((suppRow?.data?.emails || []).map((e) => String(e).trim().toLowerCase()));
  const maxedProviders = new Set();
  const runStartedAt = Date.now();
  let ranOutOfTime = false;

  for (const item of due) {
    // Stop cleanly if we're about to blow past Vercel's function timeout —
    // any partial send that gets truncated by the platform ends up with a
    // duplicate delivery risk (Nodemailer returned but Supabase update
    // never landed). Safer to end here and self-chain a fresh run below.
    if (Date.now() - runStartedAt > RUN_BUDGET_MS) {
      ranOutOfTime = true;
      skipped += due.length - (sent + cancelled + failed);
      break;
    }

    const provider = resolveProvider(item.data?.provider);
    const identity = item.data?.identity;
    const dailyCap = EMAIL_PROVIDERS[provider].dailyCap;
    if (sentTodayByProvider[provider] >= dailyCap) {
      // This provider's quota for today is spent — leave it pending for
      // tomorrow, but keep going: other providers' due items in this same
      // batch are unaffected and should still send.
      maxedProviders.add(provider);
      skipped++;
      continue;
    }

    // Did the prospect already reply / opt out / suppressed since this was scheduled?
    if (await shouldSkipForProspect(item.prospect_id, item.to_email, suppressions)) {
      await markCancelled(item.id, "prospect already actioned or suppressed");
      cancelled++;
      continue;
    }

    const bcc = item.bcc || (provider === "main" ? await operatorBccFallback() : null) || undefined;
    const result = await sendEmailRaw({
      to: item.to_email,
      subject: item.subject,
      text: item.body,
      fromName: item.from_name || undefined,
      replyTo: item.reply_to || undefined,
      bcc,
      provider,
      identity,
    });

    // Log to email_sends regardless of outcome — same row schema as 1:1 sends
    // so the email log shows everything in one place.
    const sendRow = {
      id: makeId(),
      to_email: item.to_email,
      subject: item.subject,
      status: result.ok ? "sent" : "failed",
      sent_by: item.created_by || null,
      prospect_id: item.prospect_id || null,
      campaign_label: item.campaign_label || null,
      message_id: result.messageId || null,
      error: result.ok ? null : `${result.error || ""} — ${result.detail || ""}`.trim().replace(/^—\s*/, "").slice(0, 500),
      data: { fromName: item.from_name || null, source: "queue", queueId: item.id, stepIndex: item.step_index, provider, identity: identity || null },
    };
    await supabaseAdmin.from("email_sends").insert(sendRow).then(() => {}, () => {});

    if (result.ok) {
      await markSent(item, sendRow);
      sent++;
      sentTodayByProvider[provider]++;
      // Reflect the actual send in the prospect record so the FSM's
      // "Contacted" pipeline count matches reality one row at a time.
      // Previously we optimistically flipped every recipient to "contacted"
      // at enqueue time — that was wrong when only 1 of 60 had actually
      // sent (the rest were still pending in the queue). Do it here so
      // "Contacted" grows in lockstep with the Sent folder.
      if (item.prospect_id) {
        await updateProspectAfterSend(item.prospect_id, item.step_index).catch(() => {});
      }
    } else {
      await markFailed(item.id, `${result.error || ""} — ${result.detail || ""}`.trim() || "send failed");
      failed++;
      // A hard provider-side quota was hit (e.g. Gmail's own daily cap,
      // separate from and often lower than our internal guess) — every
      // remaining item for THIS provider would fail identically, so stop
      // sending on it for the rest of this run instead of burning through
      // doomed retries. Other providers are unaffected.
      if (result.quotaReached) {
        sentTodayByProvider[provider] = dailyCap;
        maxedProviders.add(provider);
      }
    }

    if (DRIP_DELAY_MS) await sleep(DRIP_DELAY_MS);
  }

  // Self-chain: if there are STILL pending items whose scheduled_for has
  // arrived AND we haven't hit the daily cap, kick off a fresh processor
  // invocation. Fire-and-forget so THIS response returns promptly.
  //
  // Previous version only chained on ranOutOfTime or BATCH_LIMIT — but a
  // 60-recipient campaign that sent 1 email and had 59 more sitting a few
  // seconds in the future would satisfy NEITHER condition and stop chaining,
  // leaving the queue stuck until the once-daily cron. Now we look at the
  // actual remaining-due count and chain whenever there's more work.
  let chained = false;
  let remainingDue = 0;
  const anyProviderHasRoom = Object.keys(EMAIL_PROVIDERS).some(
    (p) => sentTodayByProvider[p] < EMAIL_PROVIDERS[p].dailyCap
  );
  if (anyProviderHasRoom) {
    try {
      const { count } = await supabaseAdmin
        .from("email_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString());
      remainingDue = count || 0;
    } catch { /* count is advisory — safe to skip */ }

    if (remainingDue > 0 || ranOutOfTime) {
      try {
        const origin = new URL(request.url).origin;
        const headers = process.env.CRON_SECRET
          ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {};
        fetch(`${origin}/api/email-queue/process`, { method: "POST", headers })
          .catch(() => { /* next cron tick / manual trigger will retry */ });
        chained = true;
      } catch { /* URL parse issue, safe to ignore */ }
    }
  }

  return NextResponse.json({
    processed: due.length,
    sent,
    cancelled,
    failed,
    skipped,
    ranOutOfTime,
    chained,
    remainingDue,
    triggeredBy: auth.kind,
    quota: Object.fromEntries(
      Object.keys(EMAIL_PROVIDERS).map((p) => [
        p,
        { sentToday: sentTodayByProvider[p], dailyCap: EMAIL_PROVIDERS[p].dailyCap, maxedOut: maxedProviders.has(p) },
      ])
    ),
  });
}
