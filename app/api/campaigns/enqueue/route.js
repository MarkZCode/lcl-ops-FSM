// Bulk enqueue an outbound campaign — every primary send AND every follow-up
// chase gets an email_queue row in one server-side POST, so the operator can
// close the browser tab the instant this returns and everything still sends.
//
// Contract with the client (components/ProspectCampaign.js):
//   POST { campaignLabel, primaries: [ {toEmail, subject, body, prospectId, ...} ],
//          chase: {enabled, delayDays, subjectTemplate, bodyTemplate},
//          fromName, replyTo, bcc, dripSeconds }
//
// - Primaries drip `dripSeconds` (default 30s) apart to spread over minutes
//   rather than blast in one burst — friendlier to Gmail's per-user rate
//   limits and gives replies/opt-outs time to short-circuit chases before
//   they fire.
// - Chases go in with `scheduled_for = primary_scheduled_for + delayDays*24h`
//   so the cron processor picks them up naturally when their time comes.
// - BCC is auto-filled server-side from the operator's `email.fromEmail`
//   settings if the client didn't specify one — guaranteed inbox receipt.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_PER_CAMPAIGN = 2000;
// Small 1-sec stagger keeps ordering deterministic (Postgres timestamps
// with matching seconds can be returned in any order) but every primary
// is essentially "due now" from the processor's perspective. Actual
// Gmail-safe spacing between sends is enforced by DRIP_DELAY_MS in the
// processor itself. Previously the schedule was 30s apart, which meant
// each processor run only saw 1 item as "due" and exited immediately
// without self-chaining — 111 rows would sit pending until the once-a-
// day cron woke up. All-due-now + self-chain drains in ~2 minutes.
const DEFAULT_DRIP_SECONDS = 1;
const MAX_DAYS_AHEAD = 90;
// Anti-double-send window: if someone was successfully emailed within this
// many days they're excluded from the new campaign. Wide enough that a
// "resend the whole list next month" campaign still catches everyone once,
// short enough that quarterly renewal cycles are respected.
const DEDUP_WINDOW_DAYS = 45;
const SKIP_STAGES = new Set(["dnc", "won", "booked", "lost"]);

function makeQueueId() {
  return "eq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Apply {{merge}} tags from the primary's data blob (name, address, service, dueDate).
// The client already substitutes the primary body; chases still hold templates so we
// interpolate here per-recipient.
function interpolate(tpl, vars) {
  if (!tpl) return tpl;
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars?.[k] ?? "")).trim();
}

async function loadOperatorFromEmail() {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("data")
      .eq("id", "singleton")
      .maybeSingle();
    return data?.data?.email?.fromEmail || null;
  } catch { return null; }
}

async function loadSuppressions() {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("data")
      .eq("id", "email_suppressions")
      .maybeSingle();
    const list = data?.data?.emails || [];
    return new Set(list.map((e) => String(e).trim().toLowerCase()));
  } catch { return new Set(); }
}

// Load the set of recipient emails (lower-cased) who were successfully sent
// to within DEDUP_WINDOW_DAYS. Anyone here is dropped from the enqueue —
// they already got the outreach; re-sending is what the operator explicitly
// wants to avoid.
async function loadRecentlyEmailed(recipientEmails) {
  if (!recipientEmails.length) return new Set();
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const seen = new Set();
  // Supabase's `.in()` is fine for a few hundred values; chunk to be safe.
  const CHUNK = 200;
  for (let i = 0; i < recipientEmails.length; i += CHUNK) {
    const slice = recipientEmails.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("email_sends")
      .select("to_email")
      .in("to_email", slice)
      .in("status", ["sent", "replied"])
      .gte("sent_at", sinceIso);
    for (const r of data || []) if (r?.to_email) seen.add(String(r.to_email).toLowerCase());
  }
  return seen;
}

// Load the set of recipient emails that already have a pending/sending row
// in email_queue. Catches the case `email_sends` can't: someone double-
// clicked "Send" (or two agents/tabs enqueued the same list) before the
// first batch actually went out, so there's no `email_sends` row yet to
// dedup against — only a not-yet-sent queue row. Without this check the
// second enqueue call sails straight through and everyone gets emailed
// twice once both batches drain.
async function loadAlreadyQueued(recipientEmails) {
  if (!recipientEmails.length) return new Set();
  const seen = new Set();
  const CHUNK = 200;
  for (let i = 0; i < recipientEmails.length; i += CHUNK) {
    const slice = recipientEmails.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("email_queue")
      .select("to_email")
      .in("to_email", slice)
      .in("status", ["pending", "sending"]);
    for (const r of data || []) if (r?.to_email) seen.add(String(r.to_email).toLowerCase());
  }
  return seen;
}

