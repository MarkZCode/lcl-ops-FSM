// Gmail Push Notification webhook.
// Google Pub/Sub calls this endpoint the moment a new email arrives in the
// Gmail inbox. We then fetch the new message(s) via Gmail API and log any
// replies into the matching job's activity thread.
//
// Env vars required (server-only):
//   GMAIL_CLIENT_ID       – OAuth2 client ID
//   GMAIL_CLIENT_SECRET   – OAuth2 client secret
//   GMAIL_REFRESH_TOKEN   – long-lived refresh token (from OAuth flow)
//   GMAIL_WEBHOOK_SECRET  – a random string we verify to reject spoofed pings
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getGmailAccessToken, headerVal, decodeBody, cleanSnippet,
  getAttachments, extractFromEmail, logInboundReply,
} from "@/lib/gmailReply";

async function fetchMessage(accessToken, messageId) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.ok ? res.json() : null;
}

export async function POST(request) {
  const secret = process.env.GMAIL_WEBHOOK_SECRET;
  const configured =
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN;

  if (!configured) {
    return NextResponse.json({ ok: true }); // silently accept while not yet configured
  }

  // Once Gmail is wired up, require a shared secret on the webhook so random
  // internet POSTs can't spoof "you got mail" pings into our DB. Configure
  // the secret as a `?token=…` query param on the Pub/Sub push endpoint URL
  // (or pass it in the `x-webhook-secret` header from a trusted forwarder).
  if (secret) {
    const url = new URL(request.url);
    const supplied =
      url.searchParams.get("token") ||
      url.searchParams.get("secret") ||
      request.headers.get("x-webhook-secret") ||
      "";
    if (supplied !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Pub/Sub message contains base64-encoded data.
  const raw = body?.message?.data;
  if (!raw) return NextResponse.json({ ok: true });

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ ok: true });
  }
  const historyId = decoded.historyId;
  const email = decoded.emailAddress;
  if (!email || !historyId) return NextResponse.json({ ok: true });

  // Fetch the new message(s) using Gmail's history API.
  const accessToken = await getGmailAccessToken().catch(() => null);
  if (!accessToken) return NextResponse.json({ ok: true });

  // Get the last processed historyId from our settings, or start from this one.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("data")
    .eq("id", "singleton")
    .maybeSingle();

  const lastHistoryId = settingsRow?.data?.gmailHistoryId;
  const startId = lastHistoryId || String(Number(historyId) - 1);

  const histRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const hist = await histRes.json().catch(() => ({}));
  const added = hist.history?.flatMap((h) => h.messagesAdded || []) || [];

  for (const { message } of added) {
    const msg = await fetchMessage(accessToken, message.id);
    if (!msg) continue;
    const headers = msg.payload?.headers || [];
    const from = headerVal(headers, "from");
    const subject = headerVal(headers, "subject");
    const date = new Date(parseInt(msg.internalDate)).toISOString();
    const snippet = cleanSnippet(decodeBody(msg) || msg.snippet || "");
    const fromEmail = extractFromEmail(from);
    if (fromEmail === process.env.GMAIL_USER?.toLowerCase()) continue; // skip our own

    const msgId = headerVal(headers, "message-id") || message.id;
    const attachments = getAttachments(msg);

    // Logs to the job thread (if one exists) AND email_sends/prospects
    // (regardless of whether a job exists) — see lib/gmailReply.js for why
    // these must be independent, not nested.
    await logInboundReply(supabase, {
      fromEmail, fromHeader: from, subject, date, snippet, msgId, attachments,
    });
  }

  // Save the latest historyId so the next webhook starts from here.
  if (settingsRow?.data) {
    await supabase
      .from("app_settings")
      .update({ data: { ...settingsRow.data, gmailHistoryId: historyId } })
      .eq("id", "singleton");
  }

  return NextResponse.json({ ok: true });
}

// Google verifies the endpoint with a GET request (token validation).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("hub.challenge") || searchParams.get("token");
  return new Response(token || "ok", { status: 200 });
}
