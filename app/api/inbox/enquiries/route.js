// Scan the company mailboxes for NEW enquiries and turn each into a draft
// quote — the email equivalent of the website form hook (/api/enquiry).
//
// Triggered two ways:
//   • POST from the app while anyone has it open (lib/store.js, every few
//     minutes) — signed-in users only;
//   • GET from the daily cron as a backstop — CRON_SECRET required.
//
// Never emails anyone and never marks mail as read. Idempotent: each email
// is keyed on its Message-ID, so scanning the same inbox twice (or from two
// devices at once) makes one quote, not two.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { configuredMailboxes, fetchRecentInbound } from "@/lib/hostingerInbox";
import { classifyEmail, isInternalSender } from "@/lib/emailEnquiry";
import { createQuoteFromEnquiry, loadRows } from "@/lib/enquiryIntake";

export const runtime = "nodejs";
export const maxDuration = 60;

// Recruiting mail (engineers@) is never a customer enquiry.
const SKIP_MAILBOXES = new Set(["engineers"]);

// Several open tabs all poll; one real scan per minute per instance is plenty.
let lastRun = 0;
let lastResult = null;

async function scan({ sinceDays = 7 } = {}) {
  const ownDomains = [
    process.env.HOSTINGER_DOMAIN || "landlordcompliancelondon.uk",
    "landlordcompliancelondon.co.uk",
  ];
  const ownAddresses = [process.env.GMAIL_USER || "landlordcompliancelondon@gmail.com"];
  const ctx = { ownDomains, ownAddresses };

  const [clients, jobs] = await Promise.all([loadRows("clients"), loadRows("jobs")]);

  // A client we already have an open job for — their "Re:" is a reply on
  // that job, not a new enquiry.
  const openByEmail = new Set(
    jobs
      .filter((j) => !["paid", "cancelled"].includes(j.status))
      .map((j) => clients.find((c) => c.id === j.clientId)?.email?.toLowerCase())
      .filter(Boolean)
  );
  ctx.knownClientWithOpenJob = (addr) => openByEmail.has(String(addr || "").toLowerCase());

  // Messages already on a job (logged replies, or an enquiry already turned
  // into a quote) are skipped outright.
  const seenIds = new Set();
  for (const j of jobs) {
    if (j.enquiryKey?.startsWith("email:")) seenIds.add(j.enquiryKey.slice(6));
    for (const a of j.activity || []) if (a.meta?.messageId) seenIds.add(a.meta.messageId);
  }

  const identities = configuredMailboxes().filter((id) => !SKIP_MAILBOXES.has(id));
  const { messages, mailboxes } = await fetchRecentInbound({
    identities,
    sinceDays,
    skipSender: (addr) => isInternalSender(addr, ctx),
  });

  const created = [];
  const skipped = {};
  const seenThisRun = new Set();
  for (const msg of messages) {
    // The same email sent to info@ AND bookings@ arrives twice with one
    // Message-ID — one quote.
    if (seenIds.has(msg.messageId) || seenThisRun.has(msg.messageId)) {
      skipped["already handled"] = (skipped["already handled"] || 0) + 1;
      continue;
    }
    seenThisRun.add(msg.messageId);
    const c = classifyEmail(msg, ctx);
    if (!c.isEnquiry) {
      skipped[c.reason] = (skipped[c.reason] || 0) + 1;
      continue;
    }
    try {
      const r = await createQuoteFromEnquiry(c.enquiry, {
        key: `email:${msg.messageId}`,
        seed: msg.messageId,
        clients,
        jobs,
      });
      if (!r.duplicate) {
        created.push({
          jobId: r.job.id,
          client: r.client.name,
          from: msg.from.address,
          mailbox: msg.mailbox,
          services: r.job.services,
          price: r.job.price,
          subject: msg.subject,
        });
      }
    } catch (err) {
      skipped[`error: ${String(err.message || err).slice(0, 80)}`] = 1;
    }
  }

  return {
    ok: true,
    created,
    skipped,
    mailboxes: mailboxes.map((m) => ({ mailbox: m.mailbox || m.identity, ok: m.ok, scanned: m.scanned, error: m.error })),
  };
}

async function run(sinceDays) {
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });
  if (!configuredMailboxes().length) return NextResponse.json({ skipped: true, reason: "No mailboxes configured" });
  if (Date.now() - lastRun < 60_000 && lastResult) {
    return NextResponse.json({ ...lastResult, cached: true, created: [] });
  }
  lastRun = Date.now();
  try {
    lastResult = await scan({ sinceDays });
    return NextResponse.json(lastResult);
  } catch (err) {
    lastRun = 0;
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  // Unlike some older crons this one refuses when no secret is set: it
  // reads customers' email and writes jobs, so it must never be open.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run(3);
}

export async function POST(request) {
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let days = 7;
  try {
    const body = await request.json();
    if (Number(body?.sinceDays) > 0) days = Math.min(30, Number(body.sinceDays));
  } catch { /* no body — defaults */ }
  return run(days);
}
