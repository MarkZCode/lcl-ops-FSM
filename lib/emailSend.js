// Shared SMTP send helper — used by /api/send-email (user-initiated) and
// /api/email-queue/process (scheduled follow-ups). Keeps Gmail/Resend
// fallback logic in one place so both call sites stay in sync.
import nodemailer from "nodemailer";
import { RESEND_IDENTITIES, resolveProvider, hostingerFrom, hostingerCredentials } from "./emailProviders";

let cachedTransport;

// Hostinger SMTP — the same nodemailer transport Gmail already uses, just
// pointed at the company domain's mail server.
// One pooled transport PER MAILBOX, cached by address. Each connection
// authenticates as the mailbox it sends from — see hostingerCredentials in
// lib/emailProviders.js for why sending as an address you aren't logged in
// as is the setup that fails.
const hostingerPool = new Map();
function hostingerTransport(identity) {
  const creds = hostingerCredentials(identity);
  if (!creds) return null;
  const cached = hostingerPool.get(creds.user);
  if (cached) return cached;
  const port = Number(process.env.HOSTINGER_SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.HOSTINGER_SMTP_HOST || "smtp.hostinger.com",
    port,
    secure: port === 465,        // 465 = implicit TLS, 587 = STARTTLS
    auth: { user: creds.user, pass: creds.pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
  });
  hostingerPool.set(creds.user, transport);
  return transport;
}

function gmailTransport() {
  if (cachedTransport) return cachedTransport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  cachedTransport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    pool: true,                  // reuse a TLS connection across queue sends
    maxConnections: 1,           // serialise — Gmail dislikes parallel bursts
    maxMessages: 100,
  });
  return cachedTransport;
}

/**
 * Send an email. Returns { ok, via, messageId, status, error }.
 *
 * Never throws — caller checks `ok`. `status` mirrors the HTTP-style
 * intent (200 / 502 / 503) so the API wrapper can translate.
 *
 * @param {object} args
 * @param {string|string[]} args.to
 * @param {string} args.subject
 * @param {string} args.text          — plain-text body (always required)
 * @param {string} [args.html]        — HTML body; if omitted, built from text
 * @param {string} [args.fromName]
 * @param {string} [args.replyTo]
 * @param {string|string[]} [args.bcc]
 * @param {Array<{filename:string, base64:string, contentType?:string}>} [args.attachments]
 * @param {"main"|"resend"} [args.provider]  — defaults to "main" (Gmail),
 *   the exact behaviour every existing caller already gets. Pass "resend"
 *   for bulk/cold outreach that must NOT touch the Gmail account's
 *   reputation — resolves back to "main" automatically if Resend isn't
 *   configured yet, so nothing breaks mid-rollout.
 * @param {"commercial"|"engineers"|"agents"} [args.identity] — which
 *   outreach purpose this is, for the "from" address and reply routing.
 *   Only used when provider resolves to "resend".
 */
