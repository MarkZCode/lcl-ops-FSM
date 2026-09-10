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

// "pending" = drafted but not actually booked yet (no engineer, no date, or
// both). Every visit used to default straight to "scheduled" the moment it
// was created, so a freshly-split job with two blank visits already claimed
// to be fully scheduled — the job list, the dispatch board and the job's own
// status all reported "Scheduled" while one half of the work had no engineer
// and no date. `pending` gives an honest state for that in-between.
export const VISIT_STATUSES = [
  { key: "pending",     label: "Not yet scheduled", pill: "pill-neutral" },
  { key: "scheduled",   label: "Scheduled",   pill: "pill-blue" },
  { key: "in_progress", label: "In progress", pill: "pill-amber" },
  { key: "completed",   label: "Completed",   pill: "pill-green" },
  { key: "cancelled",   label: "Cancelled",   pill: "pill-rose" },
];

// A visit only counts as actually booked once it has BOTH a real engineer
// and a date — either alone left the old code treating "date, no engineer"
// or "engineer, no date" as good enough to call the whole job Scheduled.
export function isVisitBooked(v) {
  return !!(v?.engineerId && v.engineerId !== "unassigned" && v?.scheduledAt);
}

// Test if a single visit is genuinely an UPCOMING active scheduled appointment.
// Must NOT be completed, MUST NOT be cancelled, MUST have an assigned engineer,
// MUST have a scheduled date, and MUST be scheduled for future or today if job is invoiced/paid.
export function isUpcomingScheduledVisit(job, v) {
  if (!v || !job || job.status === "cancelled") return false;
  if (v.status === "completed" || v.status === "cancelled") return false;
  if (!v.engineerId || v.engineerId === "unassigned") return false;
  if (!v.scheduledAt) return false;
  if (v.status !== "scheduled" && v.status !== "in_progress") return false;

  // For jobs that are invoiced or paid, the visit date MUST be today or in the future
  if (["invoiced", "paid", "completed"].includes(job.status)) {
    const visitDate = new Date(v.scheduledAt);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (visitDate < todayStart) return false;
  }
  return true;
}

// Find the active upcoming scheduled visit on a job, if any.
export function getUpcomingScheduledVisit(job) {
  if (!job || job.status === "cancelled") return null;
  const visits = Array.isArray(job.visits) ? job.visits : [];
  return visits.find((v) => isUpcomingScheduledVisit(job, v)) || null;
}

// Check if a job has ANY active upcoming scheduled visit.
export function hasUpcomingScheduledVisit(job) {
  return !!getUpcomingScheduledVisit(job);
}

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
      // Inspection-only / certifier live on the JOB for an unsplit job, and on
      // the visit once it's been split. Mirroring them onto the synthetic
      // visit means visitScopeForEngineer and certifierLegs work identically
      // either way -- otherwise the whole feature only existed for
      // multi-service jobs, and a plain single-service EICR (the commonest
      // case for "he inspected, someone else signed it") had nowhere to say so.
      scope: job.scope || "full",
      certifierId: job.certifierId || "",
      certifierFee: job.certifierFee ?? "",
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

// Did this engineer do the FULL job, or only the inspection?
//
// Recorded per visit (`scope`), because a job can genuinely be half and half:
// Rizwan inspects the EICR while somebody else signs the certificate, and on
// the same job he does the CP12 start to finish. Returns "inspection" only
// when EVERY live visit of theirs is inspection-only — if any part of their
// work included issuing a certificate they're on the full rate, which errs
// towards paying them more rather than less.
export function visitScopeForEngineer(job, engineerId) {
  const mine = getVisits(job).filter(
    (v) => v.status !== "cancelled" && visitEngineerId(job, v) === engineerId
  );
  if (!mine.length) return "full";
  return mine.every((v) => v.scope === "inspection") ? "inspection" : "full";
}

// The certifier legs on a job: visits where someone attended for the
// inspection and a DIFFERENT engineer issued the certificate. Each becomes a
// payable line for that certifier in the engineer-pay run.
export function certifierLegs(job) {
  return getVisits(job)
    .filter((v) => v.status !== "cancelled" && v.scope === "inspection" && v.certifierId)
    .map((v) => ({
      visitId: v.id,
      certifierId: v.certifierId,
      fee: Number(v.certifierFee) || 0,
      lineIds: v.lineIds || [],
      status: v.status,
      scheduledAt: v.scheduledAt,
    }));
}

