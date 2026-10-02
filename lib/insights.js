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

// Enquiries by service and by area (the postcode district), with how many
// of each were won.
export function byServiceAndArea(jobs = [], clients = []) {
  const props = new Map();
  for (const c of clients) for (const p of c.properties || []) props.set(p.id, p);
  const svc = new Map(), area = new Map();
  const add = (map, key, j) => {
    if (!map.has(key)) map.set(key, { key, enquiries: 0, won: 0, value: 0 });
    const r = map.get(key);
    r.enquiries += 1;
    if (j.status !== "cancelled" && WON(j)) { r.won += 1; r.value += Number(j.price) || 0; }
  };
  for (const j of jobs) {
    const codes = [...new Set(getJobLines(j).filter((l) => !isAddonCode(l.code)).map((l) => (l.code === "CUSTOM" ? "Custom work" : serviceShort(l.code))))];
    for (const c of codes) add(svc, c, j);
    const pc = String(props.get(j.propertyId)?.postcode || "").toUpperCase().replace(/\s+/g, "");
    add(area, pc.length >= 5 ? pc.slice(0, -3) : "No postcode", j);
  }
  const rows = (m) => [...m.values()].map((r) => ({ ...r, rate: pct(r.won, r.enquiries) })).sort((a, b) => b.enquiries - a.enquiries);
  return { services: rows(svc), areas: rows(area).slice(0, 20) };
}

// Each engineer: work finished, offers accepted and turned down, jobs they
// pulled out of, no-access visits, and how long accepted work took to finish.
export function engineerReport(jobs = [], engineers = []) {
  const rows = new Map(engineers.map((e) => [e.id, { name: e.name, done: 0, accepted: 0, declined: 0, cancelled: 0, noAccess: 0, days: [] }]));
  for (const j of jobs) {
    for (const o of j.offerLog || []) {
      const r = rows.get(o.engineerId);
      if (r && r[o.status] !== undefined) r[o.status] += 1;
    }
    const r = rows.get(j.engineerId);
    if (!r) continue;
    if (["completed", "invoiced", "paid"].includes(j.status)) {
      r.done += 1;
      const from = j.confirmedAt || j.acceptedAt;
      const to = j.completedAt || j.invoicedAt || j.paidAt;
      if (from && to) { const d = (new Date(to) - new Date(from)) / 86400000; if (d >= 0 && d < 120) r.days.push(d); }
    }
    r.noAccess += Number(j.noAccessCount) || 0;
  }
  return [...rows.values()]
    .map((r) => ({ ...r, avgDays: r.days.length ? Math.round((r.days.reduce((a, b) => a + b, 0) / r.days.length) * 10) / 10 : null }))
    .filter((r) => r.done || r.accepted || r.declined || r.cancelled || r.noAccess)
    .sort((a, b) => b.done - a.done);
}

export function insights(jobs, engineerById, { clients = [], engineers = [] } = {}) {
  return {
    ...byServiceAndArea(jobs, clients),
    engineers: engineerReport(jobs, engineers),
    sources: sourceReport(jobs),
    people: personReport(jobs),
    margins: marginByService(jobs, engineerById),
    lost: lostReasons(jobs),
    response: responseTimeStats(jobs),
  };
}
