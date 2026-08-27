// Start (or renew) Gmail push notifications. Call this once to register the
// webhook. Gmail watch subscriptions expire every 7 days — call this again to
// renew (you can call it on a schedule or manually from Settings).
// Guarded: admin only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabaseAdmin";
import { getGmailAccessToken } from "@/lib/gmailReply";

export async function POST(request) {
  // Accept either an admin user JWT or the service_role key (setup/cron use case).
  const bearer = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();
  const isServiceKey = bearer === process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isServiceKey && !(await requireAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured =
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN &&
    process.env.GMAIL_PUBSUB_TOPIC;

  if (!configured) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }

  try {
    const accessToken = await getGmailAccessToken();
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || "Watch failed", details: data }, { status: 500 });
    }
    return NextResponse.json({ ok: true, historyId: data.historyId, expiration: data.expiration });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
