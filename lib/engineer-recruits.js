// Engineer Recruits — supply-side pipeline (handoff doc §4.5).
// Distinct from the active Engineer roster — these are candidates being
// onboarded. Stages 1–3 are agent-owned; 4 flags founder decision; 5–7
// founder-owned. On `onboarded`, promote to the `engineers` table.
//
// Data shape (Supabase `engineer_recruits.data`):
//   {
//     id,
//     contact: { name, phone, email },
//     trade: [string],               // ["gas", "electrical"]
//     services_offered: [string],     // service codes
//     area: string,
//     availability: string,
//     stage: "sourced"|"contacted"|"agreement_sent"|"agreement_signed"|"rate_card_set"|"meeting_scheduled"|"onboarded"|"active",
//     assigned_to: userId,
//     agreement_url, rate_card_url,
//     notes, source, importedAt, importBatchId,
//     lastContactedAt, nextActionAt,
//     timeline: [{ts, channel, direction, note, by}]
//   }

export const STAGES = [
  { key: "sourced",           label: "Sourced",          owner: "agent" },
  { key: "contacted",         label: "Contacted",        owner: "agent" },
  { key: "agreement_sent",    label: "Agreement sent",   owner: "agent" },
  { key: "agreement_signed",  label: "Agreement signed", owner: "founder" }, // decision point
  { key: "rate_card_set",     label: "Rate set",         owner: "founder" },
  { key: "meeting_scheduled", label: "Meeting booked",   owner: "founder" },
  { key: "onboarded",         label: "Onboarded",        owner: "founder" },
];

export function stageMeta(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

// Stable id
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildRecruitId({ name, phone, email }) {
  return "rc-" + hash([name, phone, email].filter(Boolean).join("|").toLowerCase());
}

// Build a fresh recruit record from minimal input.
export function makeRecruit(input = {}) {
  const now = new Date().toISOString();
  const r = {
    id: input.id || buildRecruitId(input.contact || input),
    contact: input.contact || {
      name: input.name || "",
      phone: input.phone || "",
      email: input.email || "",
    },
    trade: Array.isArray(input.trade) ? input.trade
      : (input.trade ? String(input.trade).split(/[,;/]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : []),
    services_offered: Array.isArray(input.services_offered) ? input.services_offered
      : (input.services ? String(input.services).split(/[,;/]/).map((s) => s.trim().toUpperCase()).filter(Boolean) : []),
    area: input.area || "",
    availability: input.availability || "",
    stage: input.stage || "sourced",
    assigned_to: input.assigned_to || "",
    agreement_url: input.agreement_url || null,
    rate_card_url: input.rate_card_url || null,
    notes: input.notes || "",
    source: input.source || "manual",
    lastContactedAt: input.lastContactedAt || null,
    nextActionAt: input.nextActionAt || null,
    timeline: Array.isArray(input.timeline) ? input.timeline : [],
    importedAt: input.importedAt || now,
    importBatchId: input.importBatchId || null,
  };
  return r;
}
