// Booking helpers: who should do a job, who can't, and what else is open at
// the same address. Pure — reads jobs and engineers, never writes.
import { getJobLines, isAddonCode } from "./format";

const outward = (postcode) => {
  const s = String(postcode || "").toUpperCase().replace(/\s+/g, "");
  return s.length >= 5 ? s.slice(0, -3) : s;
};
const area = (postcode) => (outward(postcode).match(/^[A-Z]+/) || [""])[0];
// The London calendar day — a 9am BST booking is stored as 08:00Z, and a
// local-midnight Date is the day before in UTC.
const dayOf = (v) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
};

// ── Days off ────────────────────────────────────────────────────────────
// engineer.unavailable = [{ id, from: "YYYY-MM-DD", to: "YYYY-MM-DD", note }]
export function engineerUnavailable(engineer, iso) {
  const day = dayOf(iso);
  if (!day) return null;
  return (engineer?.unavailable || []).find((u) => u?.from && day >= u.from && day <= (u.to || u.from)) || null;
}

const jobEngineers = (job) => {
  const ids = new Set();
  if (job.engineerId && job.engineerId !== "unassigned") ids.add(job.engineerId);
  for (const l of job.lineItems || []) if (l.engineerId && l.engineerId !== "unassigned") ids.add(l.engineerId);
  for (const v of job.visits || []) if (v.engineerId && v.engineerId !== "unassigned") ids.add(v.engineerId);
  return ids;
};

// ── Who should do this job? ─────────────────────────────────────────────
// Ranked on what actually decides it: do they cover every service on the
// job, do they work that part of town, are they already nearby that day,
// and how full is their day. Returns the best few with the reasons in
// words, so the suggestion can be checked rather than trusted.
export function rankEngineers(job, { engineers = [], jobs = [], property } = {}) {
  const codes = getJobLines(job).filter((l) => !isAddonCode(l.code) && !l.cancelled).map((l) => l.code);
  if (!codes.length) return [];
  const pc = property?.postcode || "";
  const day = dayOf(job.scheduledAt);
  const out = [];
  for (const e of engineers) {
    if (!e?.id || e.id === "unassigned" || e.active === false || e.availability === "unavailable") continue;
    const covers = Array.isArray(e.services) && e.services.length ? codes.filter((c) => e.services.includes(c)) : [];
    if (Array.isArray(e.services) && e.services.length && !covers.length) continue;
    const reasons = [];
    let score = 0;
    if (covers.length === codes.length) { score += 40; reasons.push(codes.length > 1 ? "covers every service" : "covers this service"); }
    else if (covers.length) { score += 15; reasons.push(`covers ${covers.length} of ${codes.length} services`); }
    else reasons.push("services not set on their profile");

    const areas = String(e.areas || "").toUpperCase();
    if (pc && outward(pc) && new RegExp(`\\b${outward(pc)}\\b`).test(areas)) { score += 25; reasons.push(`works ${outward(pc)}`); }
    else if (pc && area(pc) && (new RegExp(`\\b${area(pc)}\\d*\\b`).test(areas) || area(e.postcode) === area(pc))) { score += 12; reasons.push(`works ${area(pc)}`); }

    if (day) {
      const off = engineerUnavailable(e, job.scheduledAt);
      if (off) { score -= 100; reasons.push("off that day"); }
      const sameDay = jobs.filter((j) => j.id !== job.id && !["cancelled"].includes(j.status) && dayOf(j.scheduledAt) === day && jobEngineers(j).has(e.id));
      if (sameDay.length) {
        score -= sameDay.length * 4;
        reasons.push(`${sameDay.length} other job${sameDay.length === 1 ? "" : "s"} that day`);
      } else if (!off) reasons.push("free that day");
    }
    out.push({ engineer: e, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ── Other open work at the same postcode ────────────────────────────────
// Two flats in one block booked on different days is two trips for one.
export function samePostcodeJobs(job, { jobs = [], clients = [] } = {}) {
  const props = new Map();
  for (const c of clients) for (const p of c.properties || []) props.set(p.id, p);
  const mine = props.get(job.propertyId)?.postcode;
  if (!mine) return [];
  const key = String(mine).replace(/\s/g, "").toUpperCase();
  return jobs.filter((j) => {
    if (j.id === job.id || !["quote", "scheduled"].includes(j.status)) return false;
    const pc = props.get(j.propertyId)?.postcode;
    return pc && String(pc).replace(/\s/g, "").toUpperCase() === key;
  });
}

// ── A sensible order for one engineer's day ─────────────────────────────
// `points` = [{ id, lat, lng }]. Nearest-neighbour from the first booking:
// not the shortest possible route, but it stops the obvious zig-zag.
export function routeOrder(points) {
  const left = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (left.length < 2) return left.map((p) => p.id);
  const order = [left.shift()];
  while (left.length) {
    const last = order[order.length - 1];
    let best = 0, bestD = Infinity;
    left.forEach((p, i) => {
      const d = (p.lat - last.lat) ** 2 + ((p.lng - last.lng) * Math.cos((last.lat * Math.PI) / 180)) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    order.push(left.splice(best, 1)[0]);
  }
  return order.map((p) => p.id);
}
