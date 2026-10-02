// Secure server-side email send.
// Supports Gmail SMTP (recommended for a @gmail.com address) and Resend.
// All secrets live ONLY in server env (.env.local) — never in the browser.
//
//   Gmail SMTP:   GMAIL_USER=landlordcompliancelondon@gmail.com
//                 GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16-char app password)
//   Resend (alt): RESEND_API_KEY=re_xxxx   (only works from a verified domain)
//
// Every send (success OR failure) is logged to the `email_sends` table so we
// can: (1) enforce Gmail's daily send cap server-side, (2) match inbound
// replies back to the original send, and (3) show a per-prospect history.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";
import { sendEmailRaw } from "@/lib/emailSend";
import { buildHtml } from "@/lib/emailTrack";
import { EMAIL_PROVIDERS, resolveProvider, mailboxForPurpose } from "@/lib/emailProviders";

// Loose RFC-5322-ish check — keeps obviously broken addresses out so the
// SMTP server doesn't reject silently or, worse, accept and bounce later.
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (s) => typeof s === "string" && EMAIL_RX.test(s.trim());
const allEmails = (v) => {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr.every(isEmail);
};

function startOfTodayUtcIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// Counted PER PROVIDER — "main" (Gmail) and "resend" (bulk outreach) each
// have their own cap so a big commercial-lead campaign on Resend can never
// eat into the Gmail quota real client/prospect emails depend on, or vice
// versa. Rows written before this split have no `data.provider` tag at
// all — treated as "main" (that's genuinely what they were).
async function todaysSentCount(provider) {
  if (!supabaseAdmin) return 0;
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

async function logSend(row) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from("email_sends").insert(row).then(
    () => {},
    () => {} // swallow — logging must never block the send response
  );
}

function makeId() {
  return "es-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// SMTP send + filing the copy in the mailbox's Sent folder over IMAP.
export const maxDuration = 30;

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(`send-email:${user.id}`, LIMITS.sendEmail);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { to, subject, text, fromName, bcc, attachments, prospectId, campaignLabel, purpose } = body || {};
  // Which mailbox this goes out from is decided HERE, not by the browser.
  // mailboxForPurpose reads the Hostinger/Resend credentials to know what's
  // actually available, and those are server-only env vars — asking the
  // client would always get "not configured" and quietly send everything
  // from Gmail. The caller sends the template purpose; the server maps it
  // to accounts@ / bookings@ / certificates@ and so on. An explicit
  // provider/identity in the request still wins, for the outreach paths
  // that choose their own.
  const routed = mailboxForPurpose(purpose);
  const identity = body?.identity ?? routed.identity;
  const provider = resolveProvider(body?.provider ?? routed.provider);
  const dailyCap = EMAIL_PROVIDERS[provider].dailyCap;
  // attachments: [{ filename, base64, contentType }]
  const atts = Array.isArray(attachments) ? attachments : [];
  // Never reply to a dead .co.uk address — fall back to the Gmail account so
  // client replies actually land in the inbox.
  let replyTo = body?.replyTo;
  if (!replyTo || /co\.uk/i.test(replyTo)) replyTo = process.env.GMAIL_USER || replyTo;

  if (!to || !subject || !text) {
    return NextResponse.json(
      { error: "Missing required fields: to, subject, text" },
      { status: 400 }
    );
  }
  if (!allEmails(to)) {
    return NextResponse.json({ error: "Invalid 'to' address" }, { status: 400 });
  }
  if (bcc && !allEmails(bcc)) {
    return NextResponse.json({ error: "Invalid 'bcc' address" }, { status: 400 });
  }
  if (replyTo && !isEmail(replyTo)) {
    return NextResponse.json({ error: "Invalid 'replyTo' address" }, { status: 400 });
  }
  if (typeof subject !== "string" || subject.length > 998) {
    return NextResponse.json({ error: "Subject too long" }, { status: 400 });
  }
  if (typeof text !== "string" || text.length > 200_000) {
    return NextResponse.json({ error: "Body too long" }, { status: 400 });
  }

  // ---- Daily quota gate (per provider) ----
  // Settings → Rules can set a lower daily limit than the provider's own.
  let dailyCapInForce = dailyCap;
  if (supabaseAdmin) {
    const { data: rulesRow } = await supabaseAdmin.from("app_settings").select("data").eq("id", "rules").maybeSingle();
    const own = Number(rulesRow?.data?.emailDailyCap) || 0;
    if (own > 0) dailyCapInForce = Math.min(dailyCap, own);
  }
  const todayCount = await todaysSentCount(provider);
  if (todayCount >= dailyCapInForce) {
    return NextResponse.json(
      {
        error: `Daily ${EMAIL_PROVIDERS[provider].label} cap reached (${dailyCapInForce}). Resumes at midnight UTC.`,
        quotaReached: true,
        provider,
        sentToday: todayCount,
        dailyCap: dailyCapInForce,
      },
      { status: 429 }
    );
  }

  // Drop a stale .co.uk BCC too (would bounce a copy).
  const safeBcc = bcc && /co\.uk/i.test(bcc) ? process.env.GMAIL_USER : bcc;

  const toEmail = Array.isArray(to) ? to[0] : to;
  const sendId = makeId();

  // ---- Suppression-list check ----
  // Skip sends to any address the recipient unsubscribed from.
  if (supabaseAdmin) {
    const { data: suppRow } = await supabaseAdmin
      .from("app_settings")
      .select("data")
      .eq("id", "email_suppressions")
      .maybeSingle();
    const suppressed = suppRow?.data?.emails || [];
    if (suppressed.includes(String(toEmail).trim().toLowerCase())) {
      return NextResponse.json({ error: "Recipient unsubscribed", suppressed: true }, { status: 422 });
    }
  }

  const logBase = {
    id: sendId,
    to_email: String(toEmail).trim().toLowerCase(),
    subject,
    sent_by: user.id,
    prospect_id: prospectId || null,
    campaign_label: campaignLabel || null,
    data: { fromName: fromName || null, hasAttachments: atts.length > 0, provider, identity: identity || null },
  };

  // Build HTML with open-pixel, link rewriting, and unsubscribe footer.
  const htmlBody = buildHtml({ text, sendId, fromName, unsubToken: sendId });

  const result = await sendEmailRaw({ to, subject, text, html: htmlBody, fromName, replyTo, bcc: safeBcc, attachments: atts, provider, identity });
  if (!result.ok) {
    // Log the REAL underlying error (`detail`), not just our generic wrapper
    // text — `error` was always truthy so `detail` was previously never
    // making it into the database at all, which is why diagnosing a real
    // failure meant re-testing credentials by hand instead of just reading
    // the log.
    await logSend({ ...logBase, status: "failed", error: `${result.error} — ${result.detail || ""}`.trim().slice(0, 500) });
    return NextResponse.json(
      {
        error: result.error, details: result.detail, notConfigured: result.notConfigured,
        quotaReached: result.quotaReached || undefined,
      },
      { status: result.status || 502 }
    );
  }

  await logSend({ ...logBase, status: "sent", message_id: result.messageId });
  return NextResponse.json({
    ok: true,
    id: result.messageId,
    via: result.via,
    provider,
    sentToday: todayCount + 1,
    dailyCap,
  });
}
