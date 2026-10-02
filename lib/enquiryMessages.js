// The standard messages for an enquiry, written from the job itself:
//   • the WhatsApp that goes with the quote (what was quoted, what we need
//     to book it, and the line asking them to reply soon);
//   • the internal note for staff (who, what, and what's still to confirm).
// Pure — no store, no clock beyond the greeting passed in.
import { getJobLines, isAddonCode } from "./format";
import { certLabel as baseLabel } from "./jobCard";

// How a service is named to a client in a message.
const CLIENT_NAMES = { GAS: "Gas Safety Certificate (CP12)", GAS_COM: "Commercial Gas Safety Certificate" };
const certLabel = (code) => CLIENT_NAMES[code] || baseLabel(code);
import { quoteMissing } from "./gates";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const realLines = (job) => getJobLines(job || {}).filter((l) => !isAddonCode(l.code) && !l.cancelled);
const GAS = new Set(["GAS", "GAS_COM"]);

export function applianceCount(job) {
  return Number(job?.intake?.applianceCount) || Number(job?.gasAppliances) || 0;
}

// "Gas Safety Certificate (CP12) for 3 gas appliances and EICR"
export function serviceSentence(job) {
  const n = applianceCount(job);
  return realLines(job).map((l) => {
    const name = l.code === "CUSTOM" ? l.name : certLabel(l.code);
    return GAS.has(l.code) && n > 0 ? `${name} for ${n} gas appliance${n === 1 ? "" : "s"}` : name;
  }).join(" and ");
}

// One short line per service, as it reads on the quote.
function jobLine(job) {
  const n = applianceCount(job);
  return realLines(job).map((l) => {
    const name = l.code === "CUSTOM" ? l.name : certLabel(l.code);
    if (GAS.has(l.code) && n > 0) return `${name} – ${n} appliance${n === 1 ? "" : "s"}`;
    return l.tier ? `${name} (${l.tier})` : name;
  }).join(" + ");
}

const addressMissing = (property) => {
  const addr = String(property?.label || "").replace(/\s/g, "").toUpperCase();
  return !addr || addr === String(property?.postcode || "").replace(/\s/g, "").toUpperCase();
};
const hasAccessContact = (job) =>
  (Array.isArray(job?.accessContacts) && job.accessContacts.some((c) => has(c?.name) || has(c?.phone))) || has(job?.accessName) || has(job?.accessPhone);

// What we still need from the client before it can be booked.
export function bookingAsks(job, property) {
  const out = [];
  if (addressMissing(property)) out.push("Full property address");
  if (!has(job?.nameOnCert)) out.push("Certificate name");
  if (!hasAccessContact(job)) out.push("Tenant/access contact name and number");
  if (!job?.preferredDate && !job?.scheduledAt) out.push("Preferred date and time");
  return out;
}

export function quoteWhatsApp({ job, client, property, sender, firstName, urgencyLine }) {
  const asks = bookingAsks(job, property);
  const what = serviceSentence(job);
  return [
    `Hi ${firstName}, ${sender} here from Landlord Compliance London.`,
    `We've prepared your quote${what ? ` for the ${what}` : ""}.`,
    [`Job: ${jobLine(job) || "—"}`, property?.postcode || property?.label ? `Property: ${addressMissing(property) ? property?.postcode || "" : property.label}` : "", `Customer: ${client?.name || ""}`].filter(Boolean).join("\n"),
    asks.length
      ? `To arrange the booking, please send us:\n${asks.map((a) => `• ${a}`).join("\n")}\n\nOnce we have these details, we can confirm the appointment with the engineer.`
      : "To go ahead, just reply here and we'll arrange the appointment with the engineer.",
    String(urgencyLine || "").trim(),
  ].filter(Boolean).join("\n\n");
}

export function staffNote({ job, client, property }) {
  const lines = realLines(job);
  const head = lines.length === 1 ? (lines[0].code === "CUSTOM" ? lines[0].name : lines[0].code.replace(/_COM$/, "").replace("GAS", "GSC")) : "";
  const n = applianceCount(job);
  const confirm = [
    ...quoteMissing(job, { client, property }, { all: true }).filter((m) => !["name", "address"].includes(m.key)).map((m) => m.label.replace(/^./, (c) => c.toUpperCase())),
    ...bookingAsks(job, property),
  ];
  return [
    `NEW ${head ? `${head.toUpperCase()} ` : ""}ENQUIRY`,
    [
      `Customer: ${client?.name || "—"}`,
      `Postcode: ${property?.postcode || "—"}`,
      `Phone: ${client?.phone || "—"}`,
      `Email: ${client?.email || "—"}`,
      `Service: ${lines.map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code))).join(", ") || "—"}`,
      n > 0 ? `Appliances: ${n}` : "",
      `Job: ${job?.id || ""}`,
    ].filter(Boolean).join("\n"),
    confirm.length ? `Need to confirm:\n${[...new Set(confirm)].map((c) => `• ${c}`).join("\n")}` : "Nothing further to confirm.",
  ].join("\n\n");
}
