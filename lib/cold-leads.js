// Cold Leads — internet-scraped landlord/property contacts (separate from Prospects).
// Prospects = past compliance clients we already worked with (renewal triggers).
// Cold Leads = fresh scrapes, no prior relationship.
//
// CSV columns accepted (flexible — matched by header name, case-insensitive):
//   name / owner_name / contact_name
//   address / property_address
//   phone / mobile / tel / owner_phone
//   email / contact_email
//   service / services / interest     (optional — comma-separated service codes)
//   source / scraped_from             (e.g. "Rightmove Jan 2026", "Zoopla batch 1")
//   notes / note
//   postcode
//
// Dedup: stable content-hash ID so re-uploading the same file (or uploading
// a year in parts) never creates duplicates.

import { MONTHS } from "./prospects";

export { MONTHS };

// Reuse the same pipeline stages as Prospects.
export { STAGES, stageMeta } from "./prospects";

// Lead segments — drive which campaign cadence/templates apply.
// `letting_agent` is the legacy default (existing rows backfill to this).
export const SEGMENTS = [
  { code: "letting_agent",    label: "Letting agents",    short: "Letting",    cadence: "heavy" },
  { code: "estate_agent",     label: "Estate agents",     short: "Estate",     cadence: "heavy" },
  { code: "residential",      label: "Residential",       short: "Residential",cadence: "medium" },
  { code: "commercial",       label: "Commercial",        short: "Commercial", cadence: "medium" },
  { code: "engineer_recruit", label: "Engineer recruitment", short: "Recruit", cadence: "medium" },
];
export const DEFAULT_SEGMENT = "letting_agent";
export function segmentMeta(code) {
  return SEGMENTS.find((s) => s.code === code) || SEGMENTS[0];
}

