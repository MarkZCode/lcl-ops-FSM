// Gmail polling fallback — fetches recent inbox messages directly via the
// Gmail API and processes them the same way the Pub/Sub webhook would.
// Use this when Pub/Sub setup is too heavy (skips the Google Cloud project
// + topic + push subscription dance). Run on a vercel cron, or hit the
// "Check now" button on the Email Log page.
//
// Required env vars (same as the webhook):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER
// Optional: POLL_LOOKBACK_HOURS (default 24)

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getGmailAccessToken, headerVal, decodeBody, cleanSnippet,
  getAttachments, extractFromEmail, logInboundReply,
} from "@/lib/gmailReply";

// Vercel Cron always invokes the scheduled path with GET, never POST — this
// route only had a POST handler, so every single scheduled run 405'd
// silently (cron failures don't surface anywhere obvious; nothing alerted
// on it). That's the actual reason inbound replies were never being
// auto-detected: the manual "Check now" button on the Email Log page (which
// POSTs) worked fine the few times someone clicked it, but the daily
// unattended cron run has been failing since this was set up. GET now
// delegates to the same handler as POST.
export async function GET(request) { return POST(request); }

export async function POST(request) {
  // Accept service-role key (cron), CRON_SECRET (vercel cron), or any
  // signed-in user's JWT (manual "Check now" button). Reject everything else —
  // this route reads the mailbox and mutates email_sends/prospects rows.
  const bearer = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();
  const isService =
    (process.env.SUPABASE_SERVICE_ROLE_KEY && bearer === process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET);
  if (!isService) {
    const { requireUser } = await import("@/lib/supabaseAdmin");
    if (!(await requireUser(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const configured =
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN;
  if (!configured) return NextResponse.json({ notConfigured: true }, { status: 503 });

  // Optional ?hours=N override — lets an admin (or this one-time catch-up)
  // sweep further back than the normal rolling window without touching the
  // env var default that the unattended cron uses every run.
  const url = new URL(request.url);
  const hoursOverride = Number(url.searchParams.get("hours"));
  const hours = hoursOverride > 0 ? hoursOverride : (Number(process.env.POLL_LOOKBACK_HOURS) || 24);
  const since = Math.floor((Date.now() - hours * 3600 * 1000) / 1000);

  let accessToken;
  try { accessToken = await getGmailAccessToken(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }

  // Query Gmail for recent inbox messages.
  const q = encodeURIComponent(`in:inbox after:${since}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const list = await listRes.json().catch(() => ({}));
  const ids = (list.messages || []).map((m) => m.id);

  if (!ids.length) return NextResponse.json({ ok: true, scanned: 0, matched: 0 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  let matched = 0;
  let loggedToJobCount = 0;
  for (const id of ids) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msg = await msgRes.json().catch(() => null);
    if (!msg) continue;

    const headers = msg.payload?.headers || [];
    const from = headerVal(headers, "from");
    const subject = headerVal(headers, "subject");
    const date = new Date(parseInt(msg.internalDate)).toISOString();
    const fromEmail = extractFromEmail(from);
    if (fromEmail === (process.env.GMAIL_USER || "").toLowerCase()) continue;

    const snippet = cleanSnippet(decodeBody(msg) || msg.snippet || "");
    const msgId = headerVal(headers, "message-id") || id;
    const attachments = getAttachments(msg);

    // Same shared logic the webhook uses — logs to job.activity (if a job
    // exists for this sender) AND email_sends/prospects independently.
    // Previously poll only ever wrote to email_sends/prospects; a reply from
    // someone who'd already progressed to a job never showed on that job's
    // communication thread. Now both paths get the same treatment.
    const result = await logInboundReply(supabase, {
      fromEmail, fromHeader: from, subject, date, snippet, msgId, attachments,
    });
    if (result.loggedToProspect) matched++;
    if (result.loggedToJob) loggedToJobCount++;
  }

  return NextResponse.json({ ok: true, scanned: ids.length, matched, loggedToJob: loggedToJobCount });
}
