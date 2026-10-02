// What an engineer's record adds up to: reliability, where they have
// actually worked, and the qualifications on file. Pure.
import { jobEngineerIds } from "./visits";

export const QUALIFICATIONS = [
  "Gas Safe registered", "ACS (domestic gas)", "Commercial gas", "NICEIC", "NAPIT", "18th Edition",
  "Inspection & testing (2391)", "Domestic Energy Assessor (EPC)", "Fire risk assessor", "PAT testing", "Asbestos (P402)", "DBS checked",
];

const DONE = new Set(["completed", "invoiced", "paid"]);

// How dependable they've been, from what's recorded: offers accepted vs
// turned down or dropped, and no-access visits on their jobs. Null until
// there's something to go on.
export function reliability(engineer, jobs = []) {
  let accepted = 0, declined = 0, cancelled = 0, done = 0, noAccess = 0;
  for (const j of jobs) {
    for (const o of j.offerLog || []) {
      if (o.engineerId !== engineer.id) continue;
      if (o.status === "accepted") accepted++;
      else if (o.status === "declined") declined++;
      else if (o.status === "cancelled") cancelled++;
    }
    if (jobEngineerIds(j).includes(engineer.id)) {
      if (DONE.has(j.status)) done++;
      noAccess += Number(j.noAccessCount) || 0;
    }
  }
  const asked = accepted + declined + cancelled;
  // Pulling out after saying yes costs more than saying no up front.
  const score = asked ? Math.max(0, Math.round(((accepted - cancelled) / asked) * 100)) : null;
  return { accepted, declined, cancelled, done, noAccess, asked, score };
}

// Postcode districts this engineer has actually done work in, most first.
export function workedAreas(engineer, jobs = [], clients = []) {
  const props = new Map();
  for (const c of clients) for (const p of c.properties || []) props.set(p.id, p);
  const count = new Map();
  for (const j of jobs) {
    if (!DONE.has(j.status) || !jobEngineerIds(j).includes(engineer.id)) continue;
    const pc = String(props.get(j.propertyId)?.postcode || "").toUpperCase().replace(/\s+/g, "");
    if (pc.length < 5) continue;
    const d = pc.slice(0, -3);
    count.set(d, (count.get(d) || 0) + 1);
  }
  return [...count.entries()].map(([district, n]) => ({ district, n })).sort((a, b) => b.n - a.n);
}

// One line describing a pay set-up, for the rate history.
export function rateSummary(e) {
  if (e.payType === "weekly") return `£${Number(e.weeklyRate) || 0} a week`;
  if (e.payType === "per_job") return `${e.cutPercent ?? 40}% of the job`;
  const n = Object.keys(e.serviceRates || {}).length;
  return `${e.payType === "fixed_gas" ? "Fixed gas rates" : "Fixed rate per service"} (${n} service${n === 1 ? "" : "s"} priced)`;
}
export const rateFingerprint = (e) => JSON.stringify([e.payType, e.cutPercent, e.weeklyRate, e.gasBaseRate, e.gasExtraRate, e.serviceRates, e.inspectionRates, e.circuitRate, e.pointRate, !!e.vatRegistered]);
