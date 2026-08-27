// Vercel cron job — runs every 6 days to renew the Gmail push watch before
// it expires (Gmail watch subscriptions last 7 days).
// Secured by CRON_SECRET so only Vercel's scheduler can call it.
import { NextResponse } from "next/server";
import { getGmailAccessToken } from "@/lib/gmailReply";

export async function GET(request) {
  // Vercel sends the CRON_SECRET as an Authorization header.
  const auth = request.headers.get("authorization") || "";
  if (
    process.env.CRON_SECRET &&
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.GMAIL_CLIENT_ID ||
    !process.env.GMAIL_CLIENT_SECRET ||
    !process.env.GMAIL_REFRESH_TOKEN ||
    !process.env.GMAIL_PUBSUB_TOPIC
  ) {
    return NextResponse.json({ skipped: true, reason: "Gmail not configured" });
  }

  try {
    const accessToken = await getGmailAccessToken();
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/watch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topicName: process.env.GMAIL_PUBSUB_TOPIC,
          labelIds: ["INBOX"],
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("[cron/gmail-watch] watch renewal failed:", data);
      return NextResponse.json(
        { error: data.error?.message || "Watch renewal failed" },
        { status: 500 }
      );
    }
    const exp = new Date(parseInt(data.expiration)).toISOString();
    console.log(`[cron/gmail-watch] renewed OK — expires ${exp}`);
    return NextResponse.json({ ok: true, historyId: data.historyId, expiration: exp });
  } catch (err) {
    console.error("[cron/gmail-watch] error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