// Tiny hash for stable ID generation (same approach as prospects.js).
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// Column name aliases — returns the value from a row object by trying several keys.
function col(row, ...aliases) {
  for (const a of aliases) {
    const k = Object.keys(row).find(
      (k) => k.trim().toLowerCase().replace(/[\s_-]/g, "") === a.replace(/[\s_-]/g, "")
    );
    if (k && row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return "";
}

// Normalise a UK phone number to digits-only (keep leading 0 or country code).
function normalisePhone(raw) {
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  return digits || raw;
}

// Parse a flat CSV into rows. Quote-aware (handles embedded commas/newlines).
export function parseCSV(text) {
  const lines = [];
  let cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "\n" && !inQ) { lines.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) lines.push(cur);

  const toFields = (line) => {
    const fields = [];
    let f = "", q = false;
    for (const ch of (line + ",")) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { fields.push(f.trim()); f = ""; continue; }
      f += ch;
    }
    return fields;
  };

  const [headerLine, ...dataLines] = lines.filter((l) => l.trim());
  if (!headerLine) return [];
  const headers = toFields(headerLine).map((h) => h.trim());
  return dataLines
    .filter((l) => l.trim())
    .map((l) => {
      const vals = toFields(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
      return obj;
    });
}

// Detailed version — also reports how many CSV rows were dropped and why,
// so the user can see whether a 1089-row CSV becomes 890 leads because of
// junk rows ("sponsored" placeholders) or empty-name rows.
export function coldLeadsFromCSVWithStats(text, opts = {}) {
  const rows = parseCSV(text);
  const drop = { sponsored: 0, noName: 0 };
  const leads = [];
  const batchId = opts.importBatchId || `b-${Date.now().toString(36)}`;
  const withBatch = { ...opts, importBatchId: batchId };
  for (const row of rows) {
    const built = buildOne(row, withBatch, drop);
    if (built) leads.push(built);
  }
  // Within `leads`, dedupe identical content-hash ids (CSV repeats).
  const seen = new Set();
  const unique = [];
  let dupInCsv = 0;
  for (const l of leads) {
    if (seen.has(l.id)) { dupInCsv++; continue; }
    seen.add(l.id);
    unique.push(l);
  }
  return { leads: unique, stats: { totalRows: rows.length, ...drop, dupInCsv, kept: unique.length } };
}

// Original signature kept for callers that don't care about stats.
export function coldLeadsFromCSV(text, opts = {}) {
  return coldLeadsFromCSVWithStats(text, opts).leads;
}

// ============================================================================
// Dialer queue helpers (handoff doc §4.4)
// ============================================================================

// After this many no-answers we stop dialling and mark the lead lost_dormant.
export const ATTEMPT_LIMIT = 3;

export function attemptCount(lead) {
  // contactLog entries with channel "call" + outcome "no_answer" all count;
  // contact_count fallback for leads imported before the field existed.
  if (typeof lead.attempt_count === "number") return lead.attempt_count;
  return (lead.contactLog || []).filter((e) => e.channel === "call" && /no.?answer/i.test(e.note || e.outcome || "")).length;
}

export function attemptLimitReached(lead) {
  return attemptCount(lead) >= ATTEMPT_LIMIT;
}

// True if this lead has already been dialled today (avoid same-day repeats).
function dialledToday(lead, now = new Date()) {
  const last = lead.last_attempt_at || lead.lastContactedAt;
  if (!last) return false;
  const d = new Date(last);
  return d.toDateString() === now.toDateString();
}

// Next lead the dialer should show, given the current full lead list.
//
// Rules (in priority order):
//   1. Skip DNC / booked / won / lost_dormant / engaged stages.
//   2. Skip leads with no phone (the Dialer only calls).
//   3. Skip leads that hit the attempt limit (caller should re-route those to "List" for cleanup).
//   4. Skip leads already dialled today.
//   5. Skip leads explicitly flagged "skipped today" in the dialer session.
//   6. Sort by oldest last_attempt_at first (most overdue first), then by import order.
export function nextInDailyStack(leads, { skippedIds = new Set(), now = new Date() } = {}) {
  const eligible = (leads || []).filter((l) => {
    if (!l.phone) return false;
    if (["dnc", "booked", "won", "lost_dormant", "engaged"].includes(l.stage)) return false;
    if (attemptLimitReached(l)) return false;
    if (dialledToday(l, now)) return false;
    if (skippedIds.has(l.id)) return false;
    return true;
  });
  eligible.sort((a, b) => {
    const ta = a.last_attempt_at ? new Date(a.last_attempt_at).getTime() : 0;
    const tb = b.last_attempt_at ? new Date(b.last_attempt_at).getTime() : 0;
    return ta - tb;
  });
  return eligible;
}

// Tier sort weight — used to stable-sort A before B before C in the dialer.
const TIER_ORDER = { A: 0, B: 1, C: 2 };

function buildOne(row, opts, drop) {
    // `business_name` is the commercial CSV's name column; fall back to the
    // standard residential/letting aliases so one importer handles all shapes.
    const name    = col(row, "businessname", "business_name", "agencyname", "agency_name", "name", "ownername", "contactname", "fullname", "landlordname", "agentname") || "";
    const address = col(row, "address", "propertyaddress", "fulladdress");
    const phone   = normalisePhone(col(row, "phone", "mobile", "tel", "ownerphone", "contactphone"));
    const email   = col(row, "email", "contactemail", "emailaddress");
    const website = col(row, "website", "web", "url", "siteurl");

    // Services: `suggested_services` (commercial) or `services`/`service` (other shapes).
    const rawSvc  = col(row, "suggestedservices", "suggested_services", "service", "services", "interest", "servicetype");
    const services = rawSvc
      ? rawSvc.split(/[,;/]/).map((s) => s.trim().toUpperCase()).filter(Boolean)
      : [];

    const source  = col(row, "source", "scrapedfrom", "origin") || opts.source || "";
    const notes   = col(row, "notes", "note", "comments");
    // Engineer-recruit fields.
    const trade   = col(row, "trade", "trades", "qualification", "certtype").toLowerCase();  // gas | electrical | fra | pat

    // Commercial fields — blank for non-commercial CSVs, populated otherwise.
    const category = col(row, "category");
    const tier     = col(row, "tier").toUpperCase();           // A | B | C
    const priority = col(row, "priority");                     // high_fit | medium_fit | volume_fill
    const county   = col(row, "county");

    // Segment detection: if `tier` or `category` is present it's a commercial lead.
    // Otherwise honour the CSV's own `segment` column or the import-time override.
    const rawSegment = col(row, "segment", "leadtype", "type").toLowerCase().replace(/[\s-]/g, "_");
    const segment = (tier || category)
      ? "commercial"
      : (SEGMENTS.find((s) => s.code === rawSegment)?.code
          || (opts.segment && SEGMENTS.find((s) => s.code === opts.segment)?.code)
          || DEFAULT_SEGMENT);

    // Extract postcode from its own column or from the address string.
    const postcodeCol = col(row, "postcode", "postCode");
    const postcodeFromAddr = address.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i)?.[0] || "";
    const postcode = postcodeCol || postcodeFromAddr;

    const area = col(row, "area", "city", "town", "borough");

    // Skip junk rows — count for reporting.
    if (!name) { drop.noName++; return null; }
    if (name.toLowerCase().startsWith("sponsored")) { drop.sponsored++; return null; }

    const id = "cl-" + hash([name, address, phone, email].join("|"));
    const now = new Date().toISOString();

    return {
      id,
      type: "cold",
      segment,
      name,
      address,
      area,
      postcode,
      county,
      phone,
      email,
      website,
      services,
      source,
      notes,
      trade: trade || null,                            // engineer: gas | electrical | fra | pat
      // Commercial-specific enrichment fields.
      category: category || null,
      tier: tier || null,                            // A | B | C
      tierSort: TIER_ORDER[tier] ?? 99,              // for stable sort A→B→C
      priority: priority || null,
      portfolioSize: null,
      month: opts.month || null,
      monthName: opts.month ? MONTHS[opts.month] : "",
      year: opts.year || null,
      stage: "new",
      lastContactedAt: null,
      contactLog: [],
      importedAt: now,
      importBatchId: opts.importBatchId,
    };
}
