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
import { rateLimitOr429 } from "@/lib/rateLimit";
import {
  normalizeEnquiry,
  buildLines,
  enquiryNote,
  enquiryKey,
  quotePrice,
} from "@/lib/enquiry";

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

const digits = (v) => String(v || "").replace(/\D/g, "");

async function loadRows(table) {
  const { data, error } = await supabaseAdmin.from(table).select("id,data");
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []).map((r) => r.data).filter(Boolean);
}

// Match on email first, then on the last 10 digits of the phone — people
// give "07426 409342" and "+44 7426 409342" for the same line, and creating
// a duplicate client for the same landlord is how a portfolio ends up
// scattered across three records.
function findClient(clients, e) {
  if (e.email) {
    const hit = clients.find((c) => (c.email || "").toLowerCase() === e.email);
    if (hit) return hit;
  }
  const phone = digits(e.phone).slice(-10);
  if (phone.length >= 10) {
    const hit = clients.find((c) => digits(c.phone).slice(-10) === phone);
    if (hit) return hit;
  }
  return null;
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

  let clients;
  let jobs;
  try {
    [clients, jobs] = await Promise.all([loadRows("clients"), loadRows("jobs")]);
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 502 });
  }

  // Idempotency. The website retries on a timeout, and a timed-out request
  // may well have succeeded — without this, one enquiry becomes two quotes
  // and someone quotes the same customer twice.
  const key = enquiryKey(e);
  const already = jobs.find((j) => j.enquiryKey === key);
  if (already) {
    return NextResponse.json({ ok: true, duplicate: true, jobId: already.id });
  }

  const now = new Date().toISOString();

  // ── Client ────────────────────────────────────────────────────────────
  let client = findClient(clients, e);
  let clientCreated = false;
  if (!client) {
    client = {
      id: "cl-" + Date.now().toString(36),
      name: e.name || e.email || e.phone,
      company: "",
      email: e.email,
      phone: e.phone,
      type: "Landlord",
      properties: [],
      notes: `Came in from the website ${e.form} form on ${e.receivedAt}.`,
      source: "website",
      createdAt: now,
      updatedAt: now,
    };
    clientCreated = true;
  }

  // ── Property ──────────────────────────────────────────────────────────
  // Reuse a property the client already has at this postcode rather than
  // stacking a near-duplicate onto their record every time they enquire.
  const properties = Array.isArray(client.properties) ? [...client.properties] : [];
  let property = e.postcode
    ? properties.find((p) => (p.postcode || "").replace(/\s/g, "").toUpperCase() === e.postcode.replace(/\s/g, ""))
    : null;
  // A first enquiry often gives only a postcode and a later one the full
  // address. Upgrade the label rather than leaving the property named after
  // its postcode forever, or adding a second one for the same place.
  if (property && e.address && (!property.label || property.label === property.postcode)) {
    property = { ...property, label: e.address };
    const i = properties.findIndex((p) => p.id === property.id);
    if (i !== -1) properties[i] = property;
  }
  if (!property && (e.postcode || e.address)) {
    property = {
      id: "pr-" + Date.now().toString(36),
      label: e.address || e.postcode,
      postcode: e.postcode,
      area: "",
      beds: 0,
    };
    properties.push(property);
  }

  // ── Lines ─────────────────────────────────────────────────────────────
  const context = [e.message, e.address, e.propertyType].filter(Boolean).join(" ");
  const { lines, unmatched, beds, appliances } = buildLines(e.services, context);
  if (property && beds != null && !property.beds) property.beds = beds;

  const noteParts = [enquiryNote(e)];
  if (unmatched.length) {
    // Never silently drop something the customer asked for. If a service
    // couldn't be matched to the catalogue it goes on the job in words, so
    // it's visible on the quote rather than missing from it.
    noteParts.push(`Asked for (not matched to a service — add manually): ${unmatched.join(", ")}`);
  }

  const job = {
    id: (() => {
      const taken = new Set(jobs.map((j) => j.id));
      let id;
      do { id = "JOB-" + Math.floor(1000 + Math.random() * 9000); } while (taken.has(id));
      return id;
    })(),
    status: "quote",
    engineerId: "unassigned",
    scheduledAt: null,
    clientId: client.id,
    propertyId: property?.id || null,
    lineItems: lines,
    services: lines.map((l) => l.code),
    quantities: Object.fromEntries(lines.map((l) => [l.code, l.qty || 1])),
    ...(appliances ? { gasAppliances: appliances } : {}),
    price: quotePrice(lines),
    notes: noteParts.filter(Boolean).join("\n\n"),
    certExpiry: null,
    // Where it came from, and enough of the original to answer "what did
    // they actually say?" without going back to the mailbox.
    source: "website",
    sourceForm: e.form,
    enquiryKey: key,
    accessName: e.name,
    accessPhone: e.phone,
    accessContacts: e.name || e.phone ? [{ name: e.name, phone: e.phone }] : [],
    activity: [
      {
        id: "act-" + Date.now().toString(36),
        at: now,
        by: "website",
        type: "note",
        title: `Website ${e.form} enquiry`,
        detail: [
          e.name && `Name: ${e.name}`,
          e.email && `Email: ${e.email}`,
          e.phone && `Phone: ${e.phone}`,
          e.postcode && `Postcode: ${e.postcode}`,
          e.address && `Address: ${e.address}`,
          e.propertyType && `Property type: ${e.propertyType}`,
          (e.preferredDate || e.preferredSlot) && `Preferred: ${e.preferredDate} ${e.preferredSlot}`.trim(),
          e.message && `\nWhat they wrote:\n${e.message}`,
        ].filter(Boolean).join("\n"),
      },
    ],
    statusHistory: [{ status: "quote", enteredAt: now, exitedAt: null, by: "website" }],
    createdAt: now,
    updatedAt: now,
  };

  const nextClient = { ...client, properties, updatedAt: now };
  // Fill in contact details the client record was missing — an enquiry is
  // often the first time a phone number arrives.
  if (!nextClient.email && e.email) nextClient.email = e.email;
  if (!nextClient.phone && e.phone) nextClient.phone = e.phone;

  const { error: cErr } = await supabaseAdmin
    .from("clients")
    .upsert({ id: nextClient.id, data: nextClient });
  if (cErr) {
    return NextResponse.json({ error: `client: ${cErr.message}` }, { status: 502 });
  }
  const { error: jErr } = await supabaseAdmin
    .from("jobs")
    .upsert({ id: job.id, data: job });
  if (jErr) {
    return NextResponse.json({ error: `job: ${jErr.message}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    clientId: nextClient.id,
    clientCreated,
    lines: lines.map((l) => ({ code: l.code, tier: l.tier, qty: l.qty, unit: l.unit })),
    unmatched,
    price: job.price,
  });
}
