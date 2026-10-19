// What has to be known before a job can move on.
//
// Three checkpoints, each a plain list of what's missing:
//   • quoting  — the details each service needs to be priced properly;
//   • booking  — nothing is called "booked" without these;
//   • closing  — nothing is called finished without these.
// The lists are what a careful person would check by hand. Pure.
import { getJobLines, isAddonCode } from "./format";

const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== "");
const GAS = new Set(["GAS", "GAS_COM", "BOILER"]);
const isPdf = (f) => f?.type === "application/pdf" || f?.contentType === "application/pdf" || /\.pdf$/i.test(f?.name || "");

// The extra questions each service asks, beyond name/address/postcode.
// `field` lives on job.intake; `label` is how you'd ask the client for it.
export const INTAKE_FIELDS = {
  GAS: [
    { field: "applianceCount", pricing: true, label: "how many gas appliances there are", input: "number", title: "Gas appliances" },
    { field: "applianceTypes", label: "which gas appliances they are (boiler, cooker/hob, gas fire)", input: "chips", options: ["Boiler", "Cooker / hob", "Gas fire", "Water heater", "Other"], title: "Appliance types" },
  ],
  // Residential EICR is priced on bedrooms alone — fuse boxes are only
  // asked about for commercial.
  EICR: [
    { field: "bedrooms", pricing: true, label: "how many bedrooms the property has", input: "number", title: "Bedrooms" },
  ],
  EICR_COM: [
    { field: "consumerUnits", pricing: true, label: "how many consumer units (fuse boxes) there are", input: "number", title: "Consumer units" },
    { field: "circuits", pricing: true, label: "roughly how many circuits there are", input: "number", title: "Circuits" },
  ],
  EPC: [{ field: "propertyType", label: "the type of property (flat, house, HMO…)", input: "text", title: "Property type" }],
  FRA: [
    { field: "bedrooms", pricing: true, label: "how many bedrooms or flats there are", input: "number", title: "Bedrooms / flats" },
    { field: "floors", pricing: true, label: "how many floors the building has", input: "number", title: "Floors" },
    { field: "communalAreas", pricing: true, label: "whether there are communal areas (shared hallways or stairs)", input: "yesno", title: "Communal areas" },
  ],
  FRA_COM: [
    { field: "floors", pricing: true, label: "how many floors the building has", input: "number", title: "Floors" },
    { field: "communalAreas", pricing: true, label: "whether there are communal areas (shared hallways or stairs)", input: "yesno", title: "Communal areas" },
    { field: "fireSafetyNotes", label: "what is already in place — fire doors, alarm, emergency lighting, extinguishers", input: "text", title: "Existing fire safety" },
  ],
  PAT: [{ field: "patCount", pricing: true, label: "roughly how many appliances need testing", input: "number", title: "Appliances to test" }],
  EMLIGHT: [
    { field: "floors", pricing: true, label: "how many floors or areas need covering", input: "number", title: "Floors / areas" },
    { field: "emLightFittings", pricing: true, label: "roughly how many emergency light fittings there are", input: "number", title: "Light fittings" },
  ],
  ASBESTOS: [
    { field: "buildingAge", label: "roughly when the building was built", input: "text", title: "Building age" },
    { field: "surveyAreas", label: "which areas need surveying", input: "text", title: "Areas to survey" },
  ],
};
INTAKE_FIELDS.GAS_COM = INTAKE_FIELDS.GAS;
INTAKE_FIELDS.PAT_COM = INTAKE_FIELDS.PAT;
INTAKE_FIELDS.EPC_COM = INTAKE_FIELDS.EPC;
INTAKE_FIELDS.EMLIGHT_COM = INTAKE_FIELDS.EMLIGHT;

const realLines = (job) => getJobLines(job || {}).filter((l) => !isAddonCode(l.code) && !l.cancelled);

// The intake fields that apply to this job (one entry per field, even when
// two services ask for the same thing).
export function intakeFieldsFor(job) {
  const seen = new Set();
  const out = [];
  for (const l of realLines(job)) {
    for (const f of INTAKE_FIELDS[l.code] || []) {
      if (seen.has(f.field)) continue;
      seen.add(f.field);
      out.push({ ...f, code: l.code });
    }
  }
  return out;
}

// A field counts as known if it was entered, or the job already carries the
// same fact somewhere else (a chosen size tier, the gas appliance count).
function known(job, property, f) {
  const intake = job?.intake || {};
  if (has(intake[f.field])) return true;
  const lines = realLines(job);
  if (f.field === "bedrooms") return lines.some((l) => ["EICR", "FRA"].includes(l.code) && (l.tier || l.bedroomCount)) || Number(property?.beds) > 0 || Number(job?.bedrooms) > 0;
  if (f.field === "floors") return has(intake.floors) || Number(job?.floors) > 0 || String(property?.type || "").toLowerCase().includes("flat");
  if (f.field === "applianceCount") return Number(job?.gasAppliances) > 0 || lines.some((l) => GAS.has(l.code) && Number(l.qty) > 1);
  return false;
}

