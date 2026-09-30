// An engineer's own paperwork — Gas Safe card, NICEIC/NAPIT, insurance,
// qualifications, their rate card — with expiry dates, so nobody is sent to
// a gas job on a lapsed Gas Safe card and the office knows what's missing.
// Stored on the engineer record as `documents: [{ id, type, name, url|dataUrl,
// path, expiresAt, addedAt }]`.

export const ENGINEER_DOC_TYPES = [
  { key: "gas_safe_card", label: "Gas Safe ID card", expires: true },
  { key: "niceic_napit", label: "NICEIC / NAPIT registration", expires: true },
  { key: "insurance", label: "Public liability insurance", expires: true },
  { key: "qualification", label: "Qualification / training certificate", expires: false },
  { key: "rate_card", label: "Rate card / agreed rates", expires: false },
  { key: "dbs", label: "DBS check", expires: true },
  { key: "id", label: "ID / right to work", expires: false },
  { key: "other", label: "Other", expires: false },
];

export const docTypeLabel = (key) => ENGINEER_DOC_TYPES.find((t) => t.key === key)?.label || "Document";

const GAS = new Set(["GAS", "GAS_COM", "BOILER", "BOILER_INSTALL"]);
const ELEC = new Set(["EICR", "EICR_COM", "PAT", "PAT_COM", "CU_INSTALL", "ELEC_DIAG", "EMLIGHT", "EMLIGHT_COM", "FIRE_ALARM_INSTALL"]);

// What this engineer must have on file, from the work they do.
export function requiredDocs(engineer) {
  const svc = new Set(engineer?.services || []);
  const req = ["insurance"];
  if ([...svc].some((c) => GAS.has(c))) req.push("gas_safe_card");
  if ([...svc].some((c) => ELEC.has(c))) req.push("niceic_napit");
  return req;
}

export function docStatus(doc, now = new Date()) {
  if (!doc?.expiresAt) return "ok";
  const days = Math.floor((new Date(doc.expiresAt).getTime() - now.getTime()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "ok";
}

// Problems with an engineer's paperwork, most serious first:
// [{ kind: "expired"|"missing"|"expiring", type, label, expiresAt? }]
export function engineerDocIssues(engineer, now = new Date()) {
  const docs = Array.isArray(engineer?.documents) ? engineer.documents : [];
  const out = [];
  for (const type of requiredDocs(engineer)) {
    const ofType = docs.filter((d) => d.type === type);
    if (!ofType.length) { out.push({ kind: "missing", type, label: docTypeLabel(type) }); continue; }
    // The newest one is what counts (an old expired card next to a renewed one is fine).
    const latest = [...ofType].sort((a, b) => String(b.expiresAt || "9999").localeCompare(String(a.expiresAt || "9999")))[0];
    const st = docStatus(latest, now);
    if (st !== "ok") out.push({ kind: st, type, label: docTypeLabel(type), expiresAt: latest.expiresAt });
  }
  for (const d of docs) {
    if (requiredDocs(engineer).includes(d.type)) continue;
    const st = docStatus(d, now);
    if (st !== "ok") out.push({ kind: st, type: d.type, label: docTypeLabel(d.type), expiresAt: d.expiresAt });
  }
  const rank = { expired: 0, missing: 1, expiring: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

// Are this engineer's rates set up? (finance treats "no rates" as unknown pay)
export function hasRates(engineer) {
  if (!engineer) return false;
  if (engineer.payType === "weekly") return Number(engineer.weeklyRate) > 0;
  if (engineer.payType === "per_job") return engineer.cutPercent != null && engineer.cutPercent !== "";
  return Object.keys(engineer.serviceRates || {}).length > 0;
}
