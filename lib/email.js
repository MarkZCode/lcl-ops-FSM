import { gbp, fmtDateTime, fmtDate, serviceName, isAddonCode } from "./format";

// Replace {{tokens}} in a template string using a context object.
export function renderTemplate(text = "", ctx = {}) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    ctx[key] != null ? String(ctx[key]) : m
  );
}

// Build a token context from a job + client + business settings.
export function buildContext({ job, client, property, email }) {
  return {
    client_name: client?.name || "there",
    company: email?.fromName || "Landlord Compliance London",
    job_id: job?.id || "",
    service: (job?.services || []).filter((c) => !isAddonCode(c)).map(serviceName).join(", "),
    property: property ? `${property.label}, ${property.postcode}` : "",
    price: job ? gbp(job.price) : "",
    date: job?.scheduledAt ? fmtDateTime(job.scheduledAt) : "to be confirmed",
    expiry: job?.certExpiry ? fmtDate(job.certExpiry) : "",
    phone: "07426 409342",
  };
}

// Example context for previews when no job is selected.
export function sampleContext(email) {
  return {
    client_name: "Priya Sharma",
    company: email?.fromName || "Landlord Compliance London",
    job_id: "JOB-1042",
    service: "Gas Safety Certificate (CP12), EICR",
    property: "Flat 4, 22 Camden High St, NW1 7JE",
    price: "£109.99",
    date: "Tue 3 Jun, 09:00",
    expiry: "12 Jun 2027",
    phone: "07426 409342",
  };
}
