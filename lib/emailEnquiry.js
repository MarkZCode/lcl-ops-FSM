// Turning an EMAIL that lands in one of the company mailboxes into a draft
// quote — the same way a website form submission already does.
//
// Enquiries don't only come through the website. A landlord (or an agent
// price-shopping three companies at once) emails info@ directly, and that
// email sat in the inbox until somebody happened to open it — nothing in the
// FSM knew it existed. This reads such an email and returns the same
// enquiry shape normalizeEnquiry() produces, so lib/enquiryIntake.js can
// create the client and the quote exactly as it does for the website.
//
// Pure: takes a parsed message, returns { isEnquiry, reason, enquiry }.
// The deciding is deliberately conservative — a false positive is a junk
// quote someone has to delete, but a false negative is a lost customer, so
// the bar is "asks about a service we sell", not "is definitely a lead".

import { resolveServiceCode, formatPostcode } from "./enquiry";
import { SERVICE_CATALOG } from "./constants";

// Postcode anywhere in the text. Full UK format, inward part required, so
// "E3" alone (or a phone number) can't be mistaken for one.
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
// A UK phone in the body — mobiles and landlines, with or without +44.
const PHONE_RE = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/;

// Words that mean "I'm asking for work / a price".
const ASKING_RE = /\b(quote|quotation|price|pricing|cost|how much|book|booking|availability|available|need|require|looking for|can you|could you|arrange)\b/i;

// Service phrases to scan free text for. Longest first, so "commercial gas
// safety" wins over "gas safety", and each resolves through the same
// resolveServiceCode the website uses.
const SCAN_PHRASES = [
  "commercial gas safety", "commercial eicr", "commercial epc", "commercial pat",
  "commercial fire risk assessment", "commercial emergency lighting",
  "gas safety certificate", "gas safety check", "gas safety", "cp12", "cp42",
  "boiler installation", "boiler service", "boiler",
  "eicr", "electrical installation condition report", "electrical certificate",
  "consumer unit", "fuse box",
  "epc", "energy performance certificate",
  "pat testing", "pat test", "portable appliance",
  "emergency lighting",
  "fire risk assessment", "fire safety check", "fire alarm", "fire door", "extinguisher",
  "smoke alarm", "co alarm", "carbon monoxide",
  "asbestos",
];

// Senders that are never customers: us, our own website's notification
// relays (handled by the website → /api/enquiry hook already, so reading
// them here would make every web enquiry TWO quotes), and machines.
export function isInternalSender(address, { ownDomains = [], ownAddresses = [] } = {}) {
  const a = String(address || "").toLowerCase().trim();
  if (!a) return true;
  if (ownAddresses.map((x) => x.toLowerCase()).includes(a)) return true;
  const domain = a.split("@")[1] || "";
  if (ownDomains.map((d) => d.toLowerCase()).includes(domain)) return true;
  if (/(^|\.)resend\.dev$/.test(domain)) return true;
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|bounce|alerts?)\b/.test(a)) return true;
  return false;
}

// Smoke / CO alarm checks aren't a catalogue service of their own; they're
// what a Fire Safety Check covers for a flat. Kept out of the matched lines
// (so the quote isn't guessed) but surfaced in the note.
const NOTE_ONLY = new Set(["smoke alarm", "co alarm", "carbon monoxide", "electrical certificate"]);

export function findServices(text) {
  const t = String(text || "").toLowerCase();
  const found = [];
  const noteOnly = [];
  let rest = t;
  for (const phrase of SCAN_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!re.test(rest)) continue;
    // Consume the phrase so "gas safety certificate" doesn't also count
    // again as "gas safety".
    rest = rest.replace(new RegExp(re.source, "gi"), " ");
    if (NOTE_ONLY.has(phrase)) {
      const label = phrase === "electrical certificate" ? phrase : "smoke / CO alarms";
      if (!noteOnly.includes(label)) noteOnly.push(label);
      continue;
    }
    const code = resolveServiceCode(phrase);
    if (code && !found.includes(code)) found.push(code);
  }
  // "smoke and CO alarms", "smoke detectors", "carbon monoxide" — phrased
  // too many ways for the fixed list above.
  if (/\bsmoke\b|\bco\b[^.\n]{0,20}\b(alarm|detector)s?\b|carbon monoxide/i.test(t) && !noteOnly.includes("smoke / CO alarms")) {
    noteOnly.push("smoke / CO alarms");
  }
  return { codes: found, noteOnly };
}

// Strip what the sender QUOTED from earlier mail and their signature
// block's legal footer, so a reply chain or a disclaimer mentioning
// "gas" doesn't get read as the request.
export function mainText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .{5,120}wrote:\s*$/i.test(line)) break;
    if (/^\s*-{2,}\s*Original Message/i.test(line)) break;
    if (/^\s*From:\s.+/i.test(line) && out.length > 3) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

