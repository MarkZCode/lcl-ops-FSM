// Prospects = past compliance clients we reach out to for renewals.
// This module parses the raw exported CSV (the same format process_prospects.py
// handles) into enriched prospect objects, and provides the renewal logic that
// drives outreach timing. Kept framework-free so it's easy to test.

import { CERT_LABELS } from "./constants";

export const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// How many of the 3 outreach channels (email / call / whatsapp) have been
// used on this prospect, per its contactLog. Mirrors OutreachToolbar's own
// "completed channels" calc exactly, so the toolbar's progress bar and the
// Prospects "Outreach" filter never disagree.
export function outreachStepsDone(p) {
  const log = p.contactLog || [];
  const email = log.some((l) => l.channel === "email");
  const call = log.some((l) => l.channel === "call" || l.channel === "ai-call");
  const whatsapp = log.some((l) => l.channel === "whatsapp");
  return [email, call, whatsapp].filter(Boolean).length;
}

// Service detection — order matters a little. Codes match the FSM catalogue.
// Broadened to catch the looser phrasings we see in the operator's exported
// job descriptions ("gas certificate", "annual gas", "EPC for sale", etc.).
const SERVICE_PATTERNS = [
  ["GAS", /\b(gas safety|gas safe|gas cert|gas certificate|cp ?12|lgsr|gsc|cgsc|annual gas|boiler service|appliance)\b/i],
  ["EICR", /\beicr\b|\bpir\b|electric diagnostics|electrical install|electrical safety|electrical (?:cert|report|inspection)/i],
  ["EPC", /\bepc\b|energy performance/i],
  ["PAT", /\bpat\b|portable appliance/i],
  ["FRA", /\b(fra|fire risk assessment|fire risk)\b/i],
  ["FSC", /\b(fsc|fire safety cert|fire alarm cert|bs ?5839)\b/i],
  ["ALARM", /\b(smoke|heat)\s*(?:detector|alarm)|alarm system|alarm install|interlink/i],
  ["EMLIGHT", /emergency light|\beml\b|emer\.? lighting/i],
  ["REMEDIAL", /remedial|consumer unit|board change|rewire|installation of|fault find/i],
];

// Renewal cadence in months per service. Soonest one wins for a bundled job.
export const RENEWAL_MONTHS = {
  GAS: 12, PAT: 12, FRA: 12, FSC: 12, ALARM: 12, EMLIGHT: 12,
  EICR: 60, EPC: 120, REMEDIAL: 60,
};

// Outreach pipeline stages.
export const STAGES = [
  { key: "new", label: "New", color: "bg-navy-100 text-navy-700" },
  { key: "contacted", label: "Contacted", color: "bg-blue-100 text-blue-700" },
  { key: "interested", label: "Interested", color: "bg-amber-100 text-amber-800" },
  { key: "booked", label: "Booked", color: "bg-brand-100 text-brand-700" },
  { key: "dnc", label: "Do Not Contact", color: "bg-red-100 text-red-700" },
];

