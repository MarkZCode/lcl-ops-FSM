// Letting Agents — B2B pipeline (handoff doc §4.3).
// Distinct from prospects: agents manage portfolios of 5–200+ properties so
// the unit of work is the *agency*, not the property. The detail panel
// surfaces the portfolio table and the trial-job / agreement state.
//
// Data shape (stored in Supabase `letting_agents` jsonb):
//   {
//     id, agency_name, contact_name, email, phone, address,
//     area_focus: [string], portfolio_size: number,
//     properties: [{id, address, services?, lastJobAt?}],
//     stage: "new"|"contacted"|"engaged"|"trial_job"|"active"|"dormant",
//     trial_job_id: string|null,
//     annual_value_estimate: number,
//     decision_maker_role: string,
//     agreement_signed: boolean,
//     timeline: [{ts, channel, direction, note, by}],
//     lastContactedAt, nextActionAt, importedAt, source
//   }

export const STAGES = [
  { key: "new",        label: "New",        color: "bg-slate-100 text-slate-700" },
  { key: "contacted",  label: "Contacted",  color: "bg-blue-100 text-blue-700" },
  { key: "engaged",    label: "Engaged",    color: "bg-amber-100 text-amber-800" },
  { key: "trial_job",  label: "Trial job",  color: "bg-purple-100 text-purple-700" },
  { key: "active",     label: "Active",     color: "bg-emerald-100 text-emerald-700" },
  { key: "dormant",    label: "Dormant",    color: "bg-slate-100 text-slate-600" },
];

export const PORTFOLIO_BANDS = [
  { key: "small",  label: "1–5",   min: 1,  max: 5 },
  { key: "mid",    label: "6–20",  min: 6,  max: 20 },
  { key: "large",  label: "21–50", min: 21, max: 50 },
  { key: "xlarge", label: "50+",   min: 51, max: Infinity },
];

// Avg annual value per managed property — used for pipeline £ estimates.
// Tunable: ~£120 covers a typical CP12 (gas) renewal at our wholesale rate
// for a single-property letting agreement. Multi-cert portfolios skew higher.
export const VALUE_PER_PROPERTY = 120;

export function annualValue(agent) {
  const n = Number(agent?.portfolio_size) || (agent?.properties?.length ?? 0);
  if (!n) return 0;
  return n * VALUE_PER_PROPERTY;
}

export function portfolioBand(agent) {
  const n = Number(agent?.portfolio_size) || (agent?.properties?.length ?? 0);
  return PORTFOLIO_BANDS.find((b) => n >= b.min && n <= b.max);
}

// Stable, content-hash id so re-imports dedupe cleanly.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildAgentId({ agency_name, email, phone }) {
  return "ag-" + hash([agency_name, email, phone].filter(Boolean).join("|").toLowerCase());
}

// Build a fresh agent record from minimal input (used by import + Add modal).
export function makeAgent(input = {}) {
  const now = new Date().toISOString();
  const a = {
    id: input.id || buildAgentId(input),
    agency_name: input.agency_name || "",
    contact_name: input.contact_name || "",
    email: input.email || "",
    phone: input.phone || "",
    address: input.address || "",
    area_focus: Array.isArray(input.area_focus) ? input.area_focus
      : (input.area ? String(input.area).split(/[,;/]/).map((s) => s.trim()).filter(Boolean) : []),
    portfolio_size: Number(input.portfolio_size) || 0,
    properties: Array.isArray(input.properties) ? input.properties : [],
    stage: input.stage || "new",
    trial_job_id: input.trial_job_id || null,
    decision_maker_role: input.decision_maker_role || "",
    agreement_signed: !!input.agreement_signed,
    notes: input.notes || "",
    source: input.source || "manual",
    // agentTier separates "scraped raw list" from "actually a managed portfolio".
    // Default to "managed" when called directly (manual Add or Promote-from-prospect);
    // CSV imports override this to "raw" so the operator can triage them
    // in the Raw CSV tab before promoting to Managed.
    agentTier: input.agentTier || "managed",
    org_type: input.org_type || "letting_agency",   // letting_agency | housing_association
    priority: input.priority || "",                  // high_value | etc
    lastContactedAt: input.lastContactedAt || null,
    nextActionAt: input.nextActionAt || null,
    timeline: Array.isArray(input.timeline) ? input.timeline : [],
    importedAt: input.importedAt || now,
    importBatchId: input.importBatchId || null,
  };
  a.annual_value_estimate = annualValue(a);
  return a;
}

// Aggregate an agent's job history from the prospects table. Prospects are
// past compliance jobs; many of them came from the same letting agency.
// We match on agency name (case-insensitive) and either contact phone/email
// to attribute past jobs to this agent for ranking + outreach context.
//
// Returns { jobs, totalBilled, byYear, lastJobDate, propertyCount, propertyAddresses }
export function getAgentHistory(agent, prospects = []) {
  const empty = { jobs: 0, totalBilled: 0, byYear: {}, lastJobDate: null, propertyCount: 0, propertyAddresses: [] };
  if (!agent || !prospects.length) return empty;
  const aName = (agent.agency_name || "").trim().toLowerCase();
  const aPhone = (agent.phone || "").replace(/\D/g, "");
  const aEmail = (agent.email || "").trim().toLowerCase();
  const matched = prospects.filter((p) => {
    const owner = (p.ownerName || "").trim().toLowerCase();
    const onCert = (p.nameOnCert || "").trim().toLowerCase();
    const pPhone = (p.ownerPhone || p.tenantPhone || "").replace(/\D/g, "");
    const pEmail = (p.contactEmail || "").trim().toLowerCase();
    if (aName && (owner === aName || onCert === aName)) return true;
    if (aPhone && pPhone && aPhone === pPhone) return true;
    if (aEmail && pEmail && aEmail === pEmail) return true;
    return false;
  });
  const byYear = {};
  const addresses = new Set();
  let totalBilled = 0;
  let lastJobDate = null;
  for (const p of matched) {
    const ymd = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec((p.jobDate || "").trim());
    const year = ymd ? +ymd[3] : null;
    if (year) byYear[year] = (byYear[year] || 0) + 1;
    if (typeof p.invoiceAmount === "number") totalBilled += p.invoiceAmount;
    if (p.address) addresses.add(p.address);
    if (ymd) {
      const d = new Date(+ymd[3], +ymd[2] - 1, +ymd[1]);
      if (!lastJobDate || d > lastJobDate) lastJobDate = d;
    }
  }
  return {
    jobs: matched.length,
    totalBilled: Math.round(totalBilled * 100) / 100,
    byYear,
    lastJobDate,
    propertyCount: addresses.size,
    propertyAddresses: [...addresses],
  };
}

// Sort score for the agents queue: bigger portfolios + overdue follow-ups
// rise to the top. Lower = more important (matches prospectUrgencyScore).
export function agentScore(a, now = new Date()) {
  if (a.stage === "dormant") return 99999;
  // Active agents that are happy go to the bottom of the daily list.
  if (a.stage === "active" && !a.nextActionAt) return 5000;
  const value = annualValue(a);
  const overdue = a.nextActionAt && new Date(a.nextActionAt) < now ? -500 : 0;
  const stageBoost = { new: 0, contacted: -50, engaged: -150, trial_job: -250, active: 200, dormant: 1000 }[a.stage] ?? 0;
  // High-value agents always near the top.
  return -value / 10 + stageBoost + overdue;
}
