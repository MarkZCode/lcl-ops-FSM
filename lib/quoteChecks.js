// What a person should look at before a quote goes out.
//
// A quote built from an enquiry is a best guess: the customer wrote "EICR
// for my flat" and the app picked a size. These checks say, in plain words,
// which parts of the quote ARE guesses, so "check the quote" is a short list
// rather than a re-read of the whole enquiry. Pure — no network, no store.
import { SERVICE_CATALOG } from "./constants";
import { getJobLines, isAddonCode } from "./format";
import { readEnquiryText, tierForBeds, tierForCount, SIZE_RULES } from "./quoteReader";
import { buildLines } from "./enquiry";

// What the client actually wrote for an enquiry-built quote. Newer quotes
// keep it on the job; older ones only have it inside the enquiry entry in
// the conversation.
export function enquiryTextOf(job) {
  if (job?.enquiryText) return job.enquiryText;
  const first = (job?.activity || []).find((a) => /enquiry/i.test(a.title || "") && a.detail);
  if (!first) return "";
  const said = first.detail.split(/What they wrote:\s*/i)[1];
  const facts = (first.detail.match(/^(?:Address|Property type):.*$/gim) || []).join(" ");
  return [said || "", facts].filter(Boolean).join(" ").trim();
}

// Re-read what they wrote against what the quote says NOW. A warning here
// goes away by itself once someone corrects the line.
function sizeAgainstText(job, lines) {
  const text = enquiryTextOf(job);
  if (!text) return [];
  const read = readEnquiryText(text);
  const out = [];
  const conflictKept = new Set((job.quoteFlags || []).filter((f) => f.key.startsWith("conflict:")).map((f) => f.key.slice(9)));
  const byCode = {};
  for (const l of lines) (byCode[l.code] ||= []).push(l);
  for (const [code, ls] of Object.entries(byCode)) {
    const rule = SIZE_RULES[code];
    const service = SERVICE_CATALOG.find((s) => s.code === code);
    if (!rule || !service || conflictKept.has(code)) continue;
    if (rule.by === "beds" && read.units && ["EICR", "EPC"].includes(code)) {
      const want = read.units.reduce((a, u) => a + u.qty, 0);
      const have = ls.reduce((a, l) => a + Math.max(1, Number(l.qty) || 1), 0);
      if (have < want) {
        out.push({ key: `units-now:${code}`, tone: "warn", text: `What they wrote ${read.bedsHow} — that's ${want} ${service.name} certificates, and this quote has ${have}.` });
      }
      continue;
    }
    if (ls.length !== 1) continue;
    const l = ls[0];
    if (!l.tier) continue;
    let want = null;
    let said = "";
    if (rule.by === "beds") {
      if (read.beds == null || (code === "FRA" && /communal/i.test(l.tier))) continue;
      want = tierForBeds(service, read.beds).tier;
      said = read.beds === 0 ? "a studio" : `${read.beds} bedroom${read.beds === 1 ? "" : "s"}${read.bedsHow ? ` (${read.bedsHow})` : ""}`;
    } else {
      const n = rule.by === "gas" ? read.gasExplicit : read[rule.by];
      if (n == null) continue;
      want = tierForCount(service, n, rule.only).tier;
      said = String(n);
    }
    if (want && want.label !== l.tier) {
      out.push({ key: `size-now:${l.id}`, tone: "warn", text: `${service.name}: what they wrote reads as ${said}, but it's priced at "${l.tier}" — that would be "${want.label}".` });
    }
  }
  return out;
}

// Older enquiry quotes were made before the reader kept its warnings — work
// out the ones that don't depend on how the lines were built.
const LIVE_SAFE = /^(beds|separate|extra-room|commercial:|no-gas|gas-units|hmo|fra-units|gas-named|gas-plain)/;
function flagsFor(job, lines) {
  if (Array.isArray(job.quoteFlags)) return job.quoteFlags;
  const text = enquiryTextOf(job);
  if (!text) return [];
  const codes = [...new Set(lines.map((l) => l.code))].map((code) => ({ code }));
  return buildLines(codes, text).flags.filter((f) => LIVE_SAFE.test(f.key));
}

const DAY = 86400_000;
const outward = (postcode) => {
  const s = String(postcode || "").toUpperCase().replace(/\s+/g, "");
  return s.length >= 5 ? s.slice(0, -3) : s;
};

