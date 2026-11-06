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
import { makeServiceLine, jobTags } from "./format";
import { pushToAll } from "./pushAll";
import { inCongestionZone } from "./quoteChecks";

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

// Match on email first, then on loose email normalization, then on phone,
// and finally on client name + property postcode — preventing duplicate
// client records when minor typos (e.g. dot instead of @) occur.
export function findClient(clients, e) {
  const normEmail = (addr) => String(addr || "").toLowerCase().trim().replace(/[@.]/g, "");
  if (e.email) {
    const target = String(e.email).toLowerCase().trim();
    const hit = clients.find((c) => (c.email || "").toLowerCase().trim() === target);
    if (hit) return hit;
    const norm = normEmail(target);
    if (norm) {
      const loose = clients.find((c) => normEmail(c.email) === norm);
      if (loose) return loose;
    }
  }
  const phone = digits(e.phone).slice(-10);
  if (phone.length >= 10) {
    const hit = clients.find((c) => digits(c.phone).slice(-10) === phone);
    if (hit) return hit;
  }
  if (e.name && String(e.name).trim().length > 3 && e.postcode) {
    const targetName = String(e.name).toLowerCase().trim();
    const targetPc = String(e.postcode).replace(/\s/g, "").toUpperCase();
    const hit = clients.find((c) => {
      if ((c.name || "").toLowerCase().trim() !== targetName) return false;
      return (c.properties || []).some((p) => String(p.postcode || "").replace(/\s/g, "").toUpperCase() === targetPc);
    });
    if (hit) return hit;
  }
  return null;
}

const SOURCE_LABEL = { website: "the website", email: "an email" };

// Returns { ok, duplicate?, job, client, clientCreated, unmatched } or throws.
// `key` makes it idempotent: the same key never creates a second quote.
export async function createQuoteFromEnquiry(e, { key, clients, jobs, seed, retiredIds } = {}) {
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
  const { lines, unmatched, beds, appliances, flags, reading } = buildLines(e.services, context);
  if (property && beds != null && !property.beds) property.beds = beds;

  // Every quote we build carries the parking charge alongside the work, the
  // same as one typed in by hand — it was being left off the automatic ones
  // and then had to be explained to the client as an extra later. Only when
  // there's real work on the quote: parking on its own isn't a quote.
  if (lines.length && !lines.some((l) => l.code === "PARKING")) {
    lines.push(makeServiceLine("PARKING", `ln-PARKING-${Date.now().toString(36)}`));
  }
  // A postcode wholly inside the congestion zone always carries the charge.
  // One the zone only clips is left for the person checking the quote.
  const inZone = lines.length ? await inCongestionZone(e.postcode) : null;
  if (inZone && !lines.some((l) => l.code === "CONGESTION")) {
    lines.push(makeServiceLine("CONGESTION", `ln-CONGESTION-${Date.now().toString(36)}`));
  }

  const noteParts = [enquiryNote(e)];
  if (unmatched.length) {
    noteParts.push(`Asked for (not matched to a service — add manually): ${unmatched.join(", ")}`);
  }
  // How each size was arrived at, so whoever checks the quote can see the
  // reasoning instead of re-reading the enquiry to work it out.
  if (reading.length) noteParts.push(`How the quote was read:\n${reading.map((r) => `• ${r}`).join("\n")}`);

  const taken = new Set([...jobs.map((j) => j.id), ...(retiredIds || [])]);
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
    services: [...new Set(lines.map((l) => l.code))],
    // Summed per code: two EICR lines (a 2-bed and a 3-bed flat) are two
    // certificates, not one overwriting the other.
    quantities: lines.reduce((q, l) => ({ ...q, [l.code]: (q[l.code] || 0) + (l.qty || 1) }), {}),
    ...(appliances ? { gasAppliances: appliances } : {}),
    // A returning landlord's agreed portfolio discount goes on by itself.
    ...(Number(client.discountPercent) > 0
      ? {
          price: Math.round((quotePrice(lines) - Math.round(quotePrice(lines) * Number(client.discountPercent)) / 100) * 100) / 100,
          discount: Math.round(quotePrice(lines) * Number(client.discountPercent)) / 100,
          discountReason: "Multiple Property Discount",
        }
      : { price: quotePrice(lines) }),
    notes: noteParts.filter(Boolean).join("\n\n"),
    // What the client wrote, kept on its own so the quote checks can re-read
    // it later against whatever the lines have been changed to.
    enquiryText: context.slice(0, 4000),
    ...(flags.length ? { quoteFlags: flags } : {}),
    certExpiry: null,
    source: via,
    sourceForm: e.form,
    ...(e.mailbox ? { sourceMailbox: e.mailbox } : {}),
    enquiryKey: key,
    // The zone check has been done for this postcode — don't redo it (or
    // re-add a charge someone deliberately removed) when the job is opened.
    ...(inZone != null && e.postcode ? { cczCheckedFor: String(e.postcode).replace(/\s/g, "").toUpperCase() } : {}),
    // The day and slot the client asked for, kept so booking starts from
    // what they wanted instead of from a blank calendar.
    ...(e.preferredDate ? { preferredDate: e.preferredDate } : {}),
    ...(e.preferredSlot ? { preferredSlot: e.preferredSlot } : {}),
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

  // Tell every device straight away. No price in it — the notification sits
  // on lock screens, including engineers' phones.
  const what = jobTags(job).map((t) => t.label).join(", ");
  await pushToAll({
    title: via === "email" ? "New email enquiry — quote created" : "New website enquiry — quote created",
    body: [nextClient.name, what || (unmatched.length ? unmatched.join(", ") : "services to add"), property?.postcode, job.id]
      .filter(Boolean).join(" · "),
    url: `/jobs/${job.id}`,
  }, { kind: "enquiry" });

  return { ok: true, job, client: nextClient, clientCreated, unmatched, lines };
}
