// Templates — single accessor for the unified email template library.
// All consumers (CampaignBuilder, AutoEmailConfirm, JobModal "Send confirmation",
// OutreachToolbar email pre-fill) should pull from here so we never have copy
// drift between settings UI, automated emails, and bulk campaigns.
//
// Lookup order:
//   1. The live settings object (user-edited in /settings/templates)
//   2. defaultTemplates from lib/settings.js
//
// Always returns a { name, subject, body } shape — never null.

import { defaultTemplates } from "./settings";

// Stable purpose IDs (handoff doc §4.10). Keep this list authoritative.
export const TEMPLATE_PURPOSES = [
  // transactional
  "quote",
  "booking",
  "reminder",
  "on_the_way",
  "invoice",
  "receipt",
  "renewal",
  "review",
  // prospect renewals (per service)
  "prospect_renewal_gas",
  "prospect_renewal_eicr",
  "prospect_renewal_epc",
  "prospect_renewal_fra",
  "prospect_renewal_pat",
  "prospect_renewal_generic",
  // letting agents
  "agent_intro",
  "agent_followup",
  "agent_proposal",
  // cold outreach
  "cold_outreach_1",
  "cold_outreach_2",
  "cold_outreach_3",
  // engineer recruitment
  "recruit_outreach",
  "recruit_chase",
  "recruit_interview",
  "recruit_docs",
  "recruit_onboarded",
];

export const TEMPLATE_GROUPS = [
  { label: "Transactional", purposes: ["quote", "booking", "reminder", "on_the_way", "invoice", "receipt", "renewal", "review"] },
  { label: "Prospects (renewal)", purposes: ["prospect_renewal_gas", "prospect_renewal_eicr", "prospect_renewal_epc", "prospect_renewal_fra", "prospect_renewal_pat", "prospect_renewal_generic"] },
  { label: "Letting agents", purposes: ["agent_intro", "agent_followup", "agent_proposal"] },
  { label: "Cold outreach", purposes: ["cold_outreach_1", "cold_outreach_2", "cold_outreach_3"] },
  { label: "Engineer recruitment", purposes: ["recruit_outreach", "recruit_chase", "recruit_interview", "recruit_docs", "recruit_onboarded"] },
];

const EMPTY = { name: "(empty)", subject: "", body: "" };

// Resolve a template by purpose. Pass the `templates` object from the store
// (useStore().templates) — falls back to defaults for any purpose the user
// hasn't customised yet.
export function getTemplate(templates, purpose) {
  if (!purpose) return EMPTY;
  return (templates && templates[purpose]) || defaultTemplates[purpose] || EMPTY;
}

// Render a template with merge tags filled in. Tags use the {{key}} syntax.
// `vars` is a flat object: { client_name, company, service, ... }.
export function renderTemplate(template, vars = {}) {
  const fill = (s) =>
    (s || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
  return {
    name: template?.name || "",
    subject: fill(template?.subject),
    body: fill(template?.body),
  };
}

// Convenience: fetch + render in one call.
export function buildEmail(templates, purpose, vars) {
  return renderTemplate(getTemplate(templates, purpose), vars);
}
