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
import { getJobLines, isAddonCode, serviceShort, isLineCancelled } from "./format";
import { ukDateTimeToUtcIso } from "./ukTime";

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

// Has the engineer actually CONFIRMED they're doing this leg?
//
// Booked (isVisitBooked) only means the office has written an engineer and a
// date against it — that's an offer, not an agreement. A job whose legs are
// all still "Not yet scheduled" was showing as Scheduled on the board, which
// is how a Friday morning arrives with nobody having said yes.
//
// `engineerConfirmedAt` is the explicit record of that confirmation. A visit
// that has already moved past pending under its own steam (scheduled,
// in_progress, completed) counts as confirmed too — otherwise turning this
// on would drag every correctly-booked job in the system back to Quote.
export function isVisitConfirmed(v) {
  if (!isVisitBooked(v)) return false;
  if (v?.engineerConfirmedAt) return true;
  return ["scheduled", "in_progress", "completed"].includes(v?.status);
}

// Which parts of a job are not yet ready to be called Scheduled, in words
// the office can act on — "EICR (Res): no engineer assigned", "Gas Safety:
// PRIME ELECTRICS hasn't confirmed yet".
export function blockersForScheduling(job, engineerName = (id) => id) {
  if (!job) return [];
  const out = [];
  const label = (lines) =>
    lines.map((l) => (l.code === "CUSTOM" ? l.name : serviceShort(l.code))).join(", ");

  if (!isSplit(job)) {
    const lines = schedulableLines(job);
    if (!lines.length) return ["This job has no services on it yet."];
    const eid = job.engineerId;
    if (!eid || eid === "unassigned") return [`${label(lines)}: no engineer assigned`];
    if (!job.scheduledAt) return [`${label(lines)}: no appointment date`];
    // Same rule as a split job's legs: an engineer and a date is an offer
    // until the engineer says yes. Unsplit jobs used to skip this entirely,
    // so the one-service job — the commonest kind — could be Scheduled with
    // nobody having agreed to go.
    if (!job.engineerConfirmed) return [`${label(lines)}: ${engineerName(eid)} hasn't confirmed yet`];
    return [];
  }

  const live = (job.visits || []).filter((v) => isVisitLive(job, v));
  for (const l of unassignedLines(job)) {
    out.push(`${label([l])}: not on any visit`);
  }
  for (const v of live) {
    const lines = visitLines(job, v).filter((l) => !isAddonCode(l.code) && !isLineCancelled(l));
    const what = lines.length ? label(lines) : "This visit";
    if (!v.engineerId || v.engineerId === "unassigned") out.push(`${what}: no engineer assigned`);
    else if (!v.scheduledAt) out.push(`${what}: no appointment date`);
    else if (!isVisitConfirmed(v)) out.push(`${what}: ${engineerName(v.engineerId)} hasn't confirmed yet`);
  }
  return out;
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
  return getJobLines(job).filter((l) => !isAddonCode(l.code) && !isLineCancelled(l));
}

// Is this visit still real work?
//
// Cancelled outright, or every service on it has been cancelled (the EICR on
// visit 2 had no access and was called off) → it's history, not work. It
// must stop counting everywhere a job asks "what's left to do": scheduling
// blockers, confirmation, completion and the job's own status. An EMPTY
// visit (just added, no services picked yet) is still live — it's an
// unfinished booking, and hiding it would let the job claim Scheduled.
export function isVisitLive(job, v) {
  if (!v || v.status === "cancelled") return false;
  if (v.synthetic) return true;
  const lines = visitLines(job, v).filter((l) => !isAddonCode(l.code));
  if (!lines.length) return true;
  return lines.some((l) => !isLineCancelled(l));
}

// When every service on a job has been cancelled, is anything still owed?
// A no-access EICR charged in full still has to be invoiced — that job is finished (Completed, ready to bill), not Cancelled,
// or the charge silently drops out of the pipeline.
export function hasChargeableCancellation(job) {
  return getJobLines(job).some(
    (l) => isLineCancelled(l) && !l.waived
  );
}

