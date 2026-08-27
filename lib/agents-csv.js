// CSV importer for the Letting Agents module (handoff doc §4.3).
//
// Accepted columns (header match is case/whitespace-insensitive):
//   agency_name, contact_name, email, phone, address,
//   area, portfolio_size, decision_maker_role, org_type, priority, notes
//
// Re-importing the same file is safe — agent IDs are content-hashed.

import { parseCSV } from "./cold-leads";
import { makeAgent } from "./agents";

function col(row, ...aliases) {
  for (const a of aliases) {
    const k = Object.keys(row).find(
      (k) => k.trim().toLowerCase().replace(/[\s_-]/g, "") === a.replace(/[\s_-]/g, "")
    );
    if (k && row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return "";
}

export function agentsFromCSVWithStats(text, opts = {}) {
  const rows = parseCSV(text);
  const drop = { noAgency: 0 };
  const agents = [];
  const batchId = opts.importBatchId || `b-${Date.now().toString(36)}`;
  for (const row of rows) {
    const agency_name = col(row, "agency_name", "agency", "company", "name");
    if (!agency_name) { drop.noAgency++; continue; }
    const built = makeAgent({
      importBatchId: batchId,
      agency_name,
      contact_name: col(row, "contact_name", "contact", "person"),
      email: col(row, "email", "contactemail"),
      phone: col(row, "phone", "mobile", "tel"),
      address: col(row, "address", "office_address"),
      area: col(row, "area", "areas", "area_focus", "borough"),
      portfolio_size: Number(col(row, "portfolio_size", "portfolio", "properties", "doors")) || 0,
      decision_maker_role: col(row, "decision_maker_role", "role", "title"),
      org_type: col(row, "org_type", "orgtype", "type") || "letting_agency",
      priority: col(row, "priority") || "",
      notes: col(row, "notes", "note"),
      source: opts.source || "csv",
      // CSV imports are raw scraped data — land them in the "Raw CSV" tab so
      // the operator can review/qualify before promoting to Managed.
      agentTier: "raw",
    });
    agents.push(built);
  }
  // Dedupe within the same CSV.
  const seen = new Set();
  const unique = [];
  let dupInCsv = 0;
  for (const a of agents) {
    if (seen.has(a.id)) { dupInCsv++; continue; }
    seen.add(a.id);
    unique.push(a);
  }
  return { agents: unique, stats: { totalRows: rows.length, ...drop, dupInCsv, kept: unique.length } };
}

export function agentsFromCSV(text, opts = {}) {
  return agentsFromCSVWithStats(text, opts).agents;
}
