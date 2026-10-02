// Fetch a single Gmail message's full body (text/plain) — used by the
// Inbox slide-over so the operator can read the full email without
// leaving the FSM.
//
// GET /api/gmail/message?id=<gmail-message-id>

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error(d.error_description || "no token");
  return d.access_token;
}

function headerVal(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function walk(part, out) {
  if (!part) return;
  if (part.mimeType === "text/plain" && part.body?.data) out.text = (out.text || "") + Buffer.from(part.body.data, "base64url").toString("utf-8");
  if (part.mimeType === "text/html"  && part.body?.data) out.html = (out.html || "") + Buffer.from(part.body.data, "base64url").toString("utf-8");
  // Files attached to the email — listed, not downloaded; the bytes are
  // fetched one at a time through /api/gmail/attachment when asked for.
  if (part.filename && part.body?.attachmentId) {
    (out.attachments = out.attachments || []).push({ id: part.body.attachmentId, name: part.filename, type: part.mimeType || "application/octet-stream", size: part.body.size || 0 });
  }
  (part.parts || []).forEach((p) => walk(p, out));
}

export async function GET(request) {
  // Full message bodies are sensitive — only signed-in FSM users may read them.
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const configured = process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN;
  if (!configured) return NextResponse.json({ notConfigured: true }, { status: 503 });

  let accessToken;
  try { accessToken = await getAccessToken(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }

  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return NextResponse.json({ error: "gmail fetch failed" }, { status: r.status });
  const m = await r.json();
  const headers = m.payload?.headers || [];
  const out = {};
  walk(m.payload, out);
  return NextResponse.json({
    ok: true,
    id: m.id,
    threadId: m.threadId,
    labels: m.labelIds || [],
    snippet: m.snippet || "",
    subject: headerVal(headers, "subject"),
    from: headerVal(headers, "from"),
    to: headerVal(headers, "to"),
    cc: headerVal(headers, "cc"),
    date: new Date(parseInt(m.internalDate || "0", 10)).toISOString(),
    text: (out.text || "").trim(),
    html: out.html || "",
    attachments: out.attachments || [],
    messageIdHeader: headerVal(headers, "message-id"),
  });
}
