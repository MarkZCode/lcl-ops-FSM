// ── VISITS (sub-jobs) ────────────────────────────────────────────────────
//
// A job is what the CLIENT buys: one quote, one invoice, one payment.
// A visit is what an ENGINEER attends: some of that job's service lines, on
// one date, in one time window, with its own outcome.
//
// A gas + EICR + FRA job might be three visits — different engineers, three
// different days — but it stays one job, one invoice, and it's only payable
// once every visit is done.
//
// LEGACY SAFETY — the single most important property of this module:
// a job with no `visits` array behaves exactly as it always has. getVisits()
// synthesises one implicit visit from the job's own engineer/date, so every
// existing job (and every caller) keeps working untouched. Nothing writes a
// `visits` array until someone actually splits a job.
import { getJobLines, isAddonCode } from "./format";

export const VISIT_STATUSES = [
  { key: "scheduled",   label: "Scheduled",   pill: "pill-blue" },
  { key: "in_progress", label: "In progress", pill: "pill-amber" },
  { key: "completed",   label: "Completed",   pill: "pill-green" },
  { key: "cancelled",   label: "Cancelled",   pill: "pill-rose" },
];

// Outcome of a completed visit. Drives whether remedial work is needed —
// deliberately separate from status: a visit can be Completed and still FAIL.
export const VISIT_OUTCOMES = [
  { key: "pass",     label: "Pass" },
  { key: "advisory", label: "Advisory" },
  { key: "fail",     label: "Fail — remedial needed" },
];

