// Live Gmail feed — returns the last 50 inbox messages + last 50 sent
// messages, merged and sorted newest-first. No DB persistence: every call
// hits Gmail fresh, so this is genuinely "what's in the mailbox right now".
//
// Required env vars:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
// Optional:
//   GMAIL_USER (used only to label "from-me" rows for display)
//
// Query string:
//   ?box=inbox|sent|all  (default "all")
//   ?limit=50            (per box, max 100)
//   ?q=<extra query>     (appended to the Gmail search filter)

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

function parseAddress(raw) {
  if (!raw) return { name: "", email: "" };
  const m = raw.match(/^(.*?)\s*<(.+?)>\s*$/);
  if (m) return { name: m[1].replace(/^["']|["']$/g, "").trim(), email: m[2].trim().toLowerCase() };
  return { name: raw.trim(), email: raw.trim().toLowerCase() };
}

async function fetchList(accessToken, query, limit) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${limit}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await r.json().catch(() => ({}));
  return (j.messages || []).map((m) => m.id);
}

async function fetchMeta(accessToken, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const m = await r.json().catch(() => null);
  if (!m) return null;
  const headers = m.payload?.headers || [];
  const from = parseAddress(headerVal(headers, "from"));
  const to = parseAddress(headerVal(headers, "to"));
  return {
    id: m.id,
    threadId: m.threadId,
    labels: m.labelIds || [],
    snippet: m.snippet || "",
    subject: headerVal(headers, "subject") || "(no subject)",
    from,
    to,
    date: new Date(parseInt(m.internalDate || "0", 10)).toISOString(),
    unread: (m.labelIds || []).includes("UNREAD"),
    starred: (m.labelIds || []).includes("STARRED"),
  };
}

export async function GET(request) {
  // The company mailbox is sensitive — only signed-in FSM users may read it.
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configured = process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN;
  if (!configured) return NextResponse.json({ notConfigured: true }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const box = (searchParams.get("box") || "all").toLowerCase();
  const extra = searchParams.get("q") || "";
  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit")) || 50));

  let accessToken;
  try { accessToken = await getAccessToken(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }

  const queries = [];
  if (box === "inbox" || box === "all") queries.push({ kind: "inbox", q: `in:inbox ${extra}`.trim() });
  if (box === "sent"  || box === "all") queries.push({ kind: "sent",  q: `in:sent ${extra}`.trim() });

  const idLists = await Promise.all(queries.map((q) => fetchList(accessToken, q.q, limit)));
  // Tag each id with its source box, then fetch metadata in parallel (cap concurrency at 8).
  const tagged = [];
  idLists.forEach((ids, i) => ids.forEach((id) => tagged.push({ id, kind: queries[i].kind })));
  // dedupe (a message could appear in both lists, e.g. starred in sent)
  const seen = new Set();
  const unique = tagged.filter((t) => seen.has(t.id) ? false : (seen.add(t.id), true));

  const out = [];
  for (let i = 0; i < unique.length; i += 8) {
    const slice = unique.slice(i, i + 8);
    const metas = await Promise.all(slice.map((t) => fetchMeta(accessToken, t.id)));
    metas.forEach((m, idx) => {
      if (!m) return;
      out.push({ ...m, kind: slice[idx].kind });
    });
  }
  out.sort((a, b) => new Date(b.date) - new Date(a.date));

  return NextResponse.json({
    ok: true,
    count: out.length,
    me: (process.env.GMAIL_USER || "").toLowerCase(),
    messages: out,
  });
}
