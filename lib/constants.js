// Shared constants for LCL Ops.

export const JOB_STATUSES = [
  { key: "quote", label: "Quote", color: "bg-navy-100 text-navy-700", dot: "bg-navy-400" },
  { key: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { key: "in_progress", label: "In progress", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { key: "completed", label: "Completed", color: "bg-brand-100 text-brand-700", dot: "bg-brand-500" },
  { key: "invoiced", label: "Invoiced", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { key: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { key: "cancelled", label: "Cancelled", color: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
];

export const STATUS_ORDER = JOB_STATUSES.map((s) => s.key);

export function statusMeta(key) {
  return JOB_STATUSES.find((s) => s.key === key) || JOB_STATUSES[0];
}

// Service catalogue — prices inc VAT, from the official LCL pricing sheet.
// Many services are priced by property size / quantity, so they carry a
// `tiers` list; `price` is the lowest tier (the "from" default when added).
// Gas Safety is priced by appliance count via gasPriceFor() below.
export const SERVICE_CATALOG = [
  { code: "GAS", name: "Gas Safety Certificate (CP12)", price: 60 },
  {
    // New service — commercial gas (CP42), distinct from residential CP12
    // above. Competitor-sourced base prices +£10 per the operator's
    // "match competitor pricing +£10" rule for newly added services.
    code: "GAS_COM",
    name: "Gas Safety Certificate (Commercial, CP42)",
    price: 30,
    tiers: [
      { label: "Meter only", price: 30 },
      { label: "1 Gas Appliance", price: 169.99 },
      { label: "2 Gas Appliances", price: 209.99 },
      { label: "3 Gas Appliances", price: 249.99 },
      { label: "4 Gas Appliances", price: 299.99 },
      { label: "5 Gas Appliances", price: 349.99 },
    ],
  },
  {
    // New service — one-off boiler installation job, distinct from the
    // existing flat-rate "Boiler Service" (an inspection/service call, not
    // an install). Competitor's own page states this is a "starting from"
    // price that varies by make/model — kept as a single starting figure.
    code: "BOILER_INSTALL",
    name: "Boiler Installation",
    price: 2509,
  },
  {
    // Code stays "EICR" (not "EICR_RES") on purpose — any existing job or
    // prospect record already has `services: ["EICR"]` baked in, and
    // renaming the code would orphan every one of them (price lookups and
    // labels would silently stop resolving). "Residential" is just the
    // display name; EICR_COM below is the genuinely new, separate code.
    code: "EICR",
    name: "EICR (Residential)",
    price: 77.99,
    tiers: [
      { label: "Studio", price: 77.99 },
      { label: "1–3 Bedrooms", price: 104.99 },
      { label: "4 Bedrooms", price: 114.99 },
      { label: "5 Bedrooms", price: 149.99 },
      { label: "6 Bedrooms", price: 169.99 },
      { label: "7 Bedrooms", price: 189.99 },
      { label: "8 Bedrooms", price: 209.99 },
    ],
  },
  {
    code: "EICR_COM",
    name: "EICR (Commercial)",
    price: 159.99,
    // Priced by Consumer Unit count, not bedrooms — commercial units are
    // quoted per distribution board, matching the market-standard pricing.
    tiers: [
      { label: "1 Consumer Unit", price: 159.99 },
      { label: "2 Consumer Units", price: 289.99 },
      { label: "3 Consumer Units", price: 428.99 },
      { label: "4 Consumer Units", price: 558.99 },
      { label: "5 Consumer Units", price: 715.99 },
      { label: "6 Consumer Units", price: 859.99 },
      { label: "7 Consumer Units", price: 1008.99 },
      { label: "8 Consumer Units", price: 1165.99 },
    ],
  },
  {
    // New service — hourly electrical diagnostic call-out.
    code: "ELEC_DIAG",
    name: "Electrical Diagnostic (per hour)",
    price: 99.99,
  },
  {
    // New service — consumer unit / fuse box installation. Competitor's
    // page shows two price sets (an older banner and the live booking-form
    // figures); using the booking-form set since that's what's actually
    // charged at checkout.
    code: "CU_INSTALL",
    name: "Fuse Box Installation (Consumer Unit)",
    price: 730,
    tiers: [
      { label: "6 Way Consumer Unit", price: 730 },
      { label: "10 Way Consumer Unit", price: 790 },
      { label: "15 Way Consumer Unit", price: 870 },
      { label: "Skeleton Board", price: 990 },
    ],
  },
  {
    code: "EPC",
    name: "EPC (Energy Performance)",
    price: 99.99,
    tiers: [
      { label: "Studio", price: 99.99 },
      { label: "1–3 Bedrooms", price: 129.99 },
      { label: "4 Bedrooms", price: 149.99 },
      { label: "5 Bedrooms", price: 169.99 },
    ],
  },
  {
    // New service — commercial EPC, priced by floor area rather than
    // bedroom count.
    code: "EPC_COM",
    name: "EPC (Commercial)",
    price: 260,
    tiers: [
      { label: "Up to 50m²", price: 260 },
      { label: "50–100m²", price: 330 },
      { label: "100–250m²", price: 409 },
    ],
  },
  {
    code: "PAT",
    name: "PAT Testing",
    price: 59.99,
    tiers: [
      { label: "Up to 10 appliances", price: 59.99 },
      { label: "10–15 appliances", price: 69.99 },
      { label: "15–20 appliances", price: 79.99 },
      { label: "20–25 appliances", price: 99.99 },
      { label: "25–30 appliances", price: 129.99 },
      { label: "30–35 appliances", price: 169.99 },
      { label: "35–40 appliances", price: 199.99 },
      { label: "40–45 appliances", price: 229.99 },
      { label: "45–50 appliances", price: 259.99 },
    ],
  },
  {
    // New service — commercial PAT, distinct pricing/tiers from residential.
    code: "PAT_COM",
    name: "PAT Testing (Commercial)",
    price: 79.99,
    tiers: [
      { label: "Up to 10 appliances", price: 79.99 },
      { label: "10–20 appliances", price: 99.99 },
      { label: "20–40 appliances", price: 119.99 },
    ],
  },
  { code: "BOILER", name: "Boiler Service", price: 99.99 },
  {
    // Code stays "FRA" for the same backward-compatibility reason as EICR
    // above — FRA_COM is the new, separate commercial code.
    code: "FRA",
    name: "Fire Risk Assessment (Residential)",
    price: 84,
    tiers: [
      { label: "Studio apartment", price: 84 },
      // `hint` is display-only guidance. The LABEL must never change: engineer
      // serviceRates are keyed on it (RIZWAN has five FRA/FRA_COM rates keyed
      // to these exact strings) and saved jobs store it on the line, so a
      // rename would silently drop those rates to the house default.
      //
      // Both FRA and FRA_COM offer a "communal areas" tier and nothing said
      // which to pick — a £20 difference decided by guesswork. Past invoices
      // settle it: a residential block's common parts have always been billed
      // at the residential rate, and the commercial rate only ever used where
      // the premises genuinely are commercial (a shop, a café, mixed use).
      { label: "Communal areas · 1–3 floors", price: 139.99, hint: "Residential block — flats only, no commercial unit" },
      { label: "Communal areas · 3–6 floors", price: 159.99, hint: "Residential block — flats only, no commercial unit" },
      { label: "1–3 Bedrooms", price: 149.99 },
      { label: "4 Bedrooms", price: 189.99 },
      { label: "5 Bedrooms", price: 199.99 },
      { label: "6 Bedrooms", price: 259.99 },
      { label: "7 Bedrooms", price: 309.99 },
      { label: "8 Bedrooms", price: 359.99 },
    ],
  },
  {
    code: "FRA_COM",
    name: "Fire Risk Assessment (Commercial)",
    price: 159.99,
    // Commercial FRA is priced by floor/building size, not bedrooms — a
    // genuinely different tier structure to the residential variant above.
    // "Building · more than 12 floors" price wasn't supplied — flagged in
    // Settings until a real number is set.
    tiers: [
      { label: "Communal areas · up to 3 floors", price: 159.99, hint: "Mixed-use or commercial premises — e.g. flats over a shop" },
      { label: "Communal areas · 3–5 floors", price: 199.99, hint: "Mixed-use or commercial premises" },
      { label: "Communal areas · 5–10 floors", price: 289.99, hint: "Mixed-use or commercial premises" },
      { label: "Building · 1–3 floors", price: 259.99 },
      { label: "Building · 3–5 floors", price: 379.99 },
      { label: "Building · 5–8 floors", price: 469.99 },
      { label: "Building · 8–12 floors", price: 549.99 },
      { label: "Building · more than 12 floors", price: 0 },
    ],
  },
  {
    code: "EMLIGHT",
    name: "Emergency Lighting Certificate",
    price: 65,
    tiers: [
      { label: "Up to 3 emergency lights", price: 65 },
      { label: "3–6 emergency lights", price: 100 },
      { label: "6–9 emergency lights", price: 135 },
      { label: "9–12 emergency lights", price: 170 },
      { label: "12–15 emergency lights", price: 205 },
      { label: "15–18 emergency lights", price: 240 },
      { label: "18–21 emergency lights", price: 275 },
    ],
  },
  {
    // New service — commercial emergency lighting, distinct tier bands
    // from the residential certificate above.
    code: "EMLIGHT_COM",
    name: "Emergency Lighting Certificate (Commercial)",
    price: 65,
    // The first four tiers are the original commercial ones, prices
    // untouched. Commercial jobs regularly run past 12 fittings and there was
    // nothing to pick, so the ladder now continues to 21 using the
    // residential steps — which line up exactly: commercial's "8–12 = £170"
    // is the same price as residential's "9–12", so £205/£240/£275 carries
    // the same +£35-per-band pattern straight on.
    tiers: [
      { label: "Up to 3 emergency lights", price: 65 },
      { label: "3–5 emergency lights", price: 89 },
      { label: "5–8 emergency lights", price: 125 },
      { label: "8–12 emergency lights", price: 170 },
      { label: "12–15 emergency lights", price: 205 },
      { label: "15–18 emergency lights", price: 240 },
      { label: "18–21 emergency lights", price: 275 },
    ],
  },
  {
    // Smoke/Heat Alarm and Fire Alarm Panel used to be two more standalone
    // catalog entries (codes ALARM / FIREPANEL) alongside this one — folded
    // into FSC as one combined service with both tier sets, so there's a
    // single "Fire Safety Check" line to pick instead of three overlapping
    // fire-related services. The ALARM/FIREPANEL codes themselves are NOT
    // reused here (still reserved in RENEWAL_MONTHS/DEFAULT_SERVICE_RATES
    // below) so any existing job that already has one of those service
    // codes keeps working — new jobs just won't see them as separate
    // toggle buttons anymore.
    code: "FSC",
    name: "Fire Safety Check (FSC)",
    price: 65,
    // Fire Alarm Panel tiers deliberately removed — a panel isn't something
    // a customer picks a quantity for upfront. FSC IS the inspection: an
    // engineer assesses the property, and only from that assessment do we
    // know how many panels are actually needed (almost always just 1 for a
    // residential property) and how many heat/smoke alarms connect to it.
    // Workflow is: customer wants a panel/alarms installed → ask if they
    // already have an FSC done → if yes, quote off that inspection; if no,
    // book the FSC first, then quote the install off its findings. Smoke/
    // Heat Alarm tiers stay selectable since alarm count is known upfront.
    tiers: [
      { label: "Smoke/Heat Alarm · up to 3", price: 65 },
      { label: "Smoke/Heat Alarm · 3–6", price: 100 },
      { label: "Smoke/Heat Alarm · 6–9", price: 135 },
      { label: "Smoke/Heat Alarm · 9–12", price: 170 },
      { label: "Smoke/Heat Alarm · 12–15", price: 205 },
      { label: "Smoke/Heat Alarm · 15–18", price: 240 },
      { label: "Smoke/Heat Alarm · 18–21", price: 275 },
    ],
  },
  {
    // New service — commercial fire safety check (alarm-count tiers),
    // distinct from the residential FSC above.
    code: "FSC_COM",
    name: "Fire Safety Check (Commercial)",
    price: 65,
    tiers: [
      { label: "Up to 3 alarms", price: 65 },
      { label: "3–5 alarms", price: 89 },
      { label: "5–8 alarms", price: 125 },
      { label: "8–12 alarms", price: 170 },
    ],
  },
  {
    // New service — physical fire alarm installation, priced per alarm
    // (quantity set on the job line, same pattern as other per-unit
    // services). Distinct from FSC above, which is the inspection/testing
    // certificate, not the install.
    code: "FIRE_ALARM_INSTALL",
    name: "Fire Alarm Installation (per alarm)",
    price: 219.99,
  },
  {
    // New service — flat-rate fire door certificate.
    code: "FIRE_DOOR",
    name: "Fire Door Certificate",
    price: 130,
  },
  {
    // New service — fire extinguisher testing, tiered by extinguisher count.
    code: "FIRE_EXT_TEST",
    name: "Fire Extinguisher Test",
    price: 90,
    tiers: [
      { label: "1–3 extinguishers", price: 90 },
      { label: "3–6 extinguishers", price: 110 },
      { label: "6–10 extinguishers", price: 145 },
      { label: "10–15 extinguishers", price: 185 },
      { label: "15–20 extinguishers", price: 215 },
    ],
  },
  {
    // New service — asbestos survey report, tiered by sample count.
    code: "ASBESTOS",
    name: "Asbestos Survey Report",
    price: 249.99,
    tiers: [
      { label: "1 sample collected", price: 249.99 },
      { label: "2 samples collected", price: 279.99 },
      { label: "3 samples collected", price: 309.99 },
      { label: "4 samples collected", price: 339.99 },
      { label: "5 samples collected", price: 369.99 },
    ],
  },
  // Add-on charges — not certificates, just extra line charges on a job.
  { code: "PARKING", name: "Parking Charge", price: 5, addon: true },
  { code: "CONGESTION", name: "Congestion Zone Charge", price: 18, addon: true },
];

// Gas Safety is tiered by appliance count, NOT a flat per-appliance rate:
//   1 appliance = £60, 2 = £70, 3 = £80, +£10 for each additional appliance.
export const GAS_BASE_PRICE = 60; // first appliance
export const GAS_EXTRA_APPLIANCE = 10; // each additional appliance

export function gasPriceFor(appliances) {
  const n = Math.max(1, Math.round(Number(appliances) || 1));
  return GAS_BASE_PRICE + (n - 1) * GAS_EXTRA_APPLIANCE;
}

// Certificate validity in months — drives renewal reminders.
export const RENEWAL_MONTHS = {
  GAS: 12,
  GAS_COM: 12,
  EICR: 60,
  EICR_COM: 60,
  EPC: 120,
  EPC_COM: 120,
  PAT: 12,
  PAT_COM: 12,
  BOILER: 12,
  FRA: 12,
  FRA_COM: 12,
  // ALARM/FIREPANEL kept here (not in SERVICE_CATALOG anymore, folded into
  // FSC) purely so any pre-existing job with one of these codes still
  // resolves a renewal date instead of hitting an undefined lookup.
  ALARM: 12,
  FIREPANEL: 12,
  EMLIGHT: 12,
  EMLIGHT_COM: 12,
  FSC: 12,
  FSC_COM: 12,
  FIRE_DOOR: 12,
  FIRE_EXT_TEST: 12,
  ASBESTOS: 12,
  // One-off installation/diagnostic jobs, not periodically-renewing
  // certificates — a long cadence keeps them out of renewal-reminder lists
  // without needing separate "non-renewing" handling.
  ELEC_DIAG: 120,
  CU_INSTALL: 120,
  BOILER_INSTALL: 120,
  FIRE_ALARM_INSTALL: 120,
};

// An engineer can be an individual subcontractor or a company.
export const ENGINEER_TYPES = ["Individual", "Company"];

// per_job       = paid % of each completed job
// fixed_service = fixed fee per service, set per engineer (independent of customer price)
// weekly        = fixed weekly retainer (+ parking)
// fixed_gas     = legacy fixed fee by gas appliance count
export const ENGINEER_PAY_TYPES = [
  { key: "per_job", label: "Per job (% cut)" },
  { key: "fixed_service", label: "Fixed rate per service (£)" },
  { key: "weekly", label: "Weekly retainer" },
  { key: "fixed_gas", label: "Fixed rate by appliance count (Gas only)" },
];

// Engineers are paid a percentage cut of the customer price they invoice.
// LCL's standard subcontractor split is 40% engineer / 60% company.
export const DEFAULT_ENGINEER_CUT = 40;

// Default fixed-rate gas fee: 1st appliance, +£ for each extra appliance.
export const DEFAULT_GAS_BASE_RATE = 24;
export const DEFAULT_GAS_EXTRA_RATE = 4;

// Default fixed rates for non-gas services when configuring individual engineer rates.
export const DEFAULT_SERVICE_RATES = {
  GAS: 24,
  GAS_COM: 60,
  EICR: 50,
  EICR_COM: 50,
  EPC: 45,
  EPC_COM: 100,
  PAT: 25,
  PAT_COM: 30,
  BOILER: 35,
  BOILER_INSTALL: 800,
  FRA: 50,
  FRA_COM: 50,
  // ALARM/FIREPANEL kept for backward compatibility with any engineer
  // record already referencing them — not offered for new selection since
  // both folded into FSC in SERVICE_CATALOG above.
  ALARM: 35,
  FIREPANEL: 45,
  EMLIGHT: 35,
  EMLIGHT_COM: 35,
  FSC: 40,
  FSC_COM: 40,
  ELEC_DIAG: 40,
  CU_INSTALL: 250,
  FIRE_ALARM_INSTALL: 80,
  FIRE_DOOR: 45,
  FIRE_EXT_TEST: 35,
  ASBESTOS: 90,
};

// UK VAT rate, applied to a VAT-registered engineer's share only (never to the
// customer's full invoice). See lib/finance.js.
export const VAT_RATE = 0.2;

// Default parking charge added to most jobs (the customer pays this; engineers
// submit receipts weekly for reimbursement). See lib/finance.js parking logic.
export const DEFAULT_PARKING_CHARGE = 5;

// Bank/provider fee taken out of every engineer payment TRANSFER. We gross the
// transfer up by this amount so the engineer still receives their full earned
// figure — send £X + fee, engineer banks £X.
//
// CRITICAL: this is charged PER TRANSFER, not per job. One payment covering
// eight jobs incurs ONE fee, not eight. Everything downstream therefore adds
// it at the payment record, never inside the per-job payout maths — see
// lib/finance.js grossUpTransfer() and the engineer_payments records.
//
// It is also a COMPANY COST, not engineer earnings: it must never inflate what
// an engineer appears to have been paid (that would make a correctly-settled
// balance look overpaid), but it must reduce profit. Hence payments carry
// `amount` (engineer earnings) and `transferFee` separately.
export const DEFAULT_TRANSFER_FEE = 0.74;

// Engineer colours to cycle through when adding new ones.
export const ENGINEER_COLORS = [
  "#3fa34d", "#2f86c4", "#d98324", "#8b5cf6",
  "#e11d48", "#0891b2", "#65a30d", "#c026d3",
];

// The pseudo-engineer used for unassigned jobs. Not editable/removable.
export const UNASSIGNED_ENGINEER = {
  id: "unassigned",
  name: "Unassigned",
  trade: "",
  color: "#94a3b8",
};

// Default engineer roster — seeded into the store on first run, then fully
// editable in Settings (add / edit / remove). Each engineer records the
// service codes they cover, coverage postcode/areas, pay rate and contact.
export const ENGINEERS = [
  { id: "eng-1", name: "James Okafor", trade: "Gas Safe", type: "Individual", company: "", phone: "", email: "", postcode: "", areas: "", services: ["GAS", "BOILER"], cutPercent: 40, gasBaseRate: 24, gasExtraRate: 4, serviceRates: { GAS: 24, BOILER: 35 }, color: "#3fa34d", notes: "" },
  { id: "eng-2", name: "Priya Nair", trade: "NICEIC", type: "Individual", company: "", phone: "", email: "", postcode: "", areas: "", services: ["EICR", "PAT", "EMLIGHT"], cutPercent: 40, gasBaseRate: 24, gasExtraRate: 4, serviceRates: { EICR: 50, PAT: 25, EMLIGHT: 35 }, color: "#2f86c4", notes: "" },
  { id: "eng-3", name: "Tomasz Kowalski", trade: "Gas + Electrical", type: "Individual", company: "", phone: "", email: "", postcode: "", areas: "", services: ["GAS", "EICR", "BOILER", "PAT"], cutPercent: 40, gasBaseRate: 24, gasExtraRate: 4, serviceRates: { GAS: 24, EICR: 50, BOILER: 35, PAT: 25 }, color: "#d98324", notes: "" },
  { id: "eng-4", name: "Sarah Bennett", trade: "DEA / EPC", type: "Individual", company: "", phone: "", email: "", postcode: "", areas: "", services: ["EPC", "FRA", "FSC", "ALARM"], cutPercent: 40, gasBaseRate: 24, gasExtraRate: 4, serviceRates: { EPC: 45, FRA: 50, FSC: 40, ALARM: 35 }, color: "#8b5cf6", notes: "" },
];

// Resolve an engineer by id from a roster (defaults to the seed list). Falls
// back to the Unassigned pseudo-engineer.
export function engineerById(id, roster = ENGINEERS) {
  if (!id || id === "unassigned") return UNASSIGNED_ENGINEER;
  return roster.find((e) => e.id === id) || UNASSIGNED_ENGINEER;
}

export const LONDON_AREAS = [
  "Westminster", "Camden", "Hackney", "Islington", "Wandsworth", "Lambeth",
  "Southwark", "Tower Hamlets", "Greenwich", "Croydon", "Ealing", "Brent",
];

// Arrival window time-of-day options for scheduling + job cards.
export const TIME_PARTS = ["Morning", "Afternoon"];

// "Call before" instructions shown to the engineer on the ASSIGNED job card.
export const CALL_BEFORE_OPTIONS = [
  "Call 30 minutes before",
  "Call 1 hour before",
  "Call on the way",
  "Call the night before",
  "No call needed",
];

// Short certificate labels for job cards (what the engineer recognises).
export const CERT_LABELS = {
  GAS: "CP12 (Gas Safety)",
  GAS_COM: "CP42 (Gas Safety, Commercial)",
  EICR: "EICR (Electrical, Residential)",
  EICR_COM: "EICR (Electrical, Commercial)",
  EPC: "EPC",
  EPC_COM: "EPC (Commercial)",
  PAT: "PAT Test",
  PAT_COM: "PAT Test (Commercial)",
  BOILER: "Boiler Service",
  BOILER_INSTALL: "Boiler Installation",
  FRA: "Fire Risk (Residential)",
  FRA_COM: "Fire Risk (Commercial)",
  ALARM: "Smoke / Heat Alarm",
  FIREPANEL: "Fire Alarm Panel",
  EMLIGHT: "Emergency Lighting",
  EMLIGHT_COM: "Emergency Lighting (Commercial)",
  FSC: "Fire Safety Check (FSC)",
  FSC_COM: "Fire Safety Check (Commercial)",
  ELEC_DIAG: "Electrical Diagnostic",
  CU_INSTALL: "Fuse Box Installation",
  FIRE_ALARM_INSTALL: "Fire Alarm Installation",
  FIRE_DOOR: "Fire Door Certificate",
  FIRE_EXT_TEST: "Fire Extinguisher Test",
  ASBESTOS: "Asbestos Survey",
  PARKING: "Parking Charge",
  CONGESTION: "Congestion Charge",
};

// Selecting a part of day auto-fills this arrival window (editable afterwards).
// Two windows only: Morning 8am–1pm, Afternoon 1pm–6pm.
export const WINDOW_PRESETS = {
  Morning: { from: "08:00", to: "13:00" },
  Afternoon: { from: "13:00", to: "18:00" },
};

// Why a job was cancelled. A fixed list because the point is to COUNT these —
// free text alone can't tell you that six jobs died on price last month, or
// that a tenant no-access is your most common failure. "Other" exists as the
// honest escape hatch and is the one option that forces a written note.
export const CANCEL_REASONS = [
  { key: "client_cancelled",  label: "Client cancelled",        desc: "Changed their mind, sold, or no longer needs it." },
  { key: "price",             label: "Price — went elsewhere",  desc: "Quote rejected or undercut by someone else." },
  { key: "no_access",         label: "No access on the day",    desc: "Tenant out, no keys, engineer couldn't get in." },
  { key: "duplicate",         label: "Duplicate job",           desc: "Already booked or raised twice." },
  { key: "no_engineer",       label: "No engineer available",   desc: "Couldn't cover the date or the area." },
  { key: "rescheduled",       label: "Rebooked as a new job",   desc: "Superseded by another job for the same work." },
  { key: "created_in_error",  label: "Raised in error",         desc: "Test, mistake, or wrong client." },
  { key: "other",             label: "Other",                   desc: "Anything else — say what happened.", requiresNote: true },
];

// Named reasons a discount gets given. A fixed list because the point is to be
// able to COUNT them — "how much did we give away on referrals last quarter"
// is unanswerable if every discount is untyped free text. Shared by the job
// form and the invoice/quote builder so both offer the same four.
export const DISCOUNT_PRESETS = [
  "Multiple Property Discount",
  "Loyalty Discount",
  "Referral Discount",
  "Goodwill Discount",
];
