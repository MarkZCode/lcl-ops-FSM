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
import { readEnquiryText, tierForBeds, tierForCount, findTier, SIZE_RULES, svc } from "./quoteReader";

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

// Sizes and counts are read by lib/quoteReader.js, which reads every
// mention rather than the first one. These two stay for anything that only
// wants the single number.
export function parseBedrooms(text) {
  return readEnquiryText(text).beds;
}
export function parseAppliances(text) {
  const r = readEnquiryText(text);
  return r.gasExplicit ?? (r.gasNamed.length ? r.gasNamed.reduce((a, g) => a + g.n, 0) : r.anyAppliances);
}
export function tierForBedrooms(service, beds) {
  return tierForBeds(service, beds).tier;
}

const short = (code) => svc(code)?.name.replace(/\s*\(.*\)\s*/, "") || code;

// Build the job's line items from whatever the enquiry described.
//
// `requested` is a list of { slug|code|name, tier, qty } — the booking form
// sends real slugs and tiers, the contact form sends one free-text string.
// `context` is everything the customer typed (message + property details).
//
// Returns the lines plus `flags` ({ key, tone, text }) — every place the
// quote rests on an assumption, written for the person checking it — and
// `reading`, a short account of how each size was arrived at for the notes.
export function buildLines(requested, context = "") {
  const read = readEnquiryText(context);
  const lines = [];
  const unmatched = [];
  const flags = [];
  const reading = [];
  const seen = new Set();
  const flag = (key, tone, text) => { if (!flags.some((f) => f.key === key)) flags.push({ key, tone, text }); };
  const stamp = Date.now().toString(36);

  const codes = requested.map((item) => resolveServiceCode(item?.slug || item?.code || item?.name || item));
  const wants = (c) => codes.includes(c);
  const namedGas = read.gasNamed.reduce((a, g) => a + g.n, 0);
  // "3 appliances" with no "gas" in it: gas count when it's a gas enquiry,
  // PAT count when it's PAT — and nobody's guess when it's both.
  const gasCount = read.gasExplicit ?? (namedGas || null) ?? null;
  const gasFrom = read.gasExplicit != null ? "explicit" : namedGas ? "named" : null;
  let appliances = gasCount;
  let appliancesFrom = gasFrom;
  if (appliances == null && read.anyAppliances != null && wants("GAS") && !wants("PAT") && !wants("PAT_COM")) {
    appliances = read.anyAppliances;
    appliancesFrom = "plain";
  }

  requested.forEach((item, i) => {
    const source = item?.slug || item?.code || item?.name || item;
    const code = codes[i];
    if (!code) {
      const text = norm(typeof source === "string" ? source : "");
      if (text) unmatched.push(text);
      return;
    }
    // Same service twice in one enquiry is a duplicate, not two jobs.
    if (seen.has(code)) return;
    seen.add(code);

    const service = svc(code);
    const rule = SIZE_RULES[code];
    const id = (k = "") => `ln-${code}-${stamp}-${i}${k}`;

    // An explicit tier from the booking form beats anything inferred — but
    // only if it's one of ours. It used to be compared character for
    // character, so the website's "1-3 Bedrooms" never matched our
    // "1–3 Bedrooms" and the size was silently dropped.
    const sentTier = norm(item?.tier);
    const explicit = sentTier ? findTier(service, sentTier) : null;
    if (sentTier && !explicit) {
      flag(`tier:${code}`, "warn", `${service.name}: the website sent the size "${sentTier}", which isn't one of ours — priced from what they wrote instead.`);
    }

    // ── Separate dwellings: one certificate each ──
    if (rule?.by === "beds" && read.units && ["EICR", "EPC"].includes(code)) {
      // Grouped by the size band, not the bedroom count: a 2-bed and a
      // 3-bed flat are both "1–3 Bedrooms", so one line × 2.
      const groups = new Map();
      for (const u of read.units) {
        const band = tierForBeds(service, u.beds).tier?.label || `${u.beds}`;
        const g = groups.get(band) || { beds: u.beds, qty: 0 };
        g.beds = Math.max(g.beds, u.beds);
        g.qty += u.qty;
        groups.set(band, g);
      }
      let n = 0;
      for (const { beds, qty } of groups.values()) {
        const line = makeServiceLine(code, id(`-${beds}`));
        const { tier, over } = tierForBeds(service, beds);
        if (tier) { line.tier = tier.label; line.unit = tier.price; }
        if (qty > 1) line.qty = qty;
        if (over) flag(`over:${code}:${beds}`, "warn", `${service.name}: ${beds} bedrooms is more than our largest size (${tier?.label}) — price that one by hand.`);
        lines.push(line);
        n += qty;
      }
      reading.push(`${short(code)}: ${read.bedsHow} — ${n} certificates, one per dwelling`);
      flag(`units:${code}`, "warn", `${service.name}: ${read.bedsHow}, so it's quoted as ${n} certificates, one each. If it's actually one property, use a single line for the total bedrooms.`);
      return;
    }

    const line = makeServiceLine(code, id());
    let tier = explicit;

    if (rule?.by === "beds") {
      // A residential FRA for a block's common parts is priced by floors.
      if (code === "FRA" && read.communal && read.beds == null && !explicit) {
        const { tier: t } = tierForCount(service, read.floors ?? 1, /communal/i);
        tier = t;
        reading.push(`${short(code)}: communal areas${read.floors ? `, ${read.floors} floors` : ""}`);
        if (read.floors == null) flag("fra-floors", "warn", "Fire Risk Assessment: reads as communal areas, but they didn't say how many floors — priced at 1–3. Ask.");
        flag("fra-mixed", "info", "Communal-area FRA: residential rate assumes flats only. If there's a shop or other commercial unit in the building, use the commercial FRA.");
      } else {
        const { tier: t, over } = tierForBeds(service, read.beds);
        if (!explicit) tier = t;
        else if (t && t.label !== explicit.label) {
          flag(`conflict:${code}`, "warn", `${service.name}: they picked "${explicit.label}" on the website but wrote ${read.beds} bedroom${read.beds === 1 ? "" : "s"}, which would be "${t.label}". Kept their pick — check which is right.`);
        }
        if (over && !explicit) flag(`over:${code}`, "warn", `${service.name}: ${read.beds} bedrooms is more than our largest size (${t?.label}) — price it by hand.`);
        if (tier && read.beds != null) reading.push(`${short(code)}: ${read.beds === 0 ? "studio" : `${read.beds} bedroom${read.beds === 1 ? "" : "s"}`}${read.bedsHow ? ` — ${read.bedsHow}` : ""}`);
        if (read.bedsLow != null) {
          const lowTier = tierForBeds(service, read.bedsLow).tier;
          if (lowTier && tier && lowTier.label !== tier.label) {
            flag(`range:${code}`, "warn", `${service.name}: they weren't sure of the size (${read.bedsLow} or ${read.beds} bedrooms) — priced at ${tier.label}; it's ${lowTier.label} if the smaller.`);
          }
        }
        if (read.unitCount && !explicit) {
          line.qty = Math.min(50, read.unitCount.count);
          flag(`count:${code}`, "warn", `${service.name}: they mention ${read.unitCount.count} ${read.unitCount.kind} — quoted ${line.qty} certificates${tier ? ` at ${tier.label}` : ""}. Ask the size of each.`);
          reading.push(`${short(code)}: ${read.unitCount.count} ${read.unitCount.kind}`);
        }
      }
    } else if (rule) {
      const n = rule.by === "gas" ? appliances : read[rule.by];
      if (n != null) {
        const { tier: t, over } = tierForCount(service, n, rule.only);
        if (!explicit) tier = t;
        else if (t && t.label !== explicit.label) {
          flag(`conflict:${code}`, "warn", `${service.name}: they picked "${explicit.label}" but wrote ${n}, which would be "${t.label}". Kept their pick — check which is right.`);
        }
        if (over) flag(`over:${code}`, "warn", `${service.name}: ${n} is more than our largest size (${t?.label}) — price it by hand.`);
        if (tier) reading.push(`${short(code)}: ${tier.label}${rule.by === "sqm" && read.sqmFromFeet ? " (converted from square feet)" : ""}`);
        if (rule.by === "sqm" && read.sqmFromFeet) flag("sqft", "info", `EPC: they gave the size in square feet — converted to about ${read.sqm} m².`);
      }
    }

    if (tier) {
      line.tier = tier.label;
      line.unit = tier.price;
    }

    if (code === "GAS") {
      if (appliances) {
        line.qty = Math.min(12, appliances);
        reading.push(`Gas: ${appliances} appliance${appliances === 1 ? "" : "s"}${appliancesFrom === "named" ? ` (${read.gasNamed.map((g) => (g.n > 1 ? `${g.n} × ${g.label}` : g.label)).join(", ")})` : ""}`);
        if (appliancesFrom === "named") {
          flag("gas-named", "info", `Gas Safety: counted ${appliances} appliance${appliances === 1 ? "" : "s"} from what they named (${read.gasNamed.map((g) => g.label).join(", ")}). Confirm — an electric hob or oven doesn't count.`);
        } else if (appliancesFrom === "plain") {
          flag("gas-plain", "info", `Gas Safety: they said "${appliances} appliances" without saying gas — priced as ${appliances} gas appliances. Confirm.`);
        }
      }
      if (read.noGas) flag("no-gas", "warn", "They say there's no gas at the property — check they really need a Gas Safety Certificate.");
      if (read.units || read.unitCount) flag("gas-units", "warn", "Gas Safety: separate flats each need their own certificate — this quote has one. Add one per flat that has gas.");
    } else if (Number(item?.qty) > 1) {
      line.qty = Math.min(20, Math.round(Number(item.qty)));
    }

    if (code === "FRA" && read.units) {
      flag("fra-units", "warn", "Fire Risk Assessment with separate flats: usually it's the communal areas that need assessing, not each flat — check what they want.");
    }
    // "EICR for my shop" — the residential service at the commercial premises.
    const com = `${code}_COM`;
    if (read.commercialWords && !code.endsWith("_COM") && svc(com)) {
      flag(`commercial:${code}`, "warn", `They mention a ${read.commercialWords.toLowerCase()} — if the ${short(code)} is for commercial premises, switch to ${svc(com).name}.`);
    }

    lines.push(line);
  });

  if (read.extraRooms && read.beds != null) {
    flag("extra-room", "info", `They also mention a ${read.extraRooms.toLowerCase()} — if it's used as a bedroom it counts towards the size.`);
  }
  if (read.beds != null && !read.bedsSure && !read.units && lines.some((l) => SIZE_RULES[l.code]?.by === "beds")) {
    flag("beds", "warn", `Bedrooms: ${read.bedsHow}. Confirm with the client.`);
  }
  if (read.maybeSeparate && lines.some((l) => ["EICR", "EPC", "GAS"].includes(l.code))) {
    flag("separate", "warn", "If upstairs and downstairs are separate flats (own front door or own meter), each needs its own certificate — quote them separately instead of one combined.");
  }
  if (read.hmo) {
    const missing = ["FRA", "FSC", "EMLIGHT"].filter((c) => !codes.includes(c) && !codes.includes(`${c}_COM`));
    if (missing.length) flag("hmo", "info", `HMO — licensing usually also needs ${missing.map((c) => short(c)).join(", ")}. Worth offering.`);
  }

  return { lines, unmatched, beds: read.beds, appliances, flags, reading, read };
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