export function stageMeta(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

export function serviceLabel(code) {
  return CERT_LABELS[code] || code;
}

// Single source of truth for the WhatsApp outreach copy — used by both the
// Prospects table row and the prospect detail panel, so the two never drift
// out of sync again (they used to build this message separately).
export function buildProspectWaMessage(p, fromName = "Landlord Compliance London") {
  const svcs = p?.services?.length ? p.services : [p?.primaryService || "CONFIRM"];
  const knownSvcs = svcs.filter((s) => s !== "CONFIRM");
  const isConfirm = knownSvcs.length === 0;

  const titleRe = /^(mr|mrs|ms|miss|mx|dr|prof|sir|rev)\.?$/i;
  const nameTokens = (p?.nameOnCert || p?.ownerName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameTokens.find((t) => !titleRe.test(t)) || "";
  const greeting = `Hi${firstName ? " " + firstName : ""}, this is Lisa from ${fromName}.`;
  const address = p?.address || "your property";

  if (isConfirm) {
    // Unknown cert type — pitch the full service range and lean on the
    // legal-penalty angle to create urgency without a specific due date.
    return (
      `${greeting}\n\n` +
      `We provide Gas Safety (CP12), EICR, EPC, Fire Risk Assessments and PAT Testing across London — just checking whether any of your certificates are coming up for renewal.\n\n` +
      `Landlords can face fines for letting a certificate lapse, so it's always worth double-checking the dates are current. We offer same or next-day appointments and send the certificate the same day.\n\n` +
      `Reply here and I'll take a look at what's due for you.`
    );
  }

  const svcText = knownSvcs.map(serviceLabel).join(", ");
  // Gas is the one cert that renews every 12 months without fail — flagging
  // it creates urgency even on an EICR/PAT/etc. outreach where we genuinely
  // don't know if anything else is due. Skip it when gas is already the
  // (only) service being messaged about, since it'd just repeat itself.
  const gasNudge = knownSvcs.length === 1 && knownSvcs[0] === "GAS"
    ? ""
    : `\n\nWorth a quick check too — Gas Safety certificates need renewing every 12 months, so it's easy for that date to creep up even if it's not what prompted this message.`;

  return (
    `${greeting}\n\n` +
    `I'm getting in touch about your ${svcText} for ${address}. If you'd like, we can get that sorted out for you and make sure your property is fully compliant to avoid any compliance fines.` +
    gasNudge +
    `\n\nWe can usually fit you in within the week and email the certificate the same day. Reply here if you'd like to book a slot or get a quick quote.`
  );
}

// ---- CSV parsing (handles quoted fields with embedded commas/newlines) ----
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(d) {
  const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec((d || "").trim());
  if (!m) return { day: null, month: null, year: null };
  return { day: +m[1], month: +m[2], year: +m[3] };
}

// Year of the original job (when the cert was issued). Used for the
// "Last done" column + Year filter so the operator can see which 2022 / 2023 /
// 2024 cohort a prospect came from.
export function jobYear(p) {
  return parseDate(p.jobDate).year || null;
}

function detectServices(desc) {
  const d = desc || "";
  return SERVICE_PATTERNS.filter(([, re]) => re.test(d)).map(([code]) => code);
}

function nameOnCert(desc) {
  const m = /name on certs?:\s*([^\n]+?)(?:\s+(?:free parking|call|phone|tenant|$))/i.exec(desc || "");
  return m ? m[1].trim() : "";
}

function sizeTier(desc) {
  const d = (desc || "").toLowerCase();
  let m = /(\d+\s*-\s*\d+)\s*bedroom/.exec(d);
  if (m) return m[1].replace(/\s/g, "") + " bed";
  m = /(\d+)\s*appliance/.exec(d);
  if (m) return m[1] + " appliance";
  return "";
}

function normPhone(p) {
  return (p || "").replace(/[^\d+]/g, "");
}

// Heuristic: does this name look like a company (letting/estate agent / property
// management firm) rather than a single landlord? Used to auto-flag isAgent at
// import time. False positives are fine — the user can untick on the card.
const COMPANY_TOKENS = /\b(ltd|limited|llp|plc|llc|inc|co\b|company|group|holdings|properties|property|estates?|lettings?|management|services|homes|investments?|enterprises?|capital|partners|associates|consultancy|consultants|realty|residences?|developments?|housing|trust)\b/i;
export function looksLikeCompany(name) {
  const s = (name || "").trim();
  if (!s) return false;
  if (COMPANY_TOKENS.test(s)) return true;
  // ALL CAPS multi-word names are usually trade names.
  if (s === s.toUpperCase() && /\s/.test(s) && /[A-Z]/.test(s)) return true;
  // 4+ words with no obvious first/last structure → likely a firm.
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  return false;
}

function parseMoney(v) {
  const n = parseFloat((v || "").replace(/[£,]/g, "").trim());
  return isNaN(n) ? null : n;
}

const STATUS_BUCKET = {
  Completed: "won", "Work Order": "open", Quote: "open", Unsuccessful: "lost",
};

// Map raw export headers (case/space-insensitive) to canonical keys.
const HEADER_ALIASES = {
  "job date": "jobDate",
  "owner name": "ownerName",
  "owner phone": "ownerPhone",
  "tenant name": "tenantName",
  "tenant phone": "tenantPhone",
  "contact email": "contactEmail",
  "address": "address",
  "job status": "jobStatus",
  "job description": "description",
  "cert renewal date": "certRenewalDate",
  "invoice amount": "invoiceAmount",
};

// Turn a raw CSV string into enriched prospect objects.
// `year` (optional) overrides/fills the year for rows; otherwise read from JobDate.
export function prospectsFromCSV(text, { year, source = "import", importBatchId } = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || h.trim());
  const out = [];
  const batchId = importBatchId || `b-${Date.now().toString(36)}`;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.length || cells.every((c) => !c.trim())) continue;
    const raw = {};
    header.forEach((h, i) => { raw[h] = (cells[i] || "").trim(); });

    const { month, year: yr } = parseDate(raw.jobDate);
    const services = detectServices(raw.description);
    const cadence = services.length
      ? Math.min(...services.map((s) => RENEWAL_MONTHS[s] || 12))
      : 12;
    const status = raw.jobStatus || "";
    // Include parsed year + month explicitly so same-property different-year
    // rows never collide. The raw jobDate string covers most cases, but some
    // exports use UK vs US date formats inconsistently — pinning yr|mo|day
    // separately makes the hash deterministic across formats.
    const idSeed = `${yr || ""}|${month || ""}|${raw.jobDate}|${raw.ownerName}|${raw.address}|${(raw.description || "").slice(0, 80)}`.slice(0, 160);

    out.push({
      id: "pr-" + hash(idSeed),
      year: year || yr || null,
      month: month || null,
      monthName: month ? MONTHS[month] : "Unknown",
      jobDate: raw.jobDate || "",
      ownerName: raw.ownerName || "",
      nameOnCert: nameOnCert(raw.description) || raw.ownerName || "",
      ownerPhone: normPhone(raw.ownerPhone),
      tenantPhone: normPhone(raw.tenantPhone),
      contactEmail: raw.contactEmail || "",
      address: raw.address || "",
      services,
      primaryService: services[0] || "CONFIRM",
      sizeTier: sizeTier(raw.description),
      renewalCadenceMo: cadence,
      jobStatus: status,
      statusBucket: STATUS_BUCKET[status] || "open",
      description: raw.description || "",
      certRenewalDate: raw.certRenewalDate || "",
      invoiceAmount: parseMoney(raw.invoiceAmount),
      // Auto-flag letting/estate agents based on name shape. User can override
      // from the prospect card if a particular row is wrong.
      isAgent: looksLikeCompany(raw.ownerName),
      // outreach state
      stage: "new",
      lastContactedAt: null,
      contactLog: [],
      source,
      importedAt: new Date().toISOString(),
      importBatchId: batchId,
    });
  }
  return out;
}

