// Where the work comes from, who wins it, and what each service actually
// makes. Pure — takes jobs already filtered to the period being looked at.
import { getJobLines, isAddonCode, lineTotal, serviceShort } from "./format";
import { jobFinancialsSplit } from "./finance";
import { quoteSentEvidence } from "./nextAction";
import { responseTimeStats } from "./quoteChecks";
import { jobBalance } from "./payments";

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

// Money owed, by how long it has been owed. Uses EVERY unpaid invoice, not
// just the period on screen — a debt doesn't stop mattering when the month
// rolls over.
export function agedDebt(allJobs = [], clients = [], now = new Date()) {
  const buckets = [
    { key: "0–7 days", max: 7, total: 0, count: 0 }, { key: "8–14 days", max: 14, total: 0, count: 0 },
    { key: "15–30 days", max: 30, total: 0, count: 0 }, { key: "Over 30 days", max: Infinity, total: 0, count: 0 },
  ];
  const rows = [];
  for (const j of allJobs) {
    if (j.status !== "invoiced") continue;
    const owed = jobBalance(j);
    if (!(owed > 0)) continue;
    const days = j.invoicedAt ? Math.floor((now.getTime() - new Date(j.invoicedAt).getTime()) / 86400000) : 0;
    const b = buckets.find((x) => days <= x.max);
    b.total += owed; b.count += 1;
    rows.push({ id: j.id, client: clients.find((c) => c.id === j.clientId)?.name || "", days, owed, invoice: j.invoiceNumber || "" });
  }
  return { buckets, rows: rows.sort((a, b) => b.days - a.days), total: buckets.reduce((s, b) => s + b.total, 0) };
}

// How much of the work comes from people who have used us before.
export function repeatClients(jobs = [], allJobs = []) {
  const first = new Map();
  for (const j of allJobs) {
    if (!j.clientId || !j.createdAt) continue;
    if (!first.has(j.clientId) || j.createdAt < first.get(j.clientId)) first.set(j.clientId, j.createdAt);
  }
  let repeatJobs = 0, repeatValue = 0, total = 0, totalValue = 0;
  for (const j of jobs) {
    if (j.status === "cancelled" || !j.clientId) continue;
    total += 1; totalValue += Number(j.price) || 0;
    if (first.get(j.clientId) && j.createdAt > first.get(j.clientId)) { repeatJobs += 1; repeatValue += Number(j.price) || 0; }
  }
  return { repeatJobs, total, rate: pct(repeatJobs, total), repeatValue, totalValue };
}

// What was lost: quotes and jobs that were cancelled, and visits where
// nobody was in.
export function losses(jobs = []) {
  const cancelled = jobs.filter((j) => j.status === "cancelled");
  return {
    cancelledCount: cancelled.length,
    cancelledValue: cancelled.reduce((s, j) => s + (Number(j.price) || 0), 0),
    noAccessVisits: jobs.reduce((s, j) => s + (Number(j.noAccessCount) || 0), 0),
    noAccessJobs: jobs.filter((j) => Number(j.noAccessCount) > 0).length,
  };
}

// What's coming: work that is accepted or booked but not yet done, and the
// renewals falling due in the next 90 days priced at what they cost last time.
export function forecast(allJobs = [], now = new Date()) {
  const booked = allJobs.filter((j) => j.status === "scheduled" || j.status === "in_progress" || (j.status === "quote" && j.acceptedAt));
  const quoted = allJobs.filter((j) => j.status === "quote" && !j.acceptedAt);
  const horizon = now.getTime() + 90 * 86400000;
  const renewals = allJobs.filter((j) => j.certExpiry && ["completed", "invoiced", "paid"].includes(j.status) && !j.renewalJobId && !j.recurringNextId
    && new Date(j.certExpiry).getTime() >= now.getTime() && new Date(j.certExpiry).getTime() <= horizon);
  const sum = (l) => l.reduce((s, j) => s + (Number(j.price) || 0), 0);
  return {
    bookedCount: booked.length, bookedValue: sum(booked),
    quotedCount: quoted.length, quotedValue: sum(quoted),
    renewalCount: renewals.length, renewalValue: sum(renewals),
    renewals: renewals.sort((a, b) => new Date(a.certExpiry) - new Date(b.certExpiry)).slice(0, 40),
  };
}

// When do people actually pick up? Every logged call that says whether it
// was answered — "Called — spoke" against "no answer" / "voicemail" on jobs,
// and the outcomes recorded on prospects — counted by time of day (UK).
// Returns nothing until there are enough calls for the answer to mean
// anything.
const CALL_SLOTS = [["8–10am", 8, 10], ["10am–12pm", 10, 12], ["12–2pm", 12, 14], ["2–4pm", 14, 16], ["4–6pm", 16, 18], ["6–8pm", 18, 20]];
const ukHour = (iso) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
export function bestCallTimes(jobs = [], prospects = []) {
  const calls = [];
  for (const j of jobs) {
    for (const a of j.activity || []) {
      if (a.type !== "call" || a.direction === "in" || !a.at) continue;
      const t = String(a.title || "").toLowerCase();
      if (/spoke/.test(t)) calls.push({ at: a.at, answered: true });
      else if (/no answer|voicemail/.test(t)) calls.push({ at: a.at, answered: false });
    }
  }
  for (const p of prospects) {
    for (const e of p.contactLog || []) {
      if (e.channel !== "outcome" || !e.at) continue;
      const n = String(e.note || "").toLowerCase();
      if (/^no answer|^left a message/.test(n)) calls.push({ at: e.at, answered: false });
      else if (/call back later|wants a quote|already sorted|not interested/.test(n)) calls.push({ at: e.at, answered: true });
    }
  }
  const slots = CALL_SLOTS.map(([label, from, to]) => {
    const inSlot = calls.filter((c) => { const h = ukHour(c.at); return h >= from && h < to; });
    const answered = inSlot.filter((c) => c.answered).length;
    return { label, calls: inSlot.length, answered, rate: pct(answered, inSlot.length) };
  });
  const enough = slots.filter((s) => s.calls >= 5);
  const best = enough.length >= 2 ? [...enough].sort((a, b) => b.rate - a.rate)[0] : null;
  return { total: calls.length, slots, best };
}

export function insights(jobs, engineerById, { clients = [], engineers = [], allJobs, prospects = [] } = {}) {
  const every = allJobs || jobs;
  return {
    callTimes: bestCallTimes(every, prospects),
    debt: agedDebt(every, clients),
    repeat: repeatClients(jobs, every),
    losses: losses(jobs),
    forecast: forecast(every),
    ...byServiceAndArea(jobs, clients),
    engineers: engineerReport(jobs, engineers),
    sources: sourceReport(jobs),
    people: personReport(jobs),
    margins: marginByService(jobs, engineerById),
    lost: lostReasons(jobs),
    response: responseTimeStats(jobs),
  };
}