export function newVisitId() {
  return "vis-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// True when this job has been genuinely split into multiple visits.
export function isSplit(job) {
  return Array.isArray(job?.visits) && job.visits.length > 0;
}

// Every visit on a job, ALWAYS as an array of at least one.
// Unsplit jobs get one synthetic visit mirroring the job's own fields, so
// callers can treat every job identically without special-casing.
export function getVisits(job) {
  if (!job) return [];
  const lines = getJobLines(job);
  if (!isSplit(job)) {
    return [{
      id: "__job__",
      synthetic: true,
      lineIds: lines.map((l) => l.id),
      engineerId: job.engineerId || "unassigned",
      scheduledAt: job.scheduledAt || null,
      windowFrom: job.windowFrom || "",
      windowTo: job.windowTo || "",
      windowPart: job.windowPart || "",
      status: job.status === "completed" || job.status === "invoiced" || job.status === "paid"
        ? "completed"
        : job.status === "cancelled" ? "cancelled"
        : job.status === "in_progress" ? "in_progress"
        : "scheduled",
      outcome: job.outcome || null,
      notes: "",
    }];
  }
  return job.visits;
}

// Every non-addon line on the job. Parking and congestion are CHARGES, never
// work — nobody attends a parking charge — so they're excluded from visits
// entirely and stay attached to the job as a whole.
export function schedulableLines(job) {
  return getJobLines(job).filter((l) => !isAddonCode(l.code));
}

// The service lines a given visit covers.
//
// An empty visit returns NOTHING. It used to fall back to every line on the
// job, which meant a freshly-added visit silently displayed the entire job's
// services and full value — two visits both reading £236.99 for one £236.99
// job. An empty visit is empty.
//
// The synthetic visit for an unsplit job is the exception: it legitimately
// covers everything, including addons, which is what the old behaviour was
// really for.
export function visitLines(job, visit) {
  const lines = getJobLines(job);
  if (visit?.synthetic) return lines;
  if (!visit?.lineIds?.length) return [];
  const want = new Set(visit.lineIds);
  return lines.filter((l) => want.has(l.id));
}

// Effective engineer for a visit — its own, else the job's.
export function visitEngineerId(job, visit) {
  return visit?.engineerId || job?.engineerId || "unassigned";
}

// Lines on the job that no visit has claimed yet. Surfaced in the UI so work
// can't be silently left unscheduled when a job is split.
export function unassignedLines(job) {
  if (!isSplit(job)) return [];
  const claimed = new Set(job.visits.flatMap((v) => v.lineIds || []));
  // Addons are never scheduled, so they can never be "unassigned".
  return schedulableLines(job).filter((l) => !claimed.has(l.id));
}

// What the JOB's status should be, given its visits.
//
// Deliberately does NOT override the money statuses. Once a job is invoiced
// or paid that's a billing fact, not a scheduling one — re-deriving it from
// visits could walk a paid job backwards, which must never happen.
export function deriveJobStatus(job) {
  if (!isSplit(job)) return job?.status;
  // Billing facts, never re-derived from scheduling — re-deriving could walk
  // a paid job backwards, which must never happen.
  if (["invoiced", "paid"].includes(job.status)) return job.status;

  const visits = job.visits;

  // A QUOTE is a pre-sale state, so it doesn't move just because visits were
  // drafted — but it MUST move once one of them is actually booked in. Giving
  // a visit a date and an engineer is the act of scheduling the job; leaving
  // it sitting under "Quote" in the pipeline (with the board showing 0
  // scheduled) was the quote freeze being applied too broadly.
  if (job.status === "quote") {
    const booked = visits.some((v) => v.status !== "cancelled" && v.scheduledAt);
    if (!booked) return job.status;
  }
  const live = visits.filter((v) => v.status !== "cancelled");
  if (!live.length) return "cancelled";
  if (live.every((v) => v.status === "completed")) return "completed";
  if (live.some((v) => v.status === "in_progress" || v.status === "completed")) return "in_progress";
  return "scheduled";
}

// Progress for a split job — "2 of 3 visits done".
export function visitProgress(job) {
  const visits = getVisits(job).filter((v) => v.status !== "cancelled");
  const done = visits.filter((v) => v.status === "completed").length;
  return { done, total: visits.length, allDone: visits.length > 0 && done === visits.length };
}

// Can this job be invoiced yet? A split job isn't billable until every visit
// is finished — invoicing after only the gas half is done is exactly the
// mistake this whole model exists to prevent.
export function readyToInvoice(job) {
  if (!isSplit(job)) return true;
  return visitProgress(job).allDone;
}

// Flatten jobs into one dispatch entry PER VISIT, so a three-visit job shows
// up under three engineers on three dates instead of collapsing into one card.
// Shape intentionally mirrors a job so existing dispatch/calendar rendering
// needs minimal changes.
export function visitEntries(jobs = []) {
  const out = [];
  for (const job of jobs) {
    for (const v of getVisits(job)) {
      out.push({
        key: `${job.id}:${v.id}`,
        job,
        visit: v,
        jobId: job.id,
        visitId: v.id,
        synthetic: !!v.synthetic,
        engineerId: visitEngineerId(job, v),
        scheduledAt: v.scheduledAt || job.scheduledAt || null,
        windowFrom: v.windowFrom || job.windowFrom || "",
        windowTo: v.windowTo || job.windowTo || "",
        windowPart: v.windowPart || job.windowPart || "",
        status: v.status,
        lines: visitLines(job, v),
      });
    }
  }
  return out;
}

// Build a visit covering the given lines. Seeds date/engineer from the job so
// splitting an already-scheduled job doesn't wipe what was already arranged.
export function makeVisit(job, lineIds, patch = {}) {
  return {
    id: newVisitId(),
    lineIds: [...lineIds],
    engineerId: job?.engineerId || "",
    scheduledAt: job?.scheduledAt || null,
    windowFrom: job?.windowFrom || "",
    windowTo: job?.windowTo || "",
    windowPart: job?.windowPart || "",
    status: "scheduled",
    outcome: null,
    notes: "",
    ...patch,
  };
}

// Split a job into one visit per engineer already named on its lines — the
// natural starting point, since per-line engineers are usually set first.
// Lines with no engineer group together under the job's own engineer.
export function autoSplitByEngineer(job) {
  const lines = schedulableLines(job);
  const groups = new Map();
  for (const l of lines) {
    const eng = l.engineerId || job?.engineerId || "unassigned";
    if (!groups.has(eng)) groups.set(eng, []);
    groups.get(eng).push(l.id);
  }
  return [...groups.entries()].map(([engineerId, lineIds]) =>
    makeVisit(job, lineIds, { engineerId: engineerId === "unassigned" ? "" : engineerId })
  );
}

// One visit per service — the common case when every certificate needs a
// different trade on a different day. Addons are excluded automatically.
export function splitPerService(job) {
  return schedulableLines(job).map((l) =>
    makeVisit(job, [l.id], { engineerId: l.engineerId || job?.engineerId || "" })
  );
}

// Move a line onto one visit and off every other. A service is done once, by
// one engineer, on one day — letting it sit on two visits at the same time is
// never meaningful and quietly double-counts the job's value.
export function assignLineToVisit(visits, lineId, visitId) {
  return visits.map((v) => {
    const without = (v.lineIds || []).filter((id) => id !== lineId);
    return v.id === visitId ? { ...v, lineIds: [...without, lineId] } : { ...v, lineIds: without };
  });
}

// The engineer actually responsible for a service line.
//
// Resolution order matters and is the whole reason this lives in one place:
//   1. the line's own engineerId  — an explicit per-service override
//   2. the engineer on the VISIT that covers the line — how a split job is
//      normally arranged (you assign the visit, not each line)
//   3. the job's engineer          — an unsplit, single-engineer job
//
// Step 2 used to be missing everywhere, which is why a split job's money
// still read as one "unassigned" engineer on 40%: the visits knew who was
// doing what, and nothing that calculated pay ever asked them.
export function lineEngineerId(job, line) {
  if (line?.engineerId) return line.engineerId;
  if (isSplit(job)) {
    const v = job.visits.find((x) => (x.lineIds || []).includes(line?.id));
    if (v?.engineerId) return v.engineerId;
  }
  return job?.engineerId || "unassigned";
}

// Group a job's lines by the engineer responsible for them. Addons (parking,
// congestion) are charges on the JOB, not anyone's work, so they're excluded —
// they're reconciled separately against the job's own engineer.
export function linesByEngineer(job) {
  const groups = new Map();
  for (const l of schedulableLines(job)) {
    const id = lineEngineerId(job, l);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(l);
  }
  return groups;
}

// The visit an engineer (or a single line) is attending, when there is exactly
// one — so a per-engineer job card can show THEIR date and window instead of
// the job's. Returns null when it's ambiguous (several visits, or unsplit).
export function visitForScope(job, { engineerId, lineId } = {}) {
  if (!isSplit(job)) return null;
  if (lineId) return job.visits.find((v) => (v.lineIds || []).includes(lineId)) || null;
  if (!engineerId) return null;
  const mine = job.visits.filter((v) => (v.engineerId || job.engineerId || "unassigned") === engineerId);
  return mine.length === 1 ? mine[0] : null;
}

// Keep the JOB's own appointment fields in step with its visits.
//
// The job-level scheduledAt/engineerId are what the jobs list, the funnel
// board, the calendar and the dashboard all read. On a split job nothing was
// writing them, so a fully-booked three-visit job still rendered with no date
// and "Unassigned" everywhere outside this panel. The job takes its date from
// its EARLIEST live visit — the day work actually starts — and its engineer
// from that same visit when only one person is involved.
export function syncJobFromVisits(job, visits) {
  const live = (visits || []).filter((v) => v.status !== "cancelled" && v.scheduledAt);
  if (!live.length) return {};
  const first = [...live].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
  )[0];

  const engineerIds = [
    ...new Set(live.map((v) => v.engineerId).filter(Boolean)),
  ];

  return {
    scheduledAt: first.scheduledAt,
    windowFrom: first.windowFrom || "",
    windowTo: first.windowTo || "",
    windowPart: first.windowPart || "",
    // One engineer across every visit → that's the job's engineer. Several →
    // the job genuinely has no single engineer, and claiming one of them
    // would be picking a name at random.
    engineerId: engineerIds.length === 1 ? engineerIds[0] : (job?.engineerId || ""),
  };
}
