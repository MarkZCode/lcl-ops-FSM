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
  "certificate",
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


// The templates that belong on a JOB.
//
// The Send message modal listed EVERY template in the library — engineer
// recruitment, letting-agent intros, prospect renewals, three touches of
// cold outreach — 24 chips deep, on a screen whose only job is writing to
// this client about this work. Sending "Recruit — interview invite" to a
// landlord is one mis-tap away in that list, and the one template that
// actually belonged there (the certificate) was missing.
//
// Ordered the way a job actually runs, so the chips read as the lifecycle:
// quote it, book it, remind them, on the way, done, invoice, certificate,
// receipt, then the two follow-ups.
export const JOB_TEMPLATE_PURPOSES = [
  "quote",
  "followup",
  "booking",
  "reminder",
  "on_the_way",
  "job_completed",
  "invoice",
  "certificate",
  "receipt",
  "renewal",
  "review_request",
];

export const TEMPLATE_GROUPS = [
  { label: "Transactional", purposes: ["quote", "booking", "reminder", "on_the_way", "job_completed", "invoice", "certificate", "receipt", "renewal", "followup", "review"] },
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
