import { formatDistanceToNow, isValid, parseISO } from "date-fns";
import { SERVICE_CATALOG, gasPriceFor, GAS_EXTRA_APPLIANCE } from "./constants";
import { ukDateParts } from "./ukTime";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function gbp(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function toDate(value) {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

// The business runs on UK clock time and everyone — engineers, office staff,
// clients — must see the same appointment time regardless of what timezone
// their own device is set to (confirmed: staff on Pakistan-timezone devices
// were seeing a UK 3pm appointment display as "7pm"). All three formatters
// below always render in Europe/London time, never the viewer's local zone.
export function fmtDate(value) {
  const d = toDate(value);
  const p = d && ukDateParts(d);
  return p ? `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}` : "—";
}

// 12-hour time of day, e.g. "9am", "1:30pm". Used throughout the system.
export function fmtTime(value) {
  const d = toDate(value);
  const p = d && ukDateParts(d);
  if (!p) return "";
  const ampm = p.hour >= 12 ? "pm" : "am";
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return p.minute === 0 ? `${h12}${ampm}` : `${h12}:${String(p.minute).padStart(2, "0")}${ampm}`;
}

export function fmtDateTime(value) {
  const d = toDate(value);
  const p = d && ukDateParts(d);
  return p ? `${p.weekday} ${p.day} ${MONTHS_SHORT[p.month - 1]}, ${fmtTime(value)}` : "—";
}

export function fmtRelative(value) {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : "—";
}

export function serviceName(code) {
  const s = SERVICE_CATALOG.find((x) => x.code === code);
  return s ? s.name : code;
}

// Codes marked addon:true in SERVICE_CATALOG (Parking Charge, Congestion
// Zone Charge) are billing line items, not compliance services. They
// legitimately live in job.services alongside the real service(s), but must
// never be listed as if they were one — e.g. in an email subject/body
// naming "the service", or a renewal reminder saying what's due. Filter with
// `.filter(c => !isAddonCode(c))` before mapping to serviceName anywhere
// user-facing.
export function isAddonCode(code) {
  return !!SERVICE_CATALOG.find((x) => x.code === code)?.addon;
}

// A service that was on the job but was NOT carried out — no access, the
// client cancelled on the day, the engineer couldn't complete it. The line
// stays on the job (the record of what was agreed and what happened to it)
// but it is no longer work: nobody is scheduled for it, it isn't a
// certificate, and it only costs or earns anything if the office decided so
// when cancelling it (see cancelServices in lib/store.js).
export function isLineCancelled(line) {
  return !!line?.cancelled;
}

// Does this line count towards what the ENGINEER is paid?
//
// Client billing and engineer pay are separate decisions. A no-access EICR
// can be charged to the landlord in full and still not be owed to the
// electrician who never got in — or the reverse, an aborted visit where the
// engineer is paid for the wasted trip but the client isn't billed. So a
// cancelled line counts for pay only when explicitly marked `payEngineer`,
// regardless of what the client is charged.
export function countsForEngineerPay(line) {
  if (!line) return false;
  if (isLineCancelled(line)) return !!line.payEngineer;
  return !line.waived;
}

// The value a percentage-paid engineer earns their cut on, for one line.
// A cancelled line the engineer is still being paid for uses its full
// pre-waiver price — the client not being billed for it doesn't shrink
// what the engineer was owed for turning up.
export function engineerPayBase(line) {
  if (!countsForEngineerPay(line)) return 0;
  return isLineCancelled(line) ? lineGross(line) : lineTotal(line);
}

export function serviceShort(code) {
  const map = {
    GAS: "Gas Safety",
    GAS_COM: "Gas Safety (Com)",
    EICR: "EICR (Res)",
    EICR_COM: "EICR (Com)",
    EPC: "EPC",
    EPC_COM: "EPC (Com)",
    PAT: "PAT",
    PAT_COM: "PAT (Com)",
    BOILER: "Boiler",
    BOILER_INSTALL: "Boiler Install",
    FRA: "Fire Risk (Res)",
    FRA_COM: "Fire Risk (Com)",
    ALARM: "Alarms",
    FIREPANEL: "Fire Panel",
    EMLIGHT: "Em. Lighting",
    EMLIGHT_COM: "Em. Lighting (Com)",
    FSC: "Fire Safety",
    FSC_COM: "Fire Safety (Com)",
    ELEC_DIAG: "Elec. Diagnostic",
    CU_INSTALL: "Fuse Box Install",
    FIRE_ALARM_INSTALL: "Fire Alarm Install",
    FIRE_DOOR: "Fire Door",
    FIRE_EXT_TEST: "Extinguisher Test",
    ASBESTOS: "Asbestos Survey",
    CO_ALARM: "CO Alarm Install",
    ALARM_INTERLINK: "Interlinked Alarm",
    GAS_REMEDIAL: "Gas Remedial",
    ELEC_REMEDIAL: "Electrical Remedial",
    PARKING: "Parking",
    CONGESTION: "Congestion",
  };
  return map[code] || code;
}

export function priceFor(codes = []) {
  return codes.reduce((sum, code) => {
    const s = SERVICE_CATALOG.find((x) => x.code === code);
    return sum + (s ? s.price : 0);
  }, 0);
}

// Unit (single-quantity) price for a service code.
export function unitPriceFor(code) {
  const s = SERVICE_CATALOG.find((x) => x.code === code);
  return s ? s.price : 0;
}

// Line total for one service at a given quantity. Gas is tiered by appliance
// count (£60/£70/£80…); every other service is unit price × quantity.
export function linePriceFor(code, qty = 1) {
  const q = Math.max(1, Math.round(Number(qty) || 1));
  if (code === "GAS") return gasPriceFor(q);
  return unitPriceFor(code) * q;
}

// Total job price from selected services + a { code: qty } map.
export function calcJobPrice(services = [], quantities = {}) {
  return services.reduce(
    (sum, code) => sum + linePriceFor(code, quantities[code] || 1),
    0
  );
}

// Resolve a job's per-service quantity (handles older jobs that only stored
// gasAppliances, and jobs with no quantity info at all).
export function jobQty(job, code) {
  if (job?.quantities && job.quantities[code] != null) return job.quantities[code];
  if (code === "GAS") return job?.gasAppliances || 1;
  return 1;
}

// ---- Line-item model (editable per-job quote lines) ----
// A line = { id, code, name, unit, qty, total?, gasExtra? }
//   unit     = editable unit price (inc VAT) — GAS's "1st appliance" price
//   qty      = quantity / appliance count
//   total    = optional manual override of the whole line's price
//   gasExtra = GAS-only: price per additional appliance, snapshotted from
//              the operator's configured rate (Settings → Service catalogue)
//              at the moment the line was created — falls back to the
//              house default GAS_EXTRA_APPLIANCE for older lines that
//              predate this field existing.
// Gas is tiered by appliance count unless a manual total is set.
// What the client actually pays for this line.
//
// Two ways to reduce it:
//   waived   — the whole line is free (kept on the invoice, marked discounted)
//   discount — a £ amount off, for goodwill / multi-service deals
// A discount can never take a line below zero, and never turns into a credit.
export function lineTotal(line) {
  if (line.waived) return 0;
  const gross = lineGross(line);
  const off = Math.max(0, Number(line.discount) || 0);
  return Math.max(0, Math.round((gross - off) * 100) / 100);
}

// How much was actually taken off this line — for showing "was £X" on quotes
// and invoices, and for totalling the discount given on a job.
export function lineDiscount(line) {
  if (line.waived) return lineGross(line);
  return Math.max(0, Math.min(lineGross(line), Number(line.discount) || 0));
}

export function linesDiscount(lines = []) {
  return lines.reduce((sum, l) => sum + lineDiscount(l), 0);
}

export function linesTotal(lines = []) {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

// The line's price IGNORING any waiver — so a discounted add-on can still show
// its original amount (struck through) on screen and on the invoice, while
// lineTotal() returns 0 so it's excluded from the payable total.
export function lineGross(line) {
  if (line.total != null && line.total !== "") return Number(line.total) || 0;
  const qty = Math.max(1, Math.round(Number(line.qty) || 1));
  if (line.code === "GAS") {
    const base = Number(line.unit) || 0;
    const extra = line.gasExtra != null ? Number(line.gasExtra) : GAS_EXTRA_APPLIANCE;
    return base + (qty - 1) * extra;
  }
  return (Number(line.unit) || 0) * qty;
}

// Build a default line for a catalogue service code.
export function makeServiceLine(code, id) {
  const s = SERVICE_CATALOG.find((x) => x.code === code);
  return {
    id: id || `ln-${code}-${Date.now().toString(36)}`,
    code,
    name: s ? s.name : code,
    unit: s ? s.price : 0,
    qty: 1,
  };
}

// Resolve a job's breakdown lines (new lineItems, else rebuilt from the older
// services + quantities shape so old jobs still display correctly).
export function getJobLines(job) {
  if (Array.isArray(job?.lineItems) && job.lineItems.length) return job.lineItems;
  const services = job?.services || [];
  const single = services.length === 1 && typeof job?.price === "number";
  return services.map((code) => {
    const line = {
      id: `ln-${code}`,
      code,
      name: serviceName(code),
      unit: unitPriceFor(code),
      qty: jobQty(job, code),
    };
    // For a legacy single-service job, pin the line to the actual stored price
    // so the line and the job total always agree (no formula recompute drift).
    if (single) line.total = job.price;
    return line;
  });
}

// Service tags for a job card/row — built from its real line items, not
// job.services. job.services is a separately-maintained list of catalog
// codes that drifts out of sync whenever a service is added as a CUSTOM line
// item (e.g. a bespoke-priced EICR for an unusual property size) rather than
// picked from the catalog: the custom line never gets pushed into
// job.services, so a genuinely two-service job showed only one tag on its
// card/row while its own detail page (which reads lineItems directly)
// correctly showed both.
// The services a job is for, as chips — and the count shown beside them.
//
// Add-ons are excluded. Parking and the congestion charge are lines on the
// invoice, not work: a job reading "5 services · Gas Safety, EICR, EPC,
// PAT, Parking" claims an engineer was booked to do something called
// Parking, inflates the service count on every card, and makes "2
// services" mean two different things depending on whether the job
// happened to be inside the congestion zone. They are charges, and they
// belong in the money, not in the work.
export function jobTags(job) {
  const lines = getJobLines(job).filter((l) => !l.waived && !isAddonCode(l.code));
  const seen = new Set();
  const tags = [];
  for (const l of lines) {
    const label = l.code === "CUSTOM" ? l.name : serviceShort(l.code);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    tags.push({ key: l.code === "CUSTOM" ? l.id : l.code, label });
  }
  return tags;
}

// A discount applied to the JOB as a whole, separate from the per-line
// discounts above. This is the "£20 off the lot" a customer is offered when
// they book three certificates together — it belongs to the job, not to any
// one service, and it can never take the job below zero or turn into a credit.
export function jobDiscount(job) {
  const gross = linesTotal(getJobLines(job || {}));
  return Math.max(0, Math.min(gross, Number(job?.discount) || 0));
}

// What the customer actually owes: every line, less the job-level discount.
// The single definition of a job's price — used when the job is saved, so
// `job.price` (which the reports, invoices and margin maths all read) already
// has the discount baked in.
export function jobPayable(job) {
  return Math.max(0, linesTotal(getJobLines(job || {})) - jobDiscount(job));
}