// Every distinct engineer actually working this job, across all its live
// visits. job.engineerId alone isn't enough once a job is split across
// several engineers — syncJobFromVisits deliberately leaves job.engineerId
// as whatever it was before splitting rather than pick one of several names
// at random, which meant every card/list reading job.engineerId directly
// showed a single, often stale, engineer even on a job actually staffed by
// two different people (one per service/visit).
export function jobEngineerIds(job) {
  const visits = getVisits(job).filter((v) => v.status !== "cancelled");
  const ids = [...new Set(visits.map((v) => visitEngineerId(job, v)))];
  return ids.length ? ids : [job?.engineerId || "unassigned"];
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
// Once a booked appointment's start time has passed, the visit (and the job,
// once every visit agrees) moves itself from Scheduled to In progress —
// without anyone needing to remember to tap the button. Never invents
// progress that didn't happen: only a visit that is genuinely BOOKED
// (isVisitBooked — real engineer, real date) and whose time has actually
// arrived gets moved, and only out of "scheduled"/"pending". A visit already
// in_progress, completed or cancelled is untouched — this can only ever move
// a job FORWARD from a state where nothing had started yet.
//
// Returns the patch to apply via updateJob(), or null if nothing needs to
// change. Deliberately time-based only — it does not know or care whether the
// engineer actually arrived, which is exactly why the status can still be
// corrected by hand (Completed early, Cancelled, put back to Scheduled) at
// any point after this fires.
export function autoStartDueVisits(job, now = new Date()) {
  if (!job || ["invoiced", "paid", "cancelled"].includes(job.status)) return null;
  const nowMs = now.getTime();

  if (!isSplit(job)) {
    if (job.status !== "scheduled") return null;
    if (!job.scheduledAt || new Date(job.scheduledAt).getTime() > nowMs) return null;
    return { status: "in_progress" };
  }

  let changed = false;
  const nextVisits = job.visits.map((v) => {
    if (!["pending", "scheduled"].includes(v.status)) return v;
    if (!isVisitBooked(v) || new Date(v.scheduledAt).getTime() > nowMs) return v;
    changed = true;
    return { ...v, status: "in_progress" };
  });
  if (!changed) return null;
  const patched = { ...job, visits: nextVisits };
  return { visits: nextVisits, status: deriveJobStatus(patched) };
}

export function deriveJobStatus(job) {
  if (!isSplit(job)) return job?.status;
  // Billing facts, never re-derived from scheduling — re-deriving could walk
  // a paid job backwards, which must never happen.
  if (["invoiced", "paid"].includes(job.status)) return job.status;

  const visits = job.visits;
  const live = visits.filter((v) => v.status !== "cancelled");
  if (!live.length) return "cancelled";
  if (live.every((v) => v.status === "completed")) return "completed";
  if (live.some((v) => v.status === "in_progress")) return "in_progress";

  // Below this point every live visit is pending or (labelled) scheduled —
  // whether the job as a WHOLE gets to claim "Scheduled" depends on whether
  // every one of them is actually booked (real engineer + real date), not on
  // the per-visit label alone. This used to require only ONE visit booked to
  // leave Quote, so a two-visit job with a single engineer assigned already
  // read as fully "Scheduled" — the second, completely unstaffed visit was
  // invisible everywhere the job's own status is shown (list, board,
  // dispatch). It also used to be one-directional: once a job left Quote it
  // could never go back, even if every visit was explicitly cleared again.
  // Checking fresh, every time, fixes both: partial staffing stays Quote, and
  // clearing every visit's engineer/date genuinely reverts the job.
  const allBooked = live.every((v) => isVisitBooked(v));
  return allBooked ? "scheduled" : "quote";
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
  if (unassignedLines(job).length > 0) return false;
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
  const engineerId = patch.engineerId ?? job?.engineerId ?? "";
  const scheduledAt = patch.scheduledAt ?? job?.scheduledAt ?? null;
  return {
    id: newVisitId(),
    lineIds: [...lineIds],
    engineerId,
    scheduledAt,
    windowFrom: job?.windowFrom || "",
    windowTo: job?.windowTo || "",
    windowPart: job?.windowPart || "",
    // Only claim "scheduled" if this visit was actually seeded with a real
    // engineer AND a date. A blank/freshly-split visit is `pending` — it
    // hasn't been booked yet, even though the old hardcoded default said it had.
    status: isVisitBooked({ engineerId, scheduledAt }) ? "scheduled" : "pending",
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
  if (!live.length) {
    return {
      scheduledAt: null,
      windowFrom: "",
      windowTo: "",
      windowPart: "",
    };
  }
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
