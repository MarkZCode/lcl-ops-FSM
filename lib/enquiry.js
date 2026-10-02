// Turning a website enquiry into a draft quote.
//
// Today an enquiry arrives as an email, someone reads it, and then retypes
// the whole thing into a new job by hand — name, email, phone, postcode,
// which services, what the customer actually said. This module does that
// transcription, so what lands in the FSM is a real quote with the fields
// already filled and the customer's own words attached, ready to be edited
// rather than ready to be typed.
//
// Deliberately NOT an auto-send: the quote is created at status "quote",
// unassigned and unpriced-for-send, because the operator's judgement is the
// point ("we see the website inquiry and then we come back and create our
// quote"). This just removes the typing, not the deciding.
//
// Pure functions only — no network, no Supabase. The route wires it up.

import { SERVICE_CATALOG } from "./constants";
import { makeServiceLine, linesTotal } from "./format";

// The website's service slugs (lib/services/*.js over in the marketing site)
// mapped to this app's catalogue codes. Kept as an explicit table rather than
// a fuzzy name match: the two lists are maintained in different repos, and a
// silent mismatch here would quietly produce a quote with the wrong service
// on it, which is worse than producing no line at all.
export const SITE_SLUG_TO_CODE = {
  "gas-safety-certificate": "GAS",
  "commercial-gas-safety": "GAS_COM",
  "boiler-service": "BOILER",
  "boiler-installation": "BOILER_INSTALL",
  "eicr-certificate": "EICR",
  "commercial-eicr": "EICR_COM",
  "electrical-diagnostic": "ELEC_DIAG",
  "fuse-box-installation": "CU_INSTALL",
  "epc-certificate": "EPC",
  "commercial-epc": "EPC_COM",
  "pat-testing": "PAT",
  "commercial-pat-testing": "PAT_COM",
  "emergency-lighting-certificate": "EMLIGHT",
  "commercial-emergency-lighting": "EMLIGHT_COM",
  "fire-risk-assessment": "FRA",
  "commercial-fire-risk-assessment": "FRA_COM",
  "fire-safety-check": "FSC",
  "commercial-fire-safety-check": "FSC_COM",
  "fire-alarm-installation": "FIRE_ALARM_INSTALL",
  "fire-door-certificate": "FIRE_DOOR",
  "fire-extinguisher-test": "FIRE_EXT_TEST",
  "asbestos-survey": "ASBESTOS",
};

// Phrases a customer (or the contact form's free-text "service" field)
// actually uses, for enquiries that arrive without a slug. Order matters:
// the longest, most specific phrase must win, so "commercial gas safety"
// can't be swallowed by "gas safety".
const NAME_HINTS = [
  ["commercial gas", "GAS_COM"],
  ["cp42", "GAS_COM"],
  ["gas safety", "GAS"],
  ["cp12", "GAS"],
  ["gas certificate", "GAS"],
  ["boiler install", "BOILER_INSTALL"],
  ["boiler", "BOILER"],
  ["commercial eicr", "EICR_COM"],
  ["eicr", "EICR"],
  ["electrical installation condition", "EICR"],
  ["fuse box", "CU_INSTALL"],
  ["consumer unit", "CU_INSTALL"],
  ["electrical diagnostic", "ELEC_DIAG"],
  ["fault find", "ELEC_DIAG"],
  ["commercial epc", "EPC_COM"],
  ["epc", "EPC"],
  ["energy performance", "EPC"],
  ["commercial pat", "PAT_COM"],
  ["pat test", "PAT"],
  ["portable appliance", "PAT"],
  ["commercial emergency lighting", "EMLIGHT_COM"],
  ["emergency lighting", "EMLIGHT"],
  ["commercial fire risk", "FRA_COM"],
  ["fire risk assessment", "FRA"],
  ["fra", "FRA"],
  ["commercial fire safety", "FSC_COM"],
  ["fire safety check", "FSC"],
  ["carbon monoxide", "CO_ALARM"],
  ["co alarm", "CO_ALARM"],
  ["interlinked", "ALARM_INTERLINK"],
  ["gas remedial", "GAS_REMEDIAL"],
  ["electrical remedial", "ELEC_REMEDIAL"],
  ["fire alarm", "FIRE_ALARM_INSTALL"],
  ["fire door", "FIRE_DOOR"],
  ["extinguisher", "FIRE_EXT_TEST"],
  ["asbestos", "ASBESTOS"],
];

const norm = (v) => (typeof v === "string" ? v.trim() : "");

