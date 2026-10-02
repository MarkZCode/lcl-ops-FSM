// One attachment from a Gmail message, as base64 — so a certificate or photo
// a client emailed can be saved onto their job. Signed-in staff only.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const MAX_BYTES = 9 * 1024 * 1024;

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

export async function GET(request) {
  if (!(await requireUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const att = searchParams.get("att");
  if (!id || !att || !/^[\w-]+$/.test(id)) return NextResponse.json({ error: "id and att required" }, { status: 400 });
  if (!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN)) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${encodeURIComponent(att)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return NextResponse.json({ error: "Couldn't fetch that attachment." }, { status: r.status });
    const d = await r.json();
    if ((d.size || 0) > MAX_BYTES) return NextResponse.json({ error: "That file is too large to save (max 9 MB)." }, { status: 413 });
    // Gmail returns base64url; hand back standard base64.
    return NextResponse.json({ ok: true, base64: Buffer.from(d.data || "", "base64url").toString("base64"), size: d.size || 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
