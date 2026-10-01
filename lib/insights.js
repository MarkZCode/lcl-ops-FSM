// Where the work comes from, who wins it, and what each service actually
// makes. Pure — takes jobs already filtered to the period being looked at.
import { getJobLines, isAddonCode, lineTotal, serviceShort } from "./format";
import { jobFinancialsSplit } from "./finance";
import { quoteSentEvidence } from "./nextAction";
import { responseTimeStats } from "./quoteChecks";

const WON = (j) => !!j.acceptedAt || ["scheduled", "in_progress", "completed", "invoiced", "paid"].includes(j.status);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const SOURCE_LABELS = { website: "Website", email: "Email enquiry", renewal: "Automatic renewal" };

// Enquiries → won, by where they came from. A website job carries which
// form it was (booking / contact); everything typed in by hand is "Added by
// the office"; a converted prospect is "Outreach".
export function sourceReport(jobs = []) {
  const map = new Map();
  for (const j of jobs) {
    let key = SOURCE_LABELS[j.source] || (j.prospectId ? "Outreach (renewal prospects)" : j.recurringFromId ? "Repeat / recurring" : "Added by the office");
    if (j.source === "website" && j.sourceForm) key = `Website — ${j.sourceForm} form`;
    if (j.source === "email" && j.sourceMailbox) key = `Email — ${j.sourceMailbox}`;
    if (!map.has(key)) map.set(key, { source: key, enquiries: 0, won: 0, lost: 0, value: 0 });
    const r = map.get(key);
    r.enquiries += 1;
    if (j.status === "cancelled") r.lost += 1;
    else if (WON(j)) { r.won += 1; r.value += Number(j.price) || 0; }
  }
  return [...map.values()].map((r) => ({ ...r, rate: pct(r.won, r.enquiries) })).sort((a, b) => b.enquiries - a.enquiries);
}

// Quotes sent and won per person. "Sent by" is whoever sent the quote email
// or WhatsApp, or marked it sent.
export function personReport(jobs = []) {
  const map = new Map();
  for (const j of jobs) {
    const sent = (j.activity || []).find((a) => a.direction !== "in" && a.by && (a.template === "quote" || /quote sent/i.test(a.title || "")));
    if (!sent && !quoteSentEvidence(j)) continue;
    const name = (typeof sent?.by === "string" ? sent.by : sent?.by?.name) || "Unknown";
    if (!map.has(name)) map.set(name, { name, sent: 0, won: 0, value: 0 });
    const r = map.get(name);
    r.sent += 1;
    if (j.status !== "cancelled" && WON(j)) { r.won += 1; r.value += Number(j.price) || 0; }
  }
  return [...map.values()].map((r) => ({ ...r, rate: pct(r.won, r.sent) })).sort((a, b) => b.sent - a.sent);
}

// Revenue, engineer cost and what's left, per service — finished work only.
// An engineer's pay for a visit is shared across the services on it in
// proportion to their price.
export function marginByService(jobs = [], engineerById) {
  const map = new Map();
  for (const j of jobs) {
    if (!["completed", "invoiced", "paid"].includes(j.status)) continue;
    const f = jobFinancialsSplit(j, engineerById);
    for (const share of f.shares || []) {
      const real = (share.lines || []).filter((l) => !isAddonCode(l.code) && !l.cancelled);
      const total = real.reduce((s, l) => s + lineTotal(l), 0);
      for (const l of real) {
        const key = l.code === "CUSTOM" ? "Custom work" : serviceShort(l.code);
        if (!map.has(key)) map.set(key, { service: key, count: 0, revenue: 0, cost: 0, unpriced: 0 });
        const r = map.get(key);
        const rev = lineTotal(l);
        r.count += 1;
        r.revenue += rev;
        if (share.rateUnknown) r.unpriced += 1;
        else r.cost += total > 0 ? (share.payable || 0) * (rev / total) : 0;
      }
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, margin: r.revenue - r.cost, marginPct: pct(r.revenue - r.cost, r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

// Why quotes and jobs were lost.
export function lostReasons(jobs = []) {
  const map = new Map();
  for (const j of jobs) {
    if (j.status !== "cancelled") continue;
    const key = j.cancelReasonLabel || "No reason recorded";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function insights(jobs, engineerById) {
  return {
    sources: sourceReport(jobs),
    people: personReport(jobs),
    margins: marginByService(jobs, engineerById),
    lost: lostReasons(jobs),
    response: responseTimeStats(jobs),
  };
}