// Load prospect state for the given ids so we can drop anyone whose stage
// says "done deal / do-not-contact", who has already replied, or whose live
// record already has a lastContactedAt stamp. This last one is deliberately
// re-checked here against the live Supabase row rather than trusting
// whatever the client's `recipients` prop said — the client's copy can be
// stale (local cache, an unrefreshed tab, a filter picked before a previous
// send updated the record), and "skip already-contacted" is meant to be an
// unbypassable server guarantee, not just a UI courtesy.
async function loadProspectSkips(prospectIds) {
  if (!prospectIds.length) return { skipStage: new Set(), skipReplied: new Set(), skipContacted: new Set() };
  const skipStage = new Set();
  const skipReplied = new Set();
  const skipContacted = new Set();
  const CHUNK = 200;
  for (let i = 0; i < prospectIds.length; i += CHUNK) {
    const slice = prospectIds.slice(i, i + CHUNK);
    const { data } = await supabaseAdmin
      .from("prospects")
      .select("id, data")
      .in("id", slice);
    for (const r of data || []) {
      const d = r.data || {};
      if (SKIP_STAGES.has(d.stage)) skipStage.add(r.id);
      if (d.lastRepliedAt) skipReplied.add(r.id);
      if (d.lastContactedAt) skipContacted.add(r.id);
    }
  }
  return { skipStage, skipReplied, skipContacted };
}

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = rateLimitOr429(`campaigns-enqueue:${user.id}`, LIMITS.prospectUpsert);
  if (limited) return limited;

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const primaries = Array.isArray(body?.primaries) ? body.primaries : [];
  if (!primaries.length) return NextResponse.json({ error: "No primaries" }, { status: 400 });
  if (primaries.length > MAX_PER_CAMPAIGN) {
    return NextResponse.json({ error: `Max ${MAX_PER_CAMPAIGN} per campaign.` }, { status: 413 });
  }

  const campaignLabel = String(body?.campaignLabel || "campaign").slice(0, 100);
  const fromName = body?.fromName || null;
  const replyTo = body?.replyTo || null;
  // Which mailbox this whole campaign sends from — "main" (Gmail, default,
  // every existing caller keeps working unchanged) or "resend" (bulk/cold
  // outreach, isolated from Gmail's reputation). Chases inherit the same
  // provider/identity as their primary further down.
  const provider = body?.provider === "resend" ? "resend" : "main";
  const identity = body?.identity || null;
  const dripSeconds = Math.max(1, Number(body?.dripSeconds) || DEFAULT_DRIP_SECONDS);
  const chase = body?.chase || {};
  const chaseEnabled = !!chase?.enabled;
  const chaseDays = Math.max(1, Math.min(MAX_DAYS_AHEAD, Number(chase?.delayDays) || 3));
  // Deliberate, narrow override for "skip already-contacted" — a hand-picked
  // resend to a small, specific list (testing, "they say they never got it").
  // Independently capped here regardless of what the client sends: this is
  // what actually prevents the checkbox being turned into a bulk-resend
  // loophole by editing the request directly instead of using the UI.
  const OVERRIDE_CONTACTED_MAX = 10;
  const overrideContacted = !!body?.overrideContacted && primaries.length <= OVERRIDE_CONTACTED_MAX;
  // Set by the client's "immediate send" path (small hand-picked lists) —
  // the primaries were ALREADY sent one-by-one via a direct /api/send-email
  // call before this request, so there's nothing to insert or dedup for
  // them here. This call exists purely to schedule the chase follow-ups on
  // the normal delayDays timer, reusing the same chase-building logic below
  // instead of duplicating it client-side.
  const primariesAlreadySent = !!body?.primariesAlreadySent && primaries.length <= OVERRIDE_CONTACTED_MAX;

  // Auto-BCC if the client didn't specify one, so the operator always gets a
  // copy in their sending inbox for verification. Server-injected — the UI
  // can't accidentally turn it off.
  const bccExplicit = body?.bcc || null;
  const bccFallback = await loadOperatorFromEmail();
  const bcc = bccExplicit || bccFallback || null;

  // ── Dedup pass ────────────────────────────────────────────────────────
  // Three separate reasons someone gets skipped, tracked separately so the
  // UI can tell the operator exactly what happened. Order matters: we build
  // sets first so a single recipient can hit multiple reasons and each is
  // reported honestly (the summary line reads better with real numbers).
  const validPrimaries = primaries.filter((p) => isEmail(p?.toEmail) && p?.subject && p?.body);
  const recipientEmails = [...new Set(validPrimaries.map((p) => String(p.toEmail).trim().toLowerCase()))];
  const prospectIds = [...new Set(validPrimaries.map((p) => p.prospectId).filter(Boolean))];
  const [recentlyEmailed, alreadyQueued, prospectSkips, suppressions] = await Promise.all([
    loadRecentlyEmailed(recipientEmails),
    loadAlreadyQueued(recipientEmails),
    loadProspectSkips(prospectIds),
    loadSuppressions(),
  ]);

  let skipRecentSend = 0, skipReplied = 0, skipStage = 0, skipAlreadyQueued = 0, skipContacted = 0, skipSuppressed = 0;
  const now = Date.now();
  const horizon = now + MAX_DAYS_AHEAD * 24 * 3600 * 1000;
  const rows = [];
  const rejected = [];
  // Effective index for `dripSeconds * idx` scheduling — the original loop
  // index would leave gaps when we skip recipients (e.g. skip 5 → 6th
  // recipient still gets scheduled 6*30s from now, which drifts everyone
  // needlessly). Use a monotonically-incrementing counter for actual queue
  // rows so drip stays tight.
  let dripIdx = 0;

  primaries.forEach((p) => {
    if (!isEmail(p?.toEmail)) { rejected.push({ toEmail: p?.toEmail, reason: "invalid email" }); return; }
    if (!p?.subject || !p?.body) { rejected.push({ toEmail: p.toEmail, reason: "missing subject/body" }); return; }
    const emailLower = String(p.toEmail).trim().toLowerCase();
    let primaryTs = now;

    if (primariesAlreadySent) {
      // No dedup, no primary row — this recipient was already, genuinely
      // sent to moments ago by the caller. Only the chase (below) applies.
    } else {
      if (suppressions.has(emailLower)) {
        skipSuppressed++;
        rejected.push({ toEmail: p.toEmail, reason: "suppressed / DNC" });
        return;
      }
      // Skip in priority order (recent send is the "loudest" reason — they
      // definitely don't want the SAME email again).
      if (!overrideContacted && recentlyEmailed.has(emailLower)) {
        skipRecentSend++;
        rejected.push({ toEmail: p.toEmail, reason: `already emailed in last ${DEDUP_WINDOW_DAYS} days` });
        return;
      }
      if (alreadyQueued.has(emailLower)) {
        skipAlreadyQueued++;
        rejected.push({ toEmail: p.toEmail, reason: "already queued (pending send) — not queuing again" });
        return;
      }
      if (!overrideContacted && p.prospectId && prospectSkips.skipContacted.has(p.prospectId)) {
        skipContacted++;
        rejected.push({ toEmail: p.toEmail, reason: "already contacted (live record) — skip already-contacted is always enforced" });
        return;
      }
      if (p.prospectId && prospectSkips.skipReplied.has(p.prospectId)) {
        skipReplied++;
        rejected.push({ toEmail: p.toEmail, reason: "already replied — handled manually" });
        return;
      }
      if (p.prospectId && prospectSkips.skipStage.has(p.prospectId)) {
        skipStage++;
        rejected.push({ toEmail: p.toEmail, reason: "stage is won/booked/lost/dnc" });
        return;
      }
    }

    let primaryId = null;
    if (!primariesAlreadySent) {
      // Primary scheduled `dripSeconds * dripIdx` from now. First goes out
      // right away (the enqueue endpoint kicks the processor immediately).
      primaryTs = now + dripIdx * dripSeconds * 1000;
      dripIdx++;
      primaryId = makeQueueId();

      rows.push({
        id: primaryId,
        prospect_id: p.prospectId || null,
        to_email: String(p.toEmail).trim().toLowerCase(),
        subject: String(p.subject).slice(0, 998),
        body: String(p.body).slice(0, 200_000),
        from_name: fromName,
        reply_to: replyTo,
        bcc,
        campaign_label: campaignLabel,
        parent_send_id: null,
        step_index: 1,
        scheduled_for: new Date(primaryTs).toISOString(),
        status: "pending",
        created_by: user.id,
        data: { ...(p.data || {}), source: "campaigns_enqueue", provider, identity },
      });
    }

    if (chaseEnabled) {
      const chaseTs = primaryTs + chaseDays * 24 * 3600 * 1000;
      if (chaseTs > horizon) { rejected.push({ toEmail: p.toEmail, reason: "chase past 90d horizon" }); return; }

      const vars = p.data || {};
      const chaseSubject = interpolate(chase.subjectTemplate || `Follow-up: ${p.subject}`, vars);
      const chaseBody = interpolate(chase.bodyTemplate || "Just following up on my previous email — happy to answer any questions.\n\nKind regards,\nLisa", vars);

      rows.push({
        id: makeQueueId(),
        prospect_id: p.prospectId || null,
        to_email: String(p.toEmail).trim().toLowerCase(),
        subject: chaseSubject.slice(0, 998),
        body: chaseBody.slice(0, 200_000),
        from_name: fromName,
        reply_to: replyTo,
        bcc,
        campaign_label: campaignLabel,
        parent_send_id: primaryId,
        step_index: 2,
        scheduled_for: new Date(chaseTs).toISOString(),
        status: "pending",
        created_by: user.id,
        data: { source: "campaigns_enqueue", chaseOf: primaryId, provider, identity },
      });
    }
  });

  if (!rows.length) {
    return NextResponse.json({
      error: "No valid rows",
      rejected,
      skipped: {
        alreadyEmailedRecently: skipRecentSend,
        alreadyQueued: skipAlreadyQueued,
        alreadyContacted: skipContacted,
        alreadyReplied: skipReplied,
        wonOrBookedOrDnc: skipStage,
        total: skipRecentSend + skipAlreadyQueued + skipContacted + skipReplied + skipStage,
        dedupWindowDays: DEDUP_WINDOW_DAYS,
      },
    }, { status: 400 });
  }

  // Batched insert so Supabase doesn't reject a huge single payload.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from("email_queue").insert(chunk);
    if (error) {
      return NextResponse.json({ error: error.message, insertedBeforeError: inserted }, { status: 500 });
    }
    inserted += chunk.length;
  }

  const primaryCount = rows.filter((r) => r.step_index === 1).length;
  const chaseCount = rows.length - primaryCount;
  const lastScheduled = rows.reduce((m, r) => Math.max(m, +new Date(r.scheduled_for)), 0);

  // Vercel Hobby limits cron to once a day — so kick the processor RIGHT NOW
  // for the primaries whose `scheduled_for` is already due. Chases scheduled
  // for later dates wait for the 01:00 UTC cron. This POST is fire-and-forget
  // (we don't await the promise) so the enqueue call still returns instantly
  // to the client and the operator can safely close the tab.
  try {
    const origin = new URL(request.url).origin;
    fetch(`${origin}/api/email-queue/process`, {
      method: "POST",
      headers: process.env.CRON_SECRET
        ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
        : {},
    }).catch(() => { /* swallow — cron will retry later */ });
  } catch { /* URL parse issue, safe to ignore */ }

  return NextResponse.json({
    ok: true,
    campaignLabel,
    inserted,
    primaries: primaryCount,
    chases: chaseCount,
    bcc,
    rejected,
    skipped: {
      alreadyEmailedRecently: skipRecentSend,
      alreadyQueued: skipAlreadyQueued,
      alreadyContacted: skipContacted,
      alreadyReplied: skipReplied,
      wonOrBookedOrDnc: skipStage,
      total: skipRecentSend + skipAlreadyQueued + skipContacted + skipReplied + skipStage,
      dedupWindowDays: DEDUP_WINDOW_DAYS,
    },
    firstSendAt: rows[0].scheduled_for,
    lastSendAt: new Date(lastScheduled).toISOString(),
  });
}