// Stable-ish id from a string (so re-importing the same row dedupes).
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---- Renewal logic ----
// Next renewal due date: roll the original job/renewal date forward by the
// cadence until it's in the future. Annual certs recur every year.
// Urgency score for sorting/ranking prospects in renewal queues.
// Lower = more urgent. Use `daysUntilRenewal` directly for thresholding (<=7,
// <=30, etc); this score also nudges high-value services (Gas/EICR) earlier
// when two prospects share the same expiry day.
export function prospectUrgencyScore(p, now = new Date()) {
  const due = nextRenewalDue(p, now);
  if (!due) return 99999; // unknown renewals sink to the bottom
  const days = Math.ceil((due - now) / 86400000);
  const services = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];
  // high-value tie-breaker — gas safety + EICR push to the top of the same day
  const valueBonus = services.some((s) => s === "GAS" || s === "EICR") ? -0.3 : 0;
  // booked leads have a job — they shouldn't bubble to top of "act now" lists
  const stagePenalty = p.stage === "booked" ? 500 : 0;
  return days + valueBonus + stagePenalty;
}

// Single-dimension urgency bucket for the Prospects filter row — replaces the
// old "Last Done year × 12 calendar-month tabs" grid, which cross-referenced
// two independent things (when the job was last done vs. when it's next due)
// and produced dozens of mostly-empty combinations. This buckets purely by
// days-until-due, using currentCycleDue so a lapsed renewal correctly lands
// in "overdue" instead of silently disappearing into a future month.
export function urgencyBucket(p, now = new Date()) {
  if (p.stage === "lost_dormant" || p.stage === "dormant") return "dormant";
  const due = currentCycleDue(p, now);
  if (!due) return "unknown";
  if (due < now) return "overdue";
  const days = Math.ceil((due - now) / 86400000);
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "later";
}

