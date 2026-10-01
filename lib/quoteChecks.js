// What a person should look at before a quote goes out.
//
// A quote built from an enquiry is a best guess: the customer wrote "EICR
// for my flat" and the app picked a size. These checks say, in plain words,
// which parts of the quote ARE guesses, so "check the quote" is a short list
// rather than a re-read of the whole enquiry. Pure — no network, no store.
import { SERVICE_CATALOG } from "./constants";
import { getJobLines, isAddonCode } from "./format";

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
export function quoteChecks(job, { property, jobs = [] } = {}) {
  if (!job) return [];
  const out = [];
  const lines = getJobLines(job).filter((l) => !l.cancelled);
  const real = lines.filter((l) => !isAddonCode(l.code));
  const auto = ["website", "email"].includes(job.source);

  for (const l of real) {
    const svc = SERVICE_CATALOG.find((s) => s.code === l.code);
    if (svc?.tiers?.length && !l.tier) {
      out.push({
        key: `size:${l.id}`, tone: "warn",
        text: `${svc.name}: no property size given — it's priced at the smallest (${svc.tiers[0].label}). Ask how many bedrooms.`,
      });
    }
    if (l.code === "GAS" && auto && !job.gasAppliances) {
      out.push({ key: `gas:${l.id}`, tone: "warn", text: "Gas Safety: no appliance count given — priced for one. Ask how many gas appliances." });
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
    if (zone === "inside" && !hasCcz) {
      out.push({ key: "ccz", tone: "warn", text: `${property.postcode} is inside the congestion zone — add the Congestion Zone Charge.` });
    } else if (zone === "partial" && !hasCcz) {
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
