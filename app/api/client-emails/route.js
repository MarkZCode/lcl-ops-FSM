// Reads recent inbox replies from a given client via the Gmail HTTP API.
// Previously this used IMAP (imapflow + GMAIL_APP_PASSWORD) which failed in
// production with "Network error" because the IMAP TLS connection was being
// torn down by Vercel's serverless runtime. Switched to OAuth so we share the
// proven Gmail credentials used by /api/gmail/inbox and /api/gmail/poll.
//
// Required env vars (same set used elsewhere):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
//
// Auth: still gated to signed-in users via requireUser.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { getGmailAccessToken, headerVal } from "@/lib/gmailReply";

// Was 30s — too tight. Listing + fetching up to 30 individual Gmail messages
// (even batched 8-at-a-time) can genuinely exceed 30s depending on Gmail API
// latency, and when Vercel kills the function mid-flight the connection just
// drops — the browser sees that as a raw network failure ("Network error
// checking the inbox"), not a clean error response, so there was nothing for
// the UI to show beyond that generic message. 60s is the max on Vercel's
// Hobby plan (matches /api/email-queue/process's own maxDuration).
export const runtime = "nodejs";
export const maxDuration = 60;

// Walk the multipart tree and return the first text/plain we find. Kept
// local (not in lib/gmailReply.js) because it needs the FULL body, not the
// 700-char-capped snippet decodeBody() there returns — this endpoint shows
// the operator the whole reply, not just a preview.
function decodeFullBody(msg) {
  const walk = (part) => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    for (const p of part.parts || []) {
      const got = walk(p);
      if (got) return got;
    }
    return "";
  };
  return walk(msg?.payload || null);
}

export async function POST(request) {
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configured =
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN;
  if (!configured) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const clientEmail = (body?.clientEmail || "").trim().toLowerCase();
  if (!clientEmail) {
    return NextResponse.json({ error: "Missing clientEmail" }, { status: 400 });
  }

  let accessToken;
  try { accessToken = await getGmailAccessToken(); }
  catch (err) {
    return NextResponse.json(
      { error: "Could not authenticate with Gmail.", details: String(err?.message || err) },
      { status: 502 }
    );
  }

  // Lookback last 90 days, max 15 messages — was 30, which meant up to 4
  // sequential rounds of 8 parallel Gmail API calls. Checking one client's
  // replies rarely needs more than a handful of recent messages; halving
  // the cap meaningfully cuts worst-case latency without losing anything
  // an operator would actually look for here.
  const since = Math.floor((Date.now() - 90 * 24 * 3600 * 1000) / 1000);
  const q = encodeURIComponent(`{from:${clientEmail} to:${clientEmail}} after:${since}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=15`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    return NextResponse.json(
      { error: "Could not list Gmail messages.", details: `HTTP ${listRes.status}` },
      { status: 502 }
    );
  }
  const list = await listRes.json().catch(() => ({}));
  const ids = (list.messages || []).map((m) => m.id);
  if (!ids.length) return NextResponse.json({ messages: [] });

  // Fetch each message body in parallel (up to 15 in flight).
  // Removed batching (chunks of 8) because sequential rounds easily trip Vercel's
  // 10-second Hobby plan timeout. Gmail API limit is 250 units/sec (message.get = 5),
  // so 15 concurrent requests is perfectly safe and finishes much faster.
  const metas = await Promise.all(
    ids.map((id) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    )
  );
  
  const messages = [];
  for (const m of metas) {
    if (!m) continue;
    const headers = m.payload?.headers || [];
    const text = (decodeFullBody(m) || m.snippet || "").trim().slice(0, 2000);
    messages.push({
      messageId: headerVal(headers, "message-id") || `g-${m.id}`,
      from: headerVal(headers, "from") || clientEmail,
      to: headerVal(headers, "to") || clientEmail,
      subject: headerVal(headers, "subject") || "(no subject)",
      date: new Date(parseInt(m.internalDate || "0", 10)).toISOString(),
      snippet: text,
    });
  }
  messages.sort((a, b) => new Date(a.date) - new Date(b.date));
  return NextResponse.json({ messages });
}