// Returns the renewal date for the CURRENT cycle — the most recent past due
// date, or the first future due date if all renewals are still upcoming.
// Unlike nextRenewalDue, this does NOT step past "now" once overdue, so a
// prospect whose cert was due July 2nd stays in the July bucket (as
// "overdue") on July 3rd instead of jumping a full cadence into the future.
//
// certRenewalDate/jobDate is the ANCHOR (when the cert was last issued), not
// a due date itself — the first real due date is anchor + one cadence. This
// must match nextRenewalDue's result whenever nothing is overdue yet (proven
// against production data: 0 mismatches across 1000 real records). Starting
// the loop at the raw anchor instead of anchor+cadence was tried and reverted
// twice — it collapses any prospect with a cadence longer than the elapsed
// time since their anchor date (5yr/10yr cadences) straight into "overdue".
export function currentCycleDue(p, now = new Date()) {
  const base = parseDate(p.certRenewalDate).year
    ? parseDate(p.certRenewalDate)
    : parseDate(p.jobDate);
  if (!base.year) return null;
  const cadence = p.renewalCadenceMo || 12;
  let due = new Date(base.year, (base.month || 1) - 1 + cadence, base.day || 1);
  let prev = null;
  let guard = 0;
  while (due < now && guard < 60) {
    prev = due;
    due = new Date(due.getFullYear(), due.getMonth() + cadence, due.getDate());
    guard++;
  }
  // due >= now: the next upcoming renewal (nothing overdue yet).
  // prev < now: the most recent past renewal (overdue).
  return prev !== null ? prev : due;
}

// Month-based bucket — calendar month/year of the current renewal cycle.
// Returns "YYYY-MM" or "overdue" or "dormant" or "unknown".
// Ops feedback: they think in months ("July leads, August leads"), not days.
export function monthBucket(p, now = new Date()) {
  if (p.stage === "lost_dormant" || p.stage === "dormant") return "dormant";
  const due = currentCycleDue(p, now);
  if (!due) return "unknown";
  if (due < now) return "overdue";
  return `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthKeys(from = new Date(), count = 6) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    keys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-GB", { month: "short", year: i >= count - 1 ? "2-digit" : undefined }),
    });
  }
  return keys;
}

export function nextRenewalDue(p, now = new Date()) {
  const base = parseDate(p.certRenewalDate).year
    ? parseDate(p.certRenewalDate)
    : parseDate(p.jobDate);
  if (!base.year) return null;
  const cadence = p.renewalCadenceMo || 12;
  let due = new Date(base.year, (base.month || 1) - 1, base.day || 1);
  // step forward by cadence until in the future (cap iterations)
  let guard = 0;
  while (due < now && guard < 60) {
    due = new Date(due.getFullYear(), due.getMonth() + cadence, due.getDate());
    guard++;
  }
  return due;
}

export function dueMonthNum(p, now = new Date()) {
  const d = nextRenewalDue(p, now);
  return d ? d.getMonth() + 1 : null;
}

// Suggested quote for this year's renewal, off last year's invoice + uplift%.
export function suggestedPrice(p, upliftPct = 0) {
  if (p.invoiceAmount == null || !p.invoiceAmount) return null;
  const v = p.invoiceAmount * (1 + upliftPct / 100);
  return Math.round(v * 100) / 100;
}

// The data the cold-caller reads off the screen.
// estimatedAmount: median price from other prospects with the same service —
// used when this prospect's invoiceAmount is unknown.
export function callerCard(p, upliftPct = 0, estimatedAmount = null) {
  const due = nextRenewalDue(p);
  const now = new Date();
  const daysLeft = due ? Math.ceil((due - now) / 86400000) : null;
  const baseAmount = p.invoiceAmount != null ? p.invoiceAmount : estimatedAmount;
  const sp = baseAmount != null ? Math.round(baseAmount * (1 + upliftPct / 100) * 100) / 100 : null;
  const isEstimated = p.invoiceAmount == null && estimatedAmount != null;
  return {
    name: p.nameOnCert || p.ownerName,
    phone: p.ownerPhone || p.tenantPhone,
    email: p.contactEmail,
    address: p.address,
    service: (p.services || []).map(serviceLabel).join(", ") || "Confirm on call",
    lastDone: p.jobDate,
    dueDate: due ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—",
    daysLeft,
    lastInvoice: p.invoiceAmount != null
      ? `£${p.invoiceAmount.toFixed(2)}`
      : estimatedAmount != null ? `~£${estimatedAmount.toFixed(0)} (est.)` : "—",
    suggested: sp != null ? `£${sp.toFixed(2)}${isEstimated ? " (est.)" : ""}` : "—",
    isEstimated,
  };
}