// UK postcodes are always "outward inward" with a three-character inward
// part. Normalised here as well as on the website, so an enquiry arriving
// from anywhere lands as "SW1A 1FR" — both because a client record reading
// "SWA1FR" looks like broken data, and because two spellings of one
// postcode would otherwise create two properties for the same address.
export function formatPostcode(input) {
  const s = String(input || "").toUpperCase().replace(/\s+/g, "");
  if (s.length < 5 || s.length > 7) return String(input || "").trim().toUpperCase();
  return `${s.slice(0, s.length - 3)} ${s.slice(-3)}`;
}
const lower = (v) => norm(v).toLowerCase();

// slug → code → catalogue name → phrase. Returns null rather than guessing
// when nothing matches; the caller records the raw text on the quote instead,
// so an unrecognised service is visible rather than silently dropped.
export function resolveServiceCode(input) {
  const raw = lower(input);
  if (!raw) return null;
  if (SITE_SLUG_TO_CODE[raw]) return SITE_SLUG_TO_CODE[raw];  // slugs are already explicit

  const upper = norm(input).toUpperCase();
  if (SERVICE_CATALOG.some((s) => s.code === upper)) return upper;

  const byName = SERVICE_CATALOG.find((s) => s.name.toLowerCase() === raw);
  if (byName) return byName.code;

  // "Commercial <service>" / "<service> commercial" where the words don't
  // match a catalogue name exactly.
  const bare = raw.replace(/\bcommercial\b/g, "").trim();
  if (bare && bare !== raw) {
    const hit = SERVICE_CATALOG.find((s) => s.name.toLowerCase().includes(bare) && s.code.endsWith("_COM"));
    if (hit) return hit.code;
  }

  for (const [phrase, code] of NAME_HINTS) {
    if (raw.includes(phrase)) return commercialVariant(code, raw);
  }
  return null;
}

// "Commercial FRA" must not resolve to the RESIDENTIAL assessment.
//
// The phrase list is scanned longest-first, but it can only match phrases
// somebody thought to write down: a real enquiry came in saying "Commercial
// FRA", which hit the bare "fra" entry and quoted £84 for a job that should
// have been £259.99. Rather than keep adding every abbreviation someone
// might pair with "commercial", this checks the word itself and switches to
// the _COM code whenever the catalogue has one.
function commercialVariant(code, rawText) {
  if (!code || code.endsWith("_COM")) return code;
  if (!/\bcommercial\b|\bcom\b/.test(rawText)) return code;
  const com = `${code}_COM`;
  return SERVICE_CATALOG.some((s) => s.code === com) ? com : code;
}

// A free-text service field can hold more than one service: "Gas Safety and
// EICR", "EPC + PAT testing". Split on the separators people actually type,
// then resolve each part.
export function splitServiceText(text) {
  return norm(text)
    .split(/\s*(?:,|\/|\+|&|\band\b|\bplus\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

// "3 bed", "3-bedroom", "three bedroom flat" → 3. Used to pick the right
// tier on the size-priced services (EICR, EPC, FRA) instead of always
// quoting the cheapest one and having to correct it by hand.
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
export function parseBedrooms(text) {
  const t = lower(text);
  if (!t) return null;
  if (/\bstudio\b/.test(t)) return 0;
  const digit = t.match(/(\d+)\s*(?:-|\s)?\s*bed/);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 0 && n <= 12) return n;
  }
  const word = t.match(/\b(one|two|three|four|five|six|seven|eight)\b\s*(?:-|\s)?\s*bed/);
  if (word) return WORD_NUMBERS[word[1]];
  return null;
}

// "2 appliances", "boiler and a hob" is beyond this — only an explicit count
// is trusted, because gas is priced per appliance and guessing it wrong
// changes the quoted figure.
export function parseAppliances(text) {
  const t = lower(text);
  if (!t) return null;
  const m = t.match(/(\d+)\s*(?:gas\s*)?appliance/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) return n;
  }
  const w = t.match(/\b(one|two|three|four|five|six)\b\s*(?:gas\s*)?appliance/);
  if (w) return WORD_NUMBERS[w[1]];
  return null;
}