export async function sendEmailRaw({
  to,
  subject,
  text,
  html,
  fromName,
  replyTo,
  bcc,
  attachments,
  provider = "main",
  identity,
}) {
  const atts = Array.isArray(attachments) ? attachments : [];
  const resolvedProvider = resolveProvider(provider);

  // ---- Bulk/cold outreach: Resend, isolated from Gmail entirely ----
  if (resolvedProvider === "resend") {
    return sendViaResend({ to, subject, text, html, bcc, attachments: atts, identity });
  }

  // ---- Client-facing mail: the company domain, via Hostinger ----
  if (resolvedProvider === "hostinger") {
    const transport = hostingerTransport(identity);
    if (transport) {
      try {
        const info = await transport.sendMail({
          from: hostingerFrom(identity, fromName),
          to: Array.isArray(to) ? to.join(", ") : to,
          subject,
          text,
          html: html || undefined,
          // Replies go back to the same company mailbox, not a gmail.com one.
          replyTo: replyTo || hostingerFrom(identity),
          bcc: bcc || undefined,
          attachments: atts.length
            ? atts.map((a) => ({
                filename: a.filename,
                content: a.base64,
                encoding: "base64",
                contentType: a.contentType || "application/pdf",
              }))
            : undefined,
        });
        return { ok: true, via: "hostinger", messageId: info.messageId || null, status: 200 };
      } catch (err) {
        return {
          ok: false,
          via: "hostinger",
          status: 502,
          error: "Hostinger rejected the message. Check HOSTINGER_SMTP_USER / HOSTINGER_SMTP_PASSWORD and that the mailbox is allowed to send as this address.",
          detail: String(err?.response || err?.message || err),
        };
      }
    }
  }

  // Never reply to a dead .co.uk address — fall back to the Gmail account
  // so client replies actually land in the inbox.
  let safeReplyTo = replyTo;
  if (!safeReplyTo || /co\.uk/i.test(safeReplyTo)) {
    safeReplyTo = process.env.GMAIL_USER || safeReplyTo;
  }
  const safeBcc = bcc && /co\.uk/i.test(bcc) ? process.env.GMAIL_USER : bcc;

  const gmailUser = process.env.GMAIL_USER;
  const transporter = gmailTransport();

  // ---- Preferred: Gmail SMTP ----
  if (transporter && gmailUser) {
    try {
      const info = await transporter.sendMail({
        from: fromName ? `${fromName} <${gmailUser}>` : gmailUser,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        text,
        html: html || undefined,
        replyTo: safeReplyTo || undefined,
        bcc: safeBcc || undefined,
        attachments: atts.length
          ? atts.map((a) => ({
              filename: a.filename,
              content: a.base64,
              encoding: "base64",
              contentType: a.contentType || "application/pdf",
            }))
          : undefined,
      });
      return { ok: true, via: "gmail", messageId: info.messageId || null, status: 200 };
    } catch (err) {
      // Gmail's OWN daily sending cap (separate from and often lower than
      // this app's internal DAILY_CAP guess) rejects with 550 5.4.5. This is
      // a hard Google-side stop, not an auth/config problem — surfaced as a
      // distinct `quotaReached` so callers stop burning through the rest of
      // a batch with doomed retries (each one would fail exactly the same
      // way and just add failed-auth noise against the account) instead of
      // reporting it as a generic per-email failure.
      const raw = String(err?.response || err?.message || err);
      const gmailQuotaHit = err?.responseCode === 550 && /sending limit exceeded/i.test(raw);
      return {
        ok: false,
        via: "gmail",
        status: gmailQuotaHit ? 429 : 502,
        quotaReached: gmailQuotaHit,
        error: gmailQuotaHit
          ? "Gmail's own daily sending limit was hit (separate from this app's cap) — this resets on Google's own schedule, not midnight UTC."
          : "Gmail rejected the message. Check GMAIL_USER and that GMAIL_APP_PASSWORD is a valid 16-character app password.",
        // The real diagnostic detail — previously computed but never actually
        // logged anywhere (both call sites logged `error` first, which was
        // always truthy, so `detail` was silently dropped). Now surfaced.
        detail: raw,
      };
    }
  }

  // ---- Alternative: Resend (only reached here if Gmail isn't configured
  // at all — the normal "main" fallback path, unrelated to the dedicated
  // outreach identities above) ----
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ to, subject, text, html, bcc, attachments: atts, fromName });
  }

  return {
    ok: false,
    via: null,
    status: 503,
    error: "Email is not configured (set GMAIL_USER + GMAIL_APP_PASSWORD or RESEND_API_KEY).",
    notConfigured: true,
  };
}

// Shared Resend sender — used both for the deliberate "resend" outreach
// provider (with a branded identity: commercial/engineers/agents) and as
// the plain fallback when Gmail isn't configured at all (no identity, just
// fromName like the old inline code did).
async function sendViaResend({ to, subject, text, html, bcc, attachments = [], identity, fromName }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return {
      ok: false,
      via: null,
      status: 503,
      error: "Resend is not configured (set RESEND_API_KEY).",
      notConfigured: true,
    };
  }

  const id = identity ? RESEND_IDENTITIES[identity] : null;
  const from = id?.from || `${fromName || "Landlord Compliance London"} <onboarding@resend.dev>`;
  // Always route replies to the real inbox someone actually reads — never
  // to onboarding@resend.dev (Resend's sandbox address, not a real mailbox).
  const replyTo = id?.replyTo || process.env.GMAIL_USER || undefined;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html: html || undefined,
        reply_to: replyTo,
        bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
        attachments: attachments.length
          ? attachments.map((a) => ({ filename: a.filename, content: a.base64 }))
          : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        via: "resend",
        status: res.status,
        error: data?.message || "Resend rejected the request",
      };
    }
    return { ok: true, via: "resend", messageId: data?.id || null, status: 200 };
  } catch (err) {
    return {
      ok: false,
      via: "resend",
      status: 502,
      error: "Could not reach the email service.",
      detail: String(err?.message || err),
    };
  }
}