// "+44 (0)749 3612530" → "07493612530". The "(0)" people write after +44
// is not a digit of the number.
export function ukPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("440")) d = "0" + d.slice(3);
  else if (d.startsWith("44")) d = "0" + d.slice(2);
  return d.length === 11 && d.startsWith("0") ? d : "";
}

// "demet.arslandok@x" → "Demet Arslandok"; display name wins when present.
function nameFrom(from) {
  const display = String(from?.name || "").replace(/["']/g, "").trim();
  if (display && !/@/.test(display)) return display;
  const local = String(from?.address || "").split("@")[0] || "";
  return local
    .split(/[._-]+/)
    .filter((p) => p && !/\d/.test(p))
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

// msg: { from: {address, name}, subject, text, date, messageId, inReplyTo,
//        headers: { autoSubmitted, listUnsubscribe, precedence } }
// ctx: { ownDomains, ownAddresses, knownClientWithOpenJob(address) }
export function classifyEmail(msg, ctx = {}) {
  const from = msg?.from || {};
  const address = String(from.address || "").toLowerCase();
  if (isInternalSender(address, ctx)) return { isEnquiry: false, reason: "internal or automated sender" };

  const h = msg.headers || {};
  if (h.autoSubmitted && !/^no$/i.test(h.autoSubmitted)) return { isEnquiry: false, reason: "auto-reply" };
  if (h.listUnsubscribe || /bulk|list|junk/i.test(h.precedence || "")) return { isEnquiry: false, reason: "newsletter / mailing list" };

  const subject = String(msg.subject || "");
  // Correspondence about a job that already exists is a MESSAGE on that job,
  // never a new quote. Two ways to know:
  //   • it quotes one of our job numbers ("… certificate attached (JOB-6922)")
  //     — our own emails put the number in the subject, so a reply or a
  //     forward carries it back;
  //   • it's a Re:/Fwd: from someone who is already a client — of ANY job,
  //     paid ones included. (Only unpaid jobs used to count, which is how a
  //     paid client's forwarded certificate email became a fake quote.)
  const refs = [...new Set(`${subject}\n${msg.text || ""}`.match(/\bJOB-\d{4}\b/gi) || [])].map((r) => r.toUpperCase());
  const known = refs.find((r) => ctx.jobExists?.(r));
  if (known) return { isEnquiry: false, reason: "about an existing job", attachTo: known };
  const isReply = /^\s*(re|fw|fwd)\s*:/i.test(subject) || !!msg.inReplyTo;
  if (isReply) {
    const latest = ctx.latestJobForClient?.(address);
    if (latest) return { isEnquiry: false, reason: "reply from an existing client", attachTo: latest };
    if (ctx.knownClientWithOpenJob?.(address)) return { isEnquiry: false, reason: "reply on an existing job" };
  }

  const body = mainText(msg.text);
  const haystack = `${subject}\n${body}`;
  const { codes, noteOnly } = findServices(haystack);
  if (!codes.length) return { isEnquiry: false, reason: "no service we sell mentioned" };
  const postcodeMatch = haystack.match(POSTCODE_RE);
  if (!ASKING_RE.test(haystack) && !postcodeMatch) {
    return { isEnquiry: false, reason: "mentions a service but doesn't ask for anything" };
  }

  // Phone: from the body ABOVE the signature where possible — the
  // signature's number is often a switchboard, but it's still the best we
  // have, so fall back to it rather than leave the field blank.
  const phone = ukPhone((body.match(PHONE_RE) || [""])[0]);
  const postcode = postcodeMatch ? formatPostcode(`${postcodeMatch[1]}${postcodeMatch[2]}`) : "";

  const extra = noteOnly.length
    ? `\n\nAlso asked about: ${[...new Set(noteOnly)].join(", ")} — not added as a service; price it on the quote (Fire Safety Check covers smoke/CO alarms).`
    : "";

  return {
    isEnquiry: true,
    reason: `asks about ${codes.join(", ")}`,
    enquiry: {
      source: "email",
      form: "email",
      name: nameFrom(from),
      email: address,
      phone,
      postcode,
      address: "",
      propertyType: "",
      message: `Subject: ${subject}\n\n${body}`.slice(0, 4000) + extra,
      preferredDate: "",
      preferredSlot: "",
      receivedAt: (msg.date ? new Date(msg.date) : new Date()).toISOString(),
      services: codes.map((code) => ({ code })),
      messageId: msg.messageId || "",
      mailbox: msg.mailbox || "",
    },
  };
}

// Every catalogue code the scanner can produce — used by tests to prove no
// phrase maps to a code that doesn't exist.
export const SCANNABLE_CODES = [...new Set(SCAN_PHRASES.map((p) => resolveServiceCode(p)).filter(Boolean))]
  .filter((c) => SERVICE_CATALOG.some((s) => s.code === c));