// What's still needed to quote. By default only what changes the PRICE —
// a postcode on its own is enough to quote, and "which appliances" doesn't
// move the figure. `all: true` adds the rest (full address, the details an
// engineer wants), for the job-details panel and the booking stage.
export function quoteMissing(job, { client, property } = {}, { all = false } = {}) {
  const out = [];
  if (!has(client?.name)) out.push({ key: "name", label: "their name" });
  const addr = String(property?.label || "").trim();
  const pc = String(property?.postcode || "").trim();
  if (!pc) out.push({ key: "postcode", label: "the postcode" });
  if (all && (!addr || addr.replace(/\s/g, "").toUpperCase() === pc.replace(/\s/g, "").toUpperCase())) out.push({ key: "address", label: "the full property address" });
  for (const f of intakeFieldsFor(job)) {
    if (!all && !f.pricing) continue;
    if (!known(job, property, f)) out.push({ key: f.field, label: f.label });
  }
  return out;
}

// What's still needed before it can be booked — beyond an engineer, a date
// and the engineer's confirmation, which lib/visits.js already insists on.
export function bookingMissing(job, { client, property } = {}) {
  const out = [];
  const addr = String(property?.label || "").trim();
  const pc = String(property?.postcode || "").replace(/\s/g, "").toUpperCase();
  if (!addr || addr.replace(/\s/g, "").toUpperCase() === pc) out.push({ key: "address", label: "the full property address" });
  if (!has(job?.nameOnCert) && !has(client?.name)) out.push({ key: "certName", label: "the name to go on the certificate" });
  const contacts = Array.isArray(job?.accessContacts) && job.accessContacts.length ? job.accessContacts : [{ name: job?.accessName, phone: job?.accessPhone }];
  if (!contacts.some((c) => has(c?.phone)) && !has(client?.phone)) out.push({ key: "accessPhone", label: "a phone number for whoever gives access" });
  if (!contacts.some((c) => has(c?.name)) && !has(client?.name)) out.push({ key: "accessName", label: "who will give access" });
  if (!realLines(job).length) out.push({ key: "scope", label: "the services" });
  return out;
}

// What's left before the job is really finished.
export function closingMissing(job, { jobs = [] } = {}) {
  if (!job) return [];
  const out = [];
  const needsCert = realLines(job).length > 0;
  const certs = (job.attachments || []).filter(isPdf);
  if (!["completed", "invoiced", "paid"].includes(job.status)) out.push({ key: "work", label: "The work isn't marked complete" });
  if (job.status !== "paid") out.push({ key: "paid", label: "Payment hasn't been received" });
  if (needsCert && !certs.length) out.push({ key: "cert", label: "No certificate or report has been uploaded" });
  if (needsCert && certs.length && !job.certCheckedAt) out.push({ key: "checked", label: "The certificate hasn't been checked" });
  // Not "has it been emailed from here": marking a job certified IS the
  // record that the certificate was issued, however it was sent.
  if ((job.amendments || []).some((a) => !a.resolvedAt)) out.push({ key: "amend", label: "A certificate correction is still open" });
  if (job.outcome === "fail" && !jobs.some((j) => j.relatedJobId === job.id && j.status !== "cancelled")) {
    out.push({ key: "remedial", label: "It failed and no remedial job has been raised" });
  }
  if ((job.paymentMismatch && !job.paymentMismatch.resolvedAt)) out.push({ key: "mismatch", label: "A payment mismatch hasn't been resolved" });
  return out;
}

// How sure are we? For the labels shown beside a date or a price, so an
// estimate is never read out to a client as a fact.
export function appointmentCertainty(job, confirmed) {
  if (!job?.scheduledAt) return job?.preferredDate ? { key: "estimated", label: "Requested by client" } : null;
  if (job.status === "cancelled") return { key: "cancelled", label: "Cancelled" };
  return confirmed ? { key: "confirmed", label: "Confirmed" } : { key: "pending", label: "Pending — engineer hasn't confirmed" };
}
export function priceCertainty(job) {
  if (!job) return null;
  if (["invoiced", "paid"].includes(job.status)) return { key: "confirmed", label: "Invoiced" };
  if (job.acceptedAt || ["scheduled", "in_progress", "completed"].includes(job.status)) return { key: "confirmed", label: "Accepted" };
  return { key: "pending", label: "Quoted — not accepted yet" };
}
