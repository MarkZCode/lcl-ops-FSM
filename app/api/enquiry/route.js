// Website enquiry → draft quote in the FSM.
//
// The marketing site POSTs every contact-form and booking-form submission
// here (see the forward step in that project's /api/contact and
// /api/booking). This turns it into a real client + a real job at status
// "quote", with the name, email, phone, postcode, services and the
// customer's own message already filled in — so the operator opens a
// half-written quote and edits it, instead of reading an email and retyping
// all of it.
//
// It never emails anyone and never prices anything as final. The quote is
// created unassigned, exactly as if someone had typed it and not yet sent
// it. The emails the website already sends are unchanged — this runs
// alongside them, so if it fails the enquiry is still in the inbox.
//
// AUTH: a shared secret in the `x-enquiry-secret` header, compared in
// constant time. Not a user session — the caller is a server, not a person.
// Without ENQUIRY_WEBHOOK_SECRET set, the route refuses everything rather
// than defaulting open: an unauthenticated version of this endpoint would
// let anyone on the internet write rows into the jobs table.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runTaskSync } from "@/lib/taskSync";
import { rateLimitOr429 } from "@/lib/rateLimit";
import { normalizeEnquiry, enquiryKey } from "@/lib/enquiry";
import { createQuoteFromEnquiry } from "@/lib/enquiryIntake";

// 120 enquiries/hour. Comfortably above any real day's volume, low enough
// that a misconfigured retry loop can't fill the jobs table overnight.
const ENQUIRY_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };

function secretOk(req) {
  const expected = process.env.ENQUIRY_WEBHOOK_SECRET || "";
  if (!expected) return false;
  const got = req.headers.get("x-enquiry-secret") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // sorts; compare a fixed-length digest of each instead.
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function POST(req) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  if (!secretOk(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = rateLimitOr429("enquiry", ENQUIRY_LIMIT);
  if (limited) return limited;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const e = normalizeEnquiry(body);
  if (!e.name && !e.email && !e.phone) {
    return NextResponse.json(
      { error: "Enquiry needs at least a name, email or phone." },
      { status: 400 }
    );
  }

  // Idempotency: the website retries on a timeout, and a timed-out request
  // may well have succeeded — the key stops one enquiry becoming two quotes.
  try {
    const r = await createQuoteFromEnquiry(e, { key: enquiryKey(e) });
    if (r.duplicate) return NextResponse.json({ ok: true, duplicate: true, jobId: r.job.id });
    // The enquiry is a quote now — give "check the quote" to someone at once.
    await runTaskSync({ force: true });
    return NextResponse.json({
      ok: true,
      jobId: r.job.id,
      clientId: r.client.id,
      clientCreated: r.clientCreated,
      lines: r.lines.map((l) => ({ code: l.code, tier: l.tier, qty: l.qty, unit: l.unit })),
      unmatched: r.unmatched,
      price: r.job.price,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }
}