// ── Congestion charge zone ──────────────────────────────────────────────
// The zone doesn't follow postcode boundaries, so this is two lists: outward
// codes that sit wholly inside it, and ones it only clips. "inside" is safe
// to charge for automatically; "partial" needs a person to look at the map.
const CCZ_INSIDE = /^(EC[1-4][A-Z]?|WC[12][A-Z]?|W1[A-Z]|SW1[AEHPY])$/;
const CCZ_PARTIAL = /^(SE1|SE11|SW1V|N1|E1|NW1)$/;
export function congestionZone(postcode) {
  const o = outward(postcode);
  if (!o) return null;
  if (CCZ_INSIDE.test(o)) return "inside";
  if (CCZ_PARTIAL.test(o)) return "partial";
  return null;
}

// The zone itself, as a ring of points along its boundary roads (Marylebone
// Rd → Euston Rd → Pentonville Rd → City Rd → Commercial St → Tower Bridge
// → New Kent Rd → Kennington Lane → Vauxhall Bridge Rd → Park Lane →
// Edgware Rd). A postcode is looked up to a map position and tested against
// this, which settles the districts the zone only clips (SE1, N1, E1, NW1,
// SW1V). Accurate to a street or so: a property ON a boundary road could
// land either side.
const CCZ_RING = [
  [51.5203, -0.1700], [51.5238, -0.1440], [51.5303, -0.1230], [51.5318, -0.1060],
  [51.5258, -0.0875], [51.5235, -0.0775], [51.5150, -0.0720], [51.5100, -0.0740],
  [51.5065, -0.0745], [51.5020, -0.0765], [51.4945, -0.0845], [51.4946, -0.1005],
  [51.4885, -0.1110], [51.4860, -0.1235], [51.4890, -0.1290], [51.4960, -0.1435],
  [51.5027, -0.1510], [51.5130, -0.1590],
];
export function pointInCongestionZone(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  let inside = false;
  for (let i = 0, j = CCZ_RING.length - 1; i < CCZ_RING.length; j = i++) {
    const [yi, xi] = CCZ_RING[i], [yj, xj] = CCZ_RING[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Is this postcode in the congestion zone? true / false, or null when the
// postcode couldn't be looked up (incomplete, mistyped, or the lookup is
// down) — in which case the district rule above is the fallback.
// Works in the browser and on the server. postcodes.io: postcode only.
export async function inCongestionZone(postcode) {
  const pc = String(postcode || "").trim();
  if (pc.replace(/\s/g, "").length < 5) return null;
  // Districts nowhere near it never need a lookup.
  const quick = congestionZone(pc);
  if (!quick) return false;
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (!r.ok) return quick === "inside" ? true : null;
    const d = await r.json();
    return pointInCongestionZone(d?.result?.latitude, d?.result?.longitude);
  } catch {
    return quick === "inside" ? true : null;
  }
}

// ── Paid parking ────────────────────────────────────────────────────────
// Inner London is controlled parking almost everywhere; further out an
// engineer can usually park on the street for nothing. A hint, not a fact —
// it decides whether the parking line is worth keeping or waiving.
const INNER = /^(EC\d|WC\d|W([1-9]|1[0-4])[A-Z]?|SW([1-9]|1[01])[A-Z]?|SE(1|5|8|1[01567])|NW([1-9]|10)|N([1-9]|1[569])[A-Z]?|E([1-9]|1[45])[A-Z]?)$/;
export function paidParkingLikely(postcode) {
  const o = outward(postcode);
  if (!o) return null;
  return INNER.test(o);
}

// Another open quote for the same client raised in the last week — usually
// the same person filling the form twice, or emailing and then using the
// website.
export function possibleDuplicate(job, jobs = []) {
  if (!job?.clientId) return null;
  const at = new Date(job.createdAt || 0).getTime();
  return (
    jobs.find(
      (j) =>
        j.id !== job.id &&
        j.clientId === job.clientId &&
        j.status === "quote" &&
        Math.abs(new Date(j.createdAt || 0).getTime() - at) <= 7 * DAY
    ) || null
  );
}

// Returns [{ key, text, tone }] — tone "warn" for things that change the
// price, "info" for things worth a glance.
export function quoteChecks(job, { property, jobs = [], client } = {}) {
  if (!job) return [];
  const out = [];
  const lines = getJobLines(job).filter((l) => !l.cancelled);
  const real = lines.filter((l) => !isAddonCode(l.code));
  const auto = ["website", "email"].includes(job.source);

  for (const l of real) {
    const svc = SERVICE_CATALOG.find((s) => s.code === l.code);
    if (svc?.tiers?.length && !l.tier) {
      const ask = SIZE_RULES[l.code]?.ask || "how many bedrooms";
      out.push({
        key: `size:${l.id}`, tone: "warn",
        text: `${svc.name}: no size given — it's priced at the smallest (${svc.tiers[0].label}). Ask ${ask}.`,
      });
    }
    if (l.code === "GAS" && auto && !job.gasAppliances) {
      out.push({ key: `gas:${l.id}`, tone: "warn", text: "Gas Safety: no appliance count given — priced for one. Ask how many gas appliances." });
    }
  }
  if (auto) {
    const now = sizeAgainstText(job, real);
    out.push(...now);
    // A stored "check the size" flag is moot once the line has been changed
    // to what the text says — the live check above covers what's left.
    for (const f of flagsFor(job, real)) {
      if (out.some((o) => o.key === f.key)) continue;
      out.push(f);
    }
  }
  if (/not matched to a service/i.test(job.notes || "")) {
    out.push({ key: "unmatched", tone: "warn", text: "They asked for something the app couldn't match to a service — see the notes and add it by hand." });
  }
  if (!property?.postcode) {
    out.push({ key: "postcode", tone: "warn", text: "No postcode — can't tell whether the congestion charge or paid parking applies." });
  } else {
    const zone = congestionZone(property.postcode);
    const hasCcz = lines.some((l) => l.code === "CONGESTION");
    // The charge is added automatically when the postcode is in the zone
    // (see CongestionAuto). These only speak up when that couldn't be
    // settled, or someone has taken the charge back off.
    const settled = job.cczCheckedFor === String(property.postcode).replace(/\s/g, "").toUpperCase();
    if (zone === "inside" && !hasCcz && settled) {
      out.push({ key: "ccz", tone: "info", text: `${property.postcode} is inside the congestion zone and the charge has been taken off this quote.` });
    } else if (zone === "inside" && !hasCcz) {
      out.push({ key: "ccz", tone: "warn", text: `${property.postcode} is inside the congestion zone — add the Congestion Zone Charge.` });
    } else if (zone === "partial" && !hasCcz && !settled) {
      out.push({ key: "ccz", tone: "info", text: `${outward(property.postcode)} is partly inside the congestion zone — check the address and add the charge if it is.` });
    }
    const parking = lines.find((l) => l.code === "PARKING" && !l.waived);
    const paid = paidParkingLikely(property.postcode);
    if (parking && paid === false) {
      out.push({ key: "parking", tone: "info", text: `${outward(property.postcode)} is usually free street parking — consider waiving the parking charge.` });
    } else if (!parking && paid) {
      out.push({ key: "parking", tone: "info", text: `${outward(property.postcode)} is a paid-parking area — the parking charge isn't on this quote.` });
    }
  }
  const pct = Number(client?.discountPercent) || 0;
  if (pct > 0 && !(Number(job.discount) > 0)) {
    out.push({ key: "portfolio", tone: "warn", text: `${client.name} has a ${pct}% portfolio discount and it isn't on this quote — add it under Edit job → discount.` });
  }
  const dup = possibleDuplicate(job, jobs);
  if (dup) {
    out.push({ key: "dup", tone: "warn", text: `This client already has an open quote, ${dup.id}, from the same week — check it isn't the same enquiry twice.`, jobId: dup.id });
  }
  return out;
}

// ── How long has a new enquiry been waiting for a first answer? ─────────
// Counted from when it arrived until the first thing we did about it: the
// WhatsApp reply, the quote going out, or it being marked as answered.
export function firstResponseAt(job) {
  const times = [job?.enquiryRepliedAt, job?.quoteSentAt];
  for (const a of job?.activity || []) {
    if (a.direction === "in") continue;
    if (["email", "whatsapp", "call"].includes(a.type)) times.push(a.at);
  }
  const t = times.filter(Boolean).map((x) => new Date(x).getTime()).filter((x) => !isNaN(x)).sort((a, b) => a - b)[0];
  return t ? new Date(t).toISOString() : null;
}

// ms the enquiry has been waiting, or null when it isn't waiting.
export function enquiryWaitMs(job, now = new Date()) {
  if (!job || job.status !== "quote" || job.acceptedAt) return null;
  if (!["website", "email"].includes(job.source)) return null;
  if (firstResponseAt(job)) return null;
  const at = new Date(job.createdAt || 0).getTime();
  if (!at) return null;
  const ms = now.getTime() - at;
  return ms > 7 * DAY ? null : ms;
}

export function waitLabel(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// Average time to first response over a set of enquiry jobs → { count, avgMs }.
export function responseTimeStats(jobs = []) {
  const spans = [];
  for (const j of jobs) {
    if (!["website", "email"].includes(j?.source)) continue;
    const first = firstResponseAt(j);
    if (!first || !j.createdAt) continue;
    const ms = new Date(first).getTime() - new Date(j.createdAt).getTime();
    if (ms >= 0 && ms < 30 * DAY) spans.push(ms);
  }
  if (!spans.length) return { count: 0, avgMs: null };
  return { count: spans.length, avgMs: spans.reduce((a, b) => a + b, 0) / spans.length };
}
