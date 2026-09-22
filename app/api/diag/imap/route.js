// Connectivity check for the Hostinger mailboxes.
//
// Exists so an IMAP problem can be diagnosed without a login and without
// reading anybody's mail: it logs in to each configured mailbox, reports
// whether the connection and authentication worked, and returns the message
// count. No sender, subject or body ever leaves this endpoint.
//
// Gated on CRON_SECRET — the same shared secret the scheduled jobs use.
import { NextResponse } from "next/server";
import { testMailboxes, configuredMailboxes } from "@/lib/hostingerInbox";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace("Bearer ", "").trim();
  if (!secret || given !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const identities = configuredMailboxes();
  if (!identities.length) {
    return NextResponse.json({ configured: [], note: "No per-mailbox passwords set." });
  }
  const results = await testMailboxes(identities);
  return NextResponse.json({
    host: process.env.HOSTINGER_IMAP_HOST || "imap.hostinger.com",
    port: Number(process.env.HOSTINGER_IMAP_PORT || 993),
    configured: identities,
    results,
  });
}
