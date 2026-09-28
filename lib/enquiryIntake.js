// One enquiry → one client (found or created) + one draft quote.
//
// Shared by the website hook (/api/enquiry) and the mailbox scanner
// (/api/inbox/enquiries), so an enquiry becomes the same quote whichever way
// it arrived. Previously this lived inside the website route only, which is
// why an email sent straight to info@ never became a quote at all.
//
// `e` is the normalised enquiry shape (see normalizeEnquiry / classifyEmail).
// Server-only: writes with the service-role client.
import { supabaseAdmin } from "./supabaseAdmin";
import crypto from "crypto";
import { buildLines, enquiryNote, quotePrice } from "./enquiry";

// Stable ids from a seed (an email's Message-ID). Two scans racing on the
// same email then write the SAME job and client row instead of two.
function seeded(seed, salt) {
  return crypto.createHash("sha256").update(`${salt}:${seed}`).digest("hex");
}

const digits = (v) => String(v || "").replace(/\D/g, "");

export async function loadRows(table) {
  const { data, error } = await supabaseAdmin.from(table).select("id,data");
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data || []).map((r) => r.data).filter(Boolean);
}

// Match on email first, then on the last 10 digits of the phone — people
// give "07426 409342" and "+44 7426 409342" for the same line, and creating
// a duplicate client for the same landlord is how a portfolio ends up
// scattered across three records.
export function findClient(clients, e) {
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

const SOURCE_LABEL = { website: "the website", email: "an email" };

// Returns { ok, duplicate?, job, client, clientCreated, unmatched } or throws.
// `key` makes it idempotent: the same key never creates a second quote.
export async function createQuoteFromEnquiry(e, { key, clients, jobs, seed } = {}) {
  clients = clients || (await loadRows("clients"));
  jobs = jobs || (await loadRows("jobs"));

  const already = jobs.find((j) => j.enquiryKey === key);
  if (already) return { ok: true, duplicate: true, job: already };

  const now = new Date().toISOString();
  const via = e.source === "email" ? "email" : "website";
  const viaLabel = SOURCE_LABEL[via];

  // ── Client ──
  let client = findClient(clients, e);
  let clientCreated = false;
  if (!client) {
    client = {
      id: seed
        ? "cl-" + seeded(e.email || e.phone || seed, "client").slice(0, 10)
        : "cl-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: e.name || e.email || e.phone,
      company: "",
      email: e.email,
      phone: e.phone,
      type: "Landlord",
      properties: [],
      notes: `Came in from ${viaLabel}${via === "website" ? ` ${e.form} form` : e.mailbox ? ` to ${e.mailbox}` : ""} on ${e.receivedAt}.`,
      source: via,
      createdAt: now,
      updatedAt: now,
    };
    clientCreated = true;
  }

  // ── Property ── reuse one at this postcode rather than stacking
  // near-duplicates onto the client every time they enquire.
  const properties = Array.isArray(client.properties) ? [...client.properties] : [];
  const bare = (v) => String(v || "").replace(/\s/g, "").toUpperCase();
  let property = e.postcode ? properties.find((p) => bare(p.postcode) === bare(e.postcode)) : null;
  if (property && e.address && (!property.label || property.label === property.postcode)) {
    property = { ...property, label: e.address };
    const i = properties.findIndex((p) => p.id === property.id);
    if (i !== -1) properties[i] = property;
  }
  if (!property && (e.postcode || e.address)) {
    property = {
      id: "pr-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      label: e.address || e.postcode,
      postcode: e.postcode,
      area: "",
      beds: 0,
    };
    properties.push(property);
  }

  // ── Lines ──
  const context = [e.message, e.address, e.propertyType].filter(Boolean).join(" ");
  const { lines, unmatched, beds, appliances } = buildLines(e.services, context);
  if (property && beds != null && !property.beds) property.beds = beds;

  const noteParts = [enquiryNote(e)];
  if (unmatched.length) {
    noteParts.push(`Asked for (not matched to a service — add manually): ${unmatched.join(", ")}`);
  }

  const taken = new Set(jobs.map((j) => j.id));
  let id;
  if (seed) {
    // Walk forward from a hash-derived number until free, so the same seed
    // always lands on the same id given the same starting job list.
    let n = 1000 + (parseInt(seeded(seed, "job").slice(0, 8), 16) % 9000);
    for (let i = 0; i < 9000 && taken.has(`JOB-${n}`); i++) n = n >= 9999 ? 1000 : n + 1;
    id = `JOB-${n}`;
  } else {
    do { id = "JOB-" + Math.floor(1000 + Math.random() * 9000); } while (taken.has(id));
  }

  const job = {
    id,
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
    source: via,
    sourceForm: e.form,
    ...(e.mailbox ? { sourceMailbox: e.mailbox } : {}),
    enquiryKey: key,
    accessName: e.name,
    accessPhone: e.phone,
    accessContacts: e.name || e.phone ? [{ name: e.name, phone: e.phone }] : [],
    activity: [
      {
        id: "act-" + Date.now().toString(36),
        at: e.receivedAt || now,
        by: via,
        // An emailed enquiry is the client writing to us — "in", so it
        // shows in the job's conversation like any other client message.
        ...(via === "email" ? { direction: "in", type: "email", template: null, handledBy: "enquiry" } : { type: "note" }),
        title: via === "email" ? `Email enquiry${e.mailbox ? ` to ${e.mailbox}` : ""}` : `Website ${e.form} enquiry`,
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
        ...(e.messageId ? { meta: { messageId: e.messageId } } : {}),
      },
    ],
    statusHistory: [{ status: "quote", enteredAt: now, exitedAt: null, by: via }],
    createdAt: now,
    updatedAt: now,
  };

  const nextClient = { ...client, properties, updatedAt: now };
  if (!nextClient.email && e.email) nextClient.email = e.email;
  if (!nextClient.phone && e.phone) nextClient.phone = e.phone;

  const { error: cErr } = await supabaseAdmin.from("clients").upsert({ id: nextClient.id, data: nextClient });
  if (cErr) throw new Error(`client: ${cErr.message}`);
  const { error: jErr } = await supabaseAdmin.from("jobs").upsert({ id: job.id, data: job });
  if (jErr) throw new Error(`job: ${jErr.message}`);

  // Keep the in-memory lists current so a batch (several emails in one
  // scan) matches the client it just created instead of making another.
  if (clientCreated) clients.push(nextClient);
  else {
    const i = clients.findIndex((c) => c.id === nextClient.id);
    if (i !== -1) clients[i] = nextClient;
  }
  jobs.push(job);

  return { ok: true, job, client: nextClient, clientCreated, unmatched, lines };
}