// Pick the tier whose label best fits a bedroom count. The labels are
// human-written ("Studio", "1–3 Bedrooms", "4 Bedrooms"), so this reads the
// numbers out of them rather than assuming an order.
export function tierForBedrooms(service, beds) {
  if (!service?.tiers?.length || beds == null) return null;
  if (beds === 0) {
    const studio = service.tiers.find((t) => /studio/i.test(t.label));
    if (studio) return studio;
  }
  for (const tier of service.tiers) {
    const nums = (tier.label.match(/\d+/g) || []).map(Number);
    if (!nums.length) continue;
    const lo = nums[0];
    const hi = nums.length > 1 ? nums[1] : (/\+/.test(tier.label) ? 99 : nums[0]);
    if (beds >= lo && beds <= hi) return tier;
  }
  // Above every listed tier — quote the largest rather than the smallest.
  const withNums = service.tiers.filter((t) => /\d/.test(t.label));
  return withNums.length ? withNums[withNums.length - 1] : null;
}

// Build the job's line items from whatever the enquiry described.
//
// `requested` is a list of { slug|code|name, tier, qty } — the booking form
// sends real slugs and tiers, the contact form sends one free-text string.
// `context` is everything the customer typed (message + property details),
// used only to refine size and appliance count.
export function buildLines(requested, context = "") {
  const beds = parseBedrooms(context);
  const appliances = parseAppliances(context);
  const lines = [];
  const unmatched = [];
  const seen = new Set();

  requested.forEach((item, i) => {
    const source = item?.slug || item?.code || item?.name || item;
    const code = resolveServiceCode(source);
    if (!code) {
      const text = norm(typeof source === "string" ? source : "");
      if (text) unmatched.push(text);
      return;
    }
    // Same service twice in one enquiry is a duplicate, not two jobs.
    if (seen.has(code)) return;
    seen.add(code);

    const service = SERVICE_CATALOG.find((s) => s.code === code);
    const line = makeServiceLine(code, `ln-${code}-${Date.now().toString(36)}-${i}`);

    // An explicit tier from the booking form beats anything inferred.
    const explicitTier = norm(item?.tier);
    const tier = explicitTier
      ? service?.tiers?.find((t) => t.label.toLowerCase() === explicitTier.toLowerCase())
      : tierForBedrooms(service, beds);
    if (tier) {
      line.tier = tier.label;
      line.unit = tier.price;
    }

    if (code === "GAS" && appliances) {
      line.qty = appliances;
    } else if (Number(item?.qty) > 1) {
      line.qty = Math.min(20, Math.round(Number(item.qty)));
    }

    lines.push(line);
  });

  return { lines, unmatched, beds, appliances };
}

// One tidy block of the customer's own words, kept verbatim on the job so
// nobody has to go back to the email to see what was actually asked for.
export function enquiryNote(e) {
  const parts = [];
  if (e.message) parts.push(e.message);
  const facts = [];
  if (e.propertyType) facts.push(`Property: ${e.propertyType}`);
  if (e.address) facts.push(`Address: ${e.address}`);
  if (e.preferredDate) facts.push(`Preferred date: ${e.preferredDate}${e.preferredSlot ? ` (${e.preferredSlot})` : ""}`);
  if (facts.length) parts.push(facts.join(" · "));
  return parts.join("\n\n");
}

// Everything the website sends, reduced to one shape regardless of which
// form it came from, with every string bounded.
export function normalizeEnquiry(body = {}) {
  const cap = (v, n = 500) => norm(v).slice(0, n);
  const rawServices = Array.isArray(body.items) && body.items.length
    ? body.items
    : splitServiceText(body.service).map((name) => ({ name }));

  return {
    source: cap(body.source) || "website",
    form: cap(body.form) || (Array.isArray(body.items) && body.items.length ? "booking" : "contact"),
    name: cap(body.name, 120),
    email: cap(body.email, 200).toLowerCase(),
    phone: cap(body.phone, 40),
    postcode: formatPostcode(cap(body.postcode, 12)),
    address: cap(body.address, 300),
    propertyType: cap(body.propertyType, 40),
    message: cap(body.message || body.notes, 4000),
    preferredDate: cap(body.date, 40),
    preferredSlot: cap(body.slot, 60),
    receivedAt: cap(body.receivedAt, 60) || new Date().toISOString(),
    services: (rawServices || []).slice(0, 12),
  };
}

// A stable key for one enquiry, so a retried webhook (or the website's own
// retry after a timeout) updates the same quote instead of creating a
// second one for the same customer. Deliberately includes the timestamp:
// the same person enquiring again next month is a genuinely new job.
export function enquiryKey(e) {
  const services = e.services
    .map((s) => resolveServiceCode(s?.slug || s?.code || s?.name || s) || "?")
    .sort()
    .join(",");
  return [e.email || e.phone, e.receivedAt, services].join("|");
}

export function quotePrice(lines) {
  return Math.round(linesTotal(lines) * 100) / 100;
}
