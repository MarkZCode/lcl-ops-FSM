import { gbp, fmtDateTime, fmtDate, serviceName, isAddonCode } from "./format";
import { invoiceConfig } from "./invoiceConfig";

// Replace {{tokens}} in a template string using a context object.
export function renderTemplate(text = "", ctx = {}) {
  const fill = (line) =>
    line.replace(/\{\{(\w+)\}\}/g, (m, key) => (ctx[key] != null ? String(ctx[key]) : m));

  // A detail line whose value came back empty ("Property:", "Certificate
  // expires:") is worse than no line — it reads as a system that lost the
  // information. Drop that line rather than emailing the label on its own.
  //
  // Deliberately narrow: only a line that HAD tokens, whose tokens ALL
  // resolved to empty, and whose remaining text is just a label and a
  // colon. A heading a human wrote ("A few useful pointers:") has no
  // tokens in it and is never touched.
  const isEmptyDetail = (line) => {
    const tokens = line.match(/\{\{(\w+)\}\}/g) || [];
    if (!tokens.length) return false;
    const allEmpty = tokens.every((t) => {
      const key = t.slice(2, -2);
      return ctx[key] != null && String(ctx[key]).trim() === "";
    });
    if (!allEmpty) return false;
    const remainder = line.replace(/\{\{(\w+)\}\}/g, "").trim();
    return /^[^:]{0,40}:$/.test(remainder);
  };

  return text
    .split("\n")
    .filter((line) => !isEmptyDetail(line))
    .map(fill)
    .join("\n");
}

// Build a token context from a job + client + business settings.
// ── Tags that make a template read like a person wrote it ───────────────

// Greeting by the time of day IN LONDON, not on the sender's device. A
// laptop set to another timezone was the same bug that once had jobs
// starting three hours early, and "Good evening" on a 9am email is the
// tell that nobody is really there.
export function greetingNow(at = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    }).format(at)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// The office signs its own name. Picked from a stable key (the job id)
// rather than at random, so every email about one job comes from the same
// person — a client who replies to Lisa should not get a follow-up from
// Olivia about the same certificate.
export const SENDERS = ["Lisa", "Olivia"];
export function senderFor(key) {
  const s = String(key || "");
  if (!s) return SENDERS[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SENDERS[h % SENDERS.length];
}

// "Lisa Alfred" -> "Lisa". Falls back to the whole name, then to a neutral
// address — never to an empty greeting.
export function firstName(full) {
  const n = String(full || "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

// Best available description of where the work happened.
function propertyLabel(job, client, property) {
  const joined = (...parts) => parts.map((p) => String(p || "").trim()).filter(Boolean).join(", ");
  const fromProperty = property ? joined(property.label, property.postcode) : "";
  if (fromProperty) return fromProperty;
  const saved = job?.invoiceOverrides || job?.quoteOverrides;
  const fromSaved = joined(saved?.propAddr1, saved?.propAddr2);
  if (fromSaved) return fromSaved;
  return joined(client?.address, client?.postcode) || "your property";
}

export function buildContext({ job, client, property, email }) {
  return {
    client_name: client?.name || "there",
    company: email?.fromName || "Landlord Compliance London",
    job_id: job?.id || "",
    service: (job?.services || []).filter((c) => !isAddonCode(c)).map(serviceName).join(", "),
    // Falls back through the job's own saved billing/property edits before
    // giving up — a job created from a website enquiry often has the
    // address there and no property record yet, and "complete for ." is
    // how that reached a real client.
    property: propertyLabel(job, client, property),
    price: job ? gbp(job.price) : "",
    date: job?.scheduledAt ? fmtDateTime(job.scheduledAt) : "to be confirmed",
    expiry: job?.certExpiry ? fmtDate(job.certExpiry) : "",
    phone: "07426 409342",
    greeting: greetingNow(),
    sender: senderFor(job?.id || client?.id),
    first_name: firstName(client?.name),
    // The beneficiary name the client must put on the transfer. Read from
    // the invoice config so it can never drift from what the PDF says —
    // a payment sent to a name that doesn't match the invoice is the one
    // that gets held or returned.
    account_name: invoiceConfig.bank.accountHolder,
    cert_eta: "24–36 hours",
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
    greeting: greetingNow(),
    sender: "Lisa",
    first_name: "Priya",
    account_name: invoiceConfig.bank.accountHolder,
    cert_eta: "24–36 hours",
  };
}
