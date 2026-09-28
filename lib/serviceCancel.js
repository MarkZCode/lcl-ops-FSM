// ── ONE SERVICE ON A JOB DIDN'T HAPPEN ──────────────────────────────────
//
// The gas got done; the EICR didn't (no access, client cancelled on the
// doorstep, engineer couldn't finish). Before this the only tools were
// cancelling the WHOLE job or faking the missing service as complete.
//
// Two decisions are recorded separately, because they really are separate:
//   • the CLIENT  — charged in full, or not charged;
//   • the ENGINEER — paid for it or not (they may have stood at a locked
//     door, or never gone).
// Or mode "rebook": it still wants doing, so it moves onto its own linked job
// as a quote and the rest of this job can be billed now.
//
// The cancelled line STAYS on the job, flagged — so the invoice can show it
// was booked and why it is (or isn't) charged, and the history survives.
//
// Pure planning functions: they return what to write and never write
// anything themselves. lib/store.js applies the result, and the rules can be
// tested without React.
import { getJobLines, lineTotal, jobPayable, isAddonCode } from "./format";
import { lineEngineerId } from "./visits";

const MONEY_LOCKED = ["invoiced", "paid"];

const codesOf = (lines) =>
  [...new Set(lines.filter((l) => !l.cancelled).map((l) => l.code).filter(Boolean))];

const isSplitJob = (job) => Array.isArray(job?.visits) && job.visits.length > 0;

// Returns { error } or { patch, followUp?, activity }.
//   followUp — a new job to create (mode "rebook"); the caller creates it and
//   passes its id back through `withFollowUpId`.
export function planServiceCancellation(job, opts = {}, now = new Date()) {
  if (!job) return { error: "Job not found." };
  if (MONEY_LOCKED.includes(job.status)) {
    return {
      error:
        "This job has already been invoiced — issue a credit or refund against the invoice instead of changing its services.",
    };
  }
  const {
    lineIds = [], reason = "other", reasonLabel = "Other", note = "",
    mode = "cancel", billing = "waive", payEngineer = false,
  } = opts;
  if (!["cancel", "rebook"].includes(mode)) return { error: "Unknown option." };
  if (!["waive", "charge"].includes(billing)) return { error: "Unknown billing option." };

  const want = new Set(lineIds);
  // Materialise the lines — a legacy job derives them from job.services, and
  // a flag written onto a derived line would be lost on the next read.
  const lines = getJobLines(job).map((l) => ({ ...l }));
  const targets = lines.filter((l) => want.has(l.id) && !isAddonCode(l.code) && !l.cancelled);
  if (!targets.length) return { error: "Nothing selected to cancel." };
  const names = targets.map((l) => l.name).join(", ");
  const split = isSplitJob(job);

  if (mode === "rebook") {
    const kept = lines.filter((l) => !targets.some((t) => t.id === l.id));
    const keptWork = kept.filter((l) => !isAddonCode(l.code) && !l.cancelled);
    if (!keptWork.length) {
      return { error: "That's every service on the job — reschedule the whole job instead of moving it." };
    }
    // The new job starts clean: no engineer carried across (it's a new
    // booking), and no discount of the old job's leaks onto it.
    const moved = targets.map(({ engineerId, ...l }) => l);
    const followUp = {
      clientId: job.clientId,
      propertyId: job.propertyId,
      services: codesOf(moved),
      lineItems: moved,
      quantities: job.quantities,
      gasAppliances: job.gasAppliances,
      nameOnCert: job.nameOnCert,
      accessName: job.accessName,
      accessPhone: job.accessPhone,
      callBefore: job.callBefore,
      engineerId: "",
      price: Math.max(0, moved.reduce((s, l) => s + lineTotal(l), 0)),
      status: "quote",
      notes: `Not carried out on ${job.id} (${reasonLabel.toLowerCase()})${note ? ` — ${note}` : ""}. Needs rebooking.`,
      relatedJobId: job.id,
      relationType: "not_completed",
      parentJobId: job.id,
      billingStatus: "unbilled",
      scheduledAt: null,
    };
    const patch = {
      lineItems: kept,
      services: codesOf(kept),
      price: jobPayable({ ...job, lineItems: kept }),
    };
    if (split) {
      const visits = job.visits
        .map((v) => ({ ...v, lineIds: (v.lineIds || []).filter((id) => !want.has(id)) }))
        // A visit that only covered the moved services has nothing left to do.
        .filter((v) => v.lineIds.length > 0 || !(job.visits.find((o) => o.id === v.id)?.lineIds || []).length);
      patch.visits = visits.length ? visits : null;
    }
    return {
      patch,
      followUp,
      activity: {
        type: "status",
        title: `${names} moved to a new job to rebook — ${reasonLabel}`,
        detail: note,
      },
    };
  }

  // Cancel for good, with the billing decision recorded on the line.
  const stamp = now.toISOString();

  const nextLines = lines.map((l) => {
    if (!targets.some((t) => t.id === l.id)) return l;
    const eng = lineEngineerId(job, l);
    return {
      ...l,
      // Snapshot who was responsible, so paying them for the wasted trip
      // still finds the right person if the visit is changed later.
      engineerId: eng && eng !== "unassigned" ? eng : l.engineerId,
      cancelled: true,
      cancelledAt: stamp,
      cancelReason: reason,
      cancelReasonLabel: reasonLabel,
      cancelNote: note,
      billing,
      payEngineer: !!payEngineer,
      wasWaived: !!l.waived,
      waived: billing !== "charge",
    };
  });

  const patch = {
    lineItems: nextLines,
    services: codesOf(nextLines),
    price: jobPayable({ ...job, lineItems: nextLines }),
  };
  if (split) {
    // A visit whose every service is now cancelled is cancelled too — unless
    // it was already completed (that's history, leave it).
    const byId = new Map(nextLines.map((l) => [l.id, l]));
    patch.visits = job.visits.map((v) => {
      const ids = (v.lineIds || []).filter((id) => !isAddonCode(byId.get(id)?.code));
      if (!ids.length || v.status === "completed") return v;
      return ids.every((id) => byId.get(id)?.cancelled) ? { ...v, status: "cancelled" } : v;
    });
  }
  const billText = billing === "charge" ? "charged in full" : "not charged";
  return {
    patch,
    activity: {
      type: "status",
      title: `${names} cancelled — ${reasonLabel}`,
      detail: `Client: ${billText}. Engineer: ${payEngineer ? "paid" : "not paid"}.${note ? ` ${note}` : ""}`,
    },
  };
}

