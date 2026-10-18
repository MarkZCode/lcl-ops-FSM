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
import { configuredMailboxes, fetchRecentInbound, fetchRecentSent } from "@/lib/hostingerInbox";
import { classifyEmail, isInternalSender } from "@/lib/emailEnquiry";
import { createQuoteFromEnquiry, loadRows } from "@/lib/enquiryIntake";
import { runTaskSync } from "@/lib/taskSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Recruiting mail (engineers@) is never a customer enquiry.
// Recruiting mail (engineers@) and general info mail (info@) are never customer enquiries.
const SKIP_MAILBOXES = new Set(["engineers", "info"]);

// Several open tabs all poll; one real scan per minute per instance is plenty.
let lastRun = 0;
let lastResult = null;

// Append an inbound email to a job's conversation (idempotent on Message-ID).
async function attachToJob(jobId, msg) {
  const { data: row, error } = await supabaseAdmin.from("jobs").select("data").eq("id", jobId).maybeSingle();
  if (error || !row?.data) return false;
  const job = row.data;
  if ((job.activity || []).some((a) => a.meta?.messageId === msg.messageId)) return false;
  const entry = {
    id: "act-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: msg.date,
    by: msg.from.address,
    type: "email",
    direction: "in",
    title: `Email from client${msg.mailbox ? ` to ${msg.mailbox}` : ""}`,
    detail: `Subject: ${msg.subject}\n\n${String(msg.text || "").slice(0, 4000)}`,
    meta: { messageId: msg.messageId },
  };
  const next = { ...job, activity: [...(job.activity || []), entry], updatedAt: new Date().toISOString() };
  const { error: wErr } = await supabaseAdmin.from("jobs").upsert({ id: jobId, data: next });
  if (wErr) throw new Error(wErr.message);
  return true;
}

// An email the office sent (from webmail) onto a job's conversation.
async function attachOutbound(jobId, m) {
  const { data: row, error } = await supabaseAdmin.from("jobs").select("data").eq("id", jobId).maybeSingle();
  if (error || !row?.data) return false;
  const job = row.data;
  if ((job.activity || []).some((a) => a.meta?.messageId === m.messageId)) return false;
  // The app files a copy of everything IT sends into Sent too — those are
  // already on the job (same subject, within minutes). Don't log them twice.
  const t = new Date(m.date).getTime();
  const already = (job.activity || []).some(
    (a) => a.direction !== "in" && a.detail && String(a.detail).includes(m.subject) && Math.abs(new Date(a.at).getTime() - t) < 15 * 60 * 1000
  );
  if (already) return false;
  const entry = {
    id: "act-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: m.date,
    by: m.mailbox,
    type: "email",
    direction: "out",
    title: `Email sent from ${m.mailbox}`,
    detail: `Subject: ${m.subject}`,
    meta: { messageId: m.messageId, via: "webmail" },
  };
  const next = { ...job, activity: [...(job.activity || []), entry], updatedAt: new Date().toISOString() };
  const { error: wErr } = await supabaseAdmin.from("jobs").upsert({ id: jobId, data: next });
  if (wErr) throw new Error(wErr.message);
  return true;
}

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
  const jobIds = new Set(jobs.map((j) => j.id));
  ctx.jobExists = (id) => jobIds.has(id);
  // The most recent job for a client's email — where a reply from them with
  // no job number in it belongs.
  ctx.latestJobForClient = (addr) => {
    const a = String(addr || "").toLowerCase();
    const ids = new Set(clients.filter((c) => (c.email || "").toLowerCase() === a).map((c) => c.id));
    if (!ids.size) return null;
    const mine = jobs.filter((j) => ids.has(j.clientId));
    mine.sort((x, y) => new Date(y.updatedAt || y.createdAt || 0) - new Date(x.updatedAt || x.createdAt || 0));
    return mine[0]?.id || null;
  };

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
  const attached = [];
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
    if (c.attachTo) {
      // File it on the job it's about, as a message from the client — it
      // then shows as "Reply to the client" there, instead of vanishing or
      // turning into a fake quote.
      try {
        const ok = await attachToJob(c.attachTo, msg);
        if (ok) attached.push({ jobId: c.attachTo, from: msg.from.address, subject: msg.subject });
        else skipped["already on the job"] = (skipped["already on the job"] || 0) + 1;
      } catch (err) {
        skipped[`attach error: ${String(err.message || err).slice(0, 60)}`] = 1;
      }
      continue;
    }
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

  // Replies the office sent from webmail: file each on the client's job as
  // an outbound email, so "Reply to the client" clears when it's answered.
  const replied = [];
  try {
    const clientByEmail = new Map(clients.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
    const { messages: sent } = await fetchRecentSent({ identities, sinceDays });
    for (const m of sent) {
      if (seenIds.has(m.messageId)) continue;
      const refs = (m.subject.match(/\bJOB-\d{4}\b/gi) || []).map((r) => r.toUpperCase()).filter((r) => jobIds.has(r));
      const toClient = m.to.find((a) => clientByEmail.has(a));
      const jobId = refs[0] || (toClient ? ctx.latestJobForClient(toClient) : null);
      if (!jobId) continue;
      const ok = await attachOutbound(jobId, m);
      if (ok) replied.push({ jobId, subject: m.subject });
    }
  } catch (err) {
    skipped[`sent-folder error: ${String(err.message || err).slice(0, 60)}`] = 1;
  }

  return {
    ok: true,
    created,
    attached,
    replied,
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
    // New enquiries, client emails and replies all change what jobs need —
    // hand the work out now rather than at the next sweep.
    if (lastResult?.created?.length || lastResult?.attached?.length || lastResult?.replied?.length) {
      await runTaskSync({ force: true });
    }
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
