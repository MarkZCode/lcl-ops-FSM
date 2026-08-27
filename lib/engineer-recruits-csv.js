// CSV importer for engineer recruits.
//
// Accepted columns (header match case/whitespace-insensitive):
//   name, phone, email, trade, services, area, availability, source, notes

import { parseCSV } from "./cold-leads";
import { makeRecruit } from "./engineer-recruits";

function col(row, ...aliases) {
  for (const a of aliases) {
    const k = Object.keys(row).find(
      (k) => k.trim().toLowerCase().replace(/[\s_-]/g, "") === a.replace(/[\s_-]/g, "")
    );
    if (k && row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return "";
}

export function recruitsFromCSVWithStats(text, opts = {}) {
  const rows = parseCSV(text);
  const drop = { noName: 0 };
  const out = [];
  const batchId = opts.importBatchId || `b-${Date.now().toString(36)}`;
  for (const row of rows) {
    const name = col(row, "name", "contact_name", "fullname");
    if (!name) { drop.noName++; continue; }
    out.push(makeRecruit({
      importBatchId: batchId,
      contact: {
        name,
        phone: col(row, "phone", "mobile", "tel"),
        email: col(row, "email", "contact_email"),
      },
      trade: col(row, "trade", "trades"),
      services: col(row, "services", "service"),
      area: col(row, "area", "borough", "region"),
      availability: col(row, "availability", "hours"),
      notes: col(row, "notes", "note"),
      source: col(row, "source") || opts.source || "csv",
    }));
  }
  // Dedup within the CSV
  const seen = new Set();
  const unique = [];
  let dupInCsv = 0;
  for (const r of out) {
    if (seen.has(r.id)) { dupInCsv++; continue; }
    seen.add(r.id);
    unique.push(r);
  }
  return { recruits: unique, stats: { totalRows: rows.length, ...drop, dupInCsv, kept: unique.length } };
}

export function recruitsFromCSV(text, opts = {}) {
  return recruitsFromCSVWithStats(text, opts).recruits;
}