// Every real service on the job cancelled?
export function allServicesCancelled(job) {
  const real = getJobLines(job).filter((l) => !isAddonCode(l.code));
  return real.length > 0 && real.every(isLineCancelled);
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

// What the certification arrangement currently IS for one engineer on one
// job — read back in the same shape certificationPatch() writes it, so a
// screen can show the current state without caring whether the job is split
// (per-visit fields) or unsplit (the job's own fields).
export function certificationForEngineer(job, engineerId) {
  const mine = getVisits(job).filter(
    (v) => v.status !== "cancelled" && visitEngineerId(job, v) === engineerId
  );
  const first = mine[0];
  return {
    inspectionOnly: visitScopeForEngineer(job, engineerId) === "inspection",
    certifierId: first?.certifierId || "",
    certifierFee: first?.certifierFee ?? "",
  };
}

// Set who inspected vs who certified, for ONE engineer's work on a job.
//
// Returns a patch for updateJob() rather than writing itself, so the same
// decision can be made from wherever it's actually being made — the job's
// own Certification panel, or the Engineer pay run at the moment you're
// deciding what to pay someone. Both call this; neither owns a second copy
// of the rules.
//
// Unsplit jobs carry the arrangement on the job itself (getVisits mirrors it
// onto the synthetic visit); split jobs carry it per visit, and only the
// visits THIS engineer is on are touched — a job where one engineer
// inspects an EICR and another does a CP12 start-to-finish stays half and
// half, which is the case visitScopeForEngineer exists to handle.
// `certifierFee` is the TOTAL for this engineer's work on this job, not a
// per-visit figure. certifierLegs() emits one payable leg per visit and sums
// them, so writing the same number onto each of an engineer's three visits
// would quietly pay the certifier triple what was typed into a job-level
// box. The total is therefore banked on their first live visit and the rest
// zeroed, which sums back to exactly the figure entered.
export function certificationPatch(job, engineerId, { inspectionOnly, certifierId, certifierFee } = {}) {
  const apply = (current, fee) => {
    if (!inspectionOnly) return { scope: "full", certifierId: "", certifierFee: "" };
    return {
      scope: "inspection",
      certifierId: certifierId !== undefined ? certifierId : (current.certifierId || ""),
      certifierFee: fee,
    };
  };

  const total = certifierFee !== undefined ? certifierFee : undefined;

  if (!isSplit(job)) {
    return apply(job, total !== undefined ? total : (job.certifierFee ?? ""));
  }

  let seen = 0;
  return {
    visits: job.visits.map((v) => {
      if (visitEngineerId(job, v) !== engineerId || v.status === "cancelled") return v;
      const isFirst = seen++ === 0;
      const fee = total !== undefined
        ? (isFirst ? total : 0)
        : (isFirst ? (v.certifierFee ?? "") : 0);
      return { ...v, ...apply(v, fee) };
    }),
  };
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
// The actual due instant for a scheduled entity. Prefers recomputing from
// windowFrom (the UK arrival-window time the office actually agreed with the
// client) rather than trusting the stored scheduledAt outright — scheduledAt
// can be stale/drifted (e.g. set from a device in a different timezone, or
// windowFrom edited without scheduledAt following) even after the write-side
// fix, for any row saved before that fix shipped. Falls back to scheduledAt
// when there's no windowFrom to recompute from.
function dueInstant(entity) {
  if (!entity?.scheduledAt) return null;
  if (entity.windowFrom) {
    const day = new Date(entity.scheduledAt).toISOString().slice(0, 10);
    return new Date(ukDateTimeToUtcIso(day, entity.windowFrom));
  }
  return new Date(entity.scheduledAt);
}

// Forward-only time sweep (the in-app timer and the server cron). Runs the
// same reconcileJob rules as every edit, so a job can't be moved one way by
// the sweep and another way by the next click.
export function autoStartDueVisits(job, now = new Date()) {
  if (!job || ["invoiced", "paid", "cancelled", "quote"].includes(job.status)) return null;
  const r = reconcileJob(job, job, {}, now);
  const visitsChanged = isSplit(job) && JSON.stringify(r.visits) !== JSON.stringify(job.visits);
  // Only ever forwards: the sweep must never move anything back.
  const RANK = { scheduled: 1, in_progress: 2, completed: 3 };
  const forward = r.status !== job.status && (RANK[r.status] || 0) > (RANK[job.status] || 0);
  if (!forward && !visitsChanged) return null;
  const patch = {};
  if (visitsChanged) patch.visits = r.visits;
  if (forward) patch.status = r.status;
  return patch;
}

export function deriveJobStatus(job, prevStatus = job?.status) {
  if (!isSplit(job)) return job?.status;
  // Billing facts, never re-derived from scheduling — re-deriving could walk
  // a paid job backwards, which must never happen.
  if (["invoiced", "paid"].includes(job.status)) return job.status;

  const visits = job.visits;
  const live = visits.filter((v) => isVisitLive(job, v));
  // Nothing left to do. If something is still chargeable (a no-access
  // service billed anyway) the job is finished and
  // must reach an invoice; otherwise it genuinely didn't happen.
  if (!live.length) return hasChargeableCancellation(job) ? "completed" : "cancelled";
  if (live.every((v) => v.status === "completed")) return "completed";
  if (live.some((v) => v.status === "in_progress")) return "in_progress";
  // Part done, part still to come — the gas was done Monday, the EICR is
  // rebooked for Thursday. That job is IN PROGRESS. It used to fall through
  // to the confirmation check below and, the moment the EICR's date moved,
  // land back on "Quote": a job with a finished certificate on it, filed as
  // an unaccepted quote.
  if (live.some((v) => v.status === "completed")) return "in_progress";

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
  // Booked is not enough — every leg must be CONFIRMED. Two visits with an
  // engineer and a date against them but both still sitting on "Not yet
  // scheduled" made the job read Scheduled on the board while neither
  // engineer had agreed to anything (seen on JOB-7692). The job's own
  // status now cannot claim more than its legs do.
  const allConfirmed = live.every((v) => isVisitConfirmed(v));
  if (allConfirmed) return "scheduled";
  // Not every leg is confirmed. For a job that has never been booked that
  // means it's still a Quote (JOB-7692's rule). But a job the client has
  // already accepted and that was already Scheduled or under way does NOT
  // become a quote again because one leg was moved or an engineer swapped —
  // the client's acceptance didn't un-happen. It stays Scheduled; the
  // unconfirmed leg is flagged on the job (see blockersForScheduling) until
  // someone confirms it.
  // Only a job that has actually BEEN Scheduled (or further) keeps that.
  // The client accepting the quote is not the same thing — an accepted job
  // with an unconfirmed leg is still being booked, and stays Quote with
  // "Accepted" shown beside it.
  const wasBooked = ["scheduled", "in_progress", "completed"].includes(prevStatus);
  return wasBooked ? "scheduled" : "quote";
}

// ── THE ONE PLACE A JOB'S STATUS IS RECONCILED ──────────────────────────
//
// Every write to a job goes through this (lib/store.js updateJob), whoever
// made it: the status buttons, the Visits panel, Reschedule, the Edit modal,
// the auto-start sweep, cancelling a service. Status bugs came from each of
// those paths applying its own half of the rules — one derived from visits,
// another forced a label, a third only ran every five minutes — so the same
// job could land in different states depending on which button was used.
//
// Rules, in order:
//   1. Money statuses (Invoiced / Paid) are never moved by anything here.
//   2. An explicit status the user picked is respected — except that a job
//      can't leave Quote for Scheduled/In progress with nobody or no date on
//      it, and "Completed" on a split job closes its outstanding visits so
//      the two can't disagree.
//   3. Time: a booked visit whose start has arrived is In progress; one that
//      is RESCHEDULED to a future time while In progress goes back to
//      Scheduled (it hasn't started — it's been moved).
//   4. A split job's status is derived from its visits (deriveJobStatus).
//   5. A job whose every service has been cancelled is Cancelled — or
//      Completed if something on it is still chargeable.
//
// Pure: returns the corrected job; never writes.
// `engineerConfirmed` is what the overnight chase-up jobs read (they only
// see the stored row). On a split job it is DERIVED from the visits, so the
// Visits panel, the job card and the crons can never disagree about it.
function withConfirmFlag(job) {
  const live = (job.visits || []).filter((v) => isVisitLive(job, v));
  const all = live.length > 0 && live.every(isVisitConfirmed);
  return { ...job, engineerConfirmed: all };
}

export function reconcileJob(prev, next, patch = {}, now = new Date()) {
  if (!next) return next;
  if (["invoiced", "paid"].includes(next.status)) return next;
  const nowMs = now.getTime();
  // "Explicit" means someone CHANGED the status in this write. The Edit
  // modal re-sends the current status with every save; treating that as a
  // deliberate choice would push it back down onto the visits each time.
  const explicit =
    Object.prototype.hasOwnProperty.call(patch, "status") && patch.status !== prev?.status;
  const out = { ...next };

  // Explicit "Cancelled" on the whole job is final for this write — and a
  // job someone cancelled stays cancelled through later edits (a note, a
  // visit tweak). Only a change to its SERVICES (restoring one) reopens it.
  if (explicit && out.status === "cancelled") return out;
  if (!explicit && prev?.status === "cancelled" && !Object.prototype.hasOwnProperty.call(patch, "lineItems")) {
    return out;
  }

  const moved = (a, b) =>
    !!a && !!b && ((a.scheduledAt || null) !== (b.scheduledAt || null) ||
      (a.windowFrom || "") !== (b.windowFrom || ""));

  if (isSplit(out)) {
    const prevVisits = new Map((isSplit(prev) ? prev.visits : []).map((v) => [v.id, v]));
    let visits = out.visits.map((v) => {
      if (!isVisitLive(out, v)) return v;
      const was = prevVisits.get(v.id);
      const due = dueInstant(v);
      // Rule 3, backwards: an in-progress visit moved to a future time
      // hasn't started — it's been rescheduled. It was under way, so it had
      // been confirmed; it goes back to Scheduled, not Pending.
      if (v.status === "in_progress" && moved(was, v) && due && due.getTime() > nowMs) {
        return { ...v, status: "scheduled" };
      }
      // Rule 3, forwards: a CONFIRMED visit whose start has arrived. An
      // unconfirmed one isn't moved — nobody agreed to be there, so
      // claiming the work has started would be invented.
      if (!explicit && ["pending", "scheduled"].includes(v.status) && isVisitConfirmed(v) && due && due.getTime() <= nowMs) {
        return { ...v, status: "in_progress" };
      }
      return v;
    });

    if (!explicit) {
      out.visits = visits;
      const was = prev?.status ?? out.status;
      out.status = deriveJobStatus({ ...out, status: was }, was);
      return withConfirmFlag(out);
    }

    // Rule 2 — an explicit job status is pushed DOWN onto the visits, so the
    // job and its visits agree and the next visit edit can't flip it back.
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const open = (v) => isVisitLive(out, v) && v.status !== "completed";
    if (out.status === "completed") {
      visits = visits.map((v) => (open(v) ? { ...v, status: "completed" } : v));
    } else if (out.status === "in_progress") {
      // The visits that are actually on or before today are the ones under
      // way; if none are (started early), the earliest outstanding one is.
      let touched = false;
      visits = visits.map((v) => {
        if (!open(v) || v.status === "in_progress") return v;
        const d = v.scheduledAt ? new Date(v.scheduledAt) : null;
        if (isVisitBooked(v) && d && d <= endOfToday) { touched = true; return { ...v, status: "in_progress" }; }
        return v;
      });
      if (!touched && !visits.some((v) => open(v) && v.status === "in_progress")) {
        const first = visits
          .filter(open)
          .sort((a, b) => new Date(a.scheduledAt || 8.64e15) - new Date(b.scheduledAt || 8.64e15))[0];
        if (first) visits = visits.map((v) => (v.id === first.id ? { ...v, status: "in_progress" } : v));
      }
    } else if (out.status === "scheduled") {
      // "Engineer didn't turn up — put it back to Scheduled."
      visits = visits.map((v) => (open(v) && v.status === "in_progress" ? { ...v, status: "scheduled" } : v));
    }
    out.visits = visits;
    if (["scheduled", "in_progress"].includes(out.status)) {
      out.status = deriveJobStatus(out, out.status);
    }
    return withConfirmFlag(out);
  }

  // A different engineer on a single-appointment job hasn't agreed to
  // anything yet — the previous engineer's yes doesn't transfer.
  if (prev && (prev.engineerId || "") !== (out.engineerId || "") && !isSplit(prev)) {
    out.engineerConfirmed = false;
    out.confirmedAt = null;
    out.cardConfirmations = {};
  }

  // ── Unsplit job ──
  // Rule 5 for a single-appointment job.
  if (Object.prototype.hasOwnProperty.call(patch, "lineItems") && allServicesCancelled(out)) {
    out.status = hasChargeableCancellation(out) ? "completed" : "cancelled";
    return out;
  }
  if (out.status === "cancelled") return out;

  // Rule 2 guard: out of Quote only with an engineer and a date.
  const booked = !!out.scheduledAt && !!out.engineerId && out.engineerId !== "unassigned";
  // The one path, for a single-appointment job: engineer + date, then the
  // engineer confirms → Scheduled. Only on the write that completes the set
  // (the confirmation, or the client's acceptance landing on an already
  // confirmed booking) — so pressing "Quote" to unschedule a job isn't
  // silently undone by the next unrelated edit.
  const justConfirmed = !!out.engineerConfirmed && !prev?.engineerConfirmed;
  const justAccepted = !!out.acceptedAt && !prev?.acceptedAt;
  if (!explicit && out.status === "quote" && booked && out.engineerConfirmed && (justConfirmed || justAccepted)) {
    out.status = "scheduled";
  }
  if (prev?.status === "quote" && ["scheduled", "in_progress"].includes(out.status) && !(booked && out.engineerConfirmed)) {
    out.status = "quote";
    return out;
  }

  const due = dueInstant(out);
  const dateMoved = moved(prev, out);
  // Rule 3, backwards — only when the DATE moved in this write, so an
  // engineer who marks themselves In progress early isn't bounced back.
  if (out.status === "in_progress" && dateMoved && due && due.getTime() > nowMs) {
    out.status = "scheduled";
    return out;
  }
  // Rule 3, forwards. An explicit "Scheduled" with no date change is left
  // alone for this write (someone deliberately put it back); a reschedule
  // to a time that has already arrived is applied immediately rather than
  // waiting for the next sweep.
  if (out.status === "scheduled" && booked && due && due.getTime() <= nowMs && (!explicit || dateMoved)) {
    out.status = "in_progress";
  }
  return out;
}

// Progress for a split job — "2 of 3 visits done".
export function visitProgress(job) {
  const visits = getVisits(job).filter((v) => isVisitLive(job, v));
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
    // A new visit is always `pending`, even when it's seeded with an
    // engineer and a date. That pairing is an OFFER; the visit becomes
    // Scheduled when the engineer confirms (engineerConfirmedAt).
    status: "pending",
    engineerConfirmedAt: null,
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