// Undo a service cancellation. Puts the line back exactly as it was billed
// before and reopens its visit. Returns { error } or { patch, activity }.
export function planServiceRestore(job, lineId) {
  if (!job) return { error: "Job not found." };
  if (MONEY_LOCKED.includes(job.status)) {
    return { error: "This job has already been invoiced — its services can't be changed." };
  }
  const lines = getJobLines(job).map((l) => ({ ...l }));
  const line = lines.find((l) => l.id === lineId);
  if (!line?.cancelled) return { error: "That service isn't cancelled." };
  const nextLines = lines.map((l) => {
    if (l.id !== lineId) return l;
    const {
      cancelled, cancelledAt, cancelReason, cancelReasonLabel, cancelNote,
      billing, payEngineer, wasWaived, feeLineId, ...rest
    } = l;
    return { ...rest, waived: !!wasWaived };
  });

  const patch = {
    lineItems: nextLines,
    services: codesOf(nextLines),
    price: jobPayable({ ...job, lineItems: nextLines }),
  };
  const wasAllCancelled = lines.filter((l) => !isAddonCode(l.code)).every((l) => l.cancelled);
  if (isSplitJob(job)) {
    patch.visits = job.visits.map((v) =>
      (v.lineIds || []).includes(lineId) && v.status === "cancelled"
        ? { ...v, status: "pending", engineerConfirmedAt: null }
        : v
    );
  } else if (wasAllCancelled && ["cancelled", "completed"].includes(job.status)) {
    // Every service had been cancelled, so the job had closed. With one back
    // it's work again — booked if it still has someone and a date.
    patch.status =
      job.scheduledAt && job.engineerId && job.engineerId !== "unassigned" ? "scheduled" : "quote";
  }
  return {
    patch,
    activity: { type: "status", title: `${line.name} restored — no longer cancelled` },
  };
}
