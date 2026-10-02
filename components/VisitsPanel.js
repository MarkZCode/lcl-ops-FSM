"use client";

import { useState } from "react";
import { LuSplit, LuTrash2, LuPlus } from "react-icons/lu";
import { useStore } from "@/lib/store";
import { gbp, lineTotal, isAddonCode } from "@/lib/format";
import { certificationRateForLine } from "@/lib/finance";
import { TIME_PARTS, WINDOW_PRESETS } from "@/lib/constants";
import { certLabel } from "@/lib/jobCard";
import { ukDateTimeToUtcIso } from "@/lib/ukTime";
import { toast } from "@/lib/toast";
import {
  getVisits, isSplit, visitLines, unassignedLines, schedulableLines,
  visitProgress, readyToInvoice, isVisitBooked, isVisitLive,
  splitPerService, assignLineToVisit,
  makeVisit, syncJobFromVisits, VISIT_OUTCOMES, isVisitConfirmed,
} from "@/lib/visits";

// Split a job into separate engineer visits — different people, different
// days, one client-facing job. Only appears on multi-service jobs, because a
// single-service job is already one visit and splitting it is meaningless.
export default function VisitsPanel({ job, onCancelLines }) {
  const { updateJob, engineers, splitOffIncompleteWork } = useStore();
  const [open, setOpen] = useState(false);

  // Only real work is schedulable. Parking/congestion are charges on the job,
  // never something an engineer attends, so they never appear here.
  const realLines = schedulableLines(job);
  const split = isSplit(job);
  const visits = getVisits(job);
  const progress = visitProgress(job);
  const orphans = unassignedLines(job);

  // "Some done, some not" — the only state where splitting the job is the
  // right move. Needs at least one completed visit AND at least one that
  // isn't (cancelled visits don't count as outstanding; they were called off
  // deliberately and there's nothing left to reschedule).
  const partial = (() => {
    if (!split) return null;
    const live = visits.filter((v) => isVisitLive(job, v));
    const done = live.filter((v) => v.status === "completed");
    const notDone = live.filter((v) => v.status !== "completed");
    if (!done.length || !notDone.length) return null;
    const labels = notDone
      .flatMap((v) => visitLines(job, v))
      .map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code)))
      .filter(Boolean);
    return {
      doneCount: done.length,
      total: live.length,
      outstandingLabel: [...new Set(labels)].join(", ") || "the remaining work",
    };
  })();

  // Nothing to split — don't clutter a one-service job with this.
  if (!split && realLines.length < 2) return null;

  const save = (nextVisits, extraPatch = {}) => {
    // Job status follows its visits — worked out by reconcileJob inside
    // updateJob, the same rules every other screen goes through. Passing a
    // status from here made it look like a deliberate manual choice. The
    // job's own date/engineer follow the visits too, so every other view of
    // this job (list, funnel, calendar, dispatch) agrees with this panel.
    updateJob(job.id, {
      visits: nextVisits,
      ...syncJobFromVisits(job, nextVisits),
      ...extraPatch,
    });
  };

  // Assigning an engineer or picking a date is what actually books a visit —
  // the status label should follow that, not sit stuck on whatever it said
  // before. Only nudges it between pending <-> scheduled; a visit already
  // in_progress/completed/cancelled is a real workflow state and is never
  // silently overwritten just because its engineer or date field changed.
  // Reassigning a visit's engineer used to have NO effect on who actually got
  // paid: lineEngineerId() (lib/visits.js) checks the LINE's own engineerId
  // FIRST, the visit second — so a line that had ever carried its own
  // engineerId (set before the job was split, or from an earlier assignment)
  // kept overriding every later visit reassignment silently. The Visits panel
  // itself showed the new engineer (it reads visit.engineerId directly), but
  // the job's Services list, the engineer-pay statement, and who actually got
  // paid all kept reading the STALE line-level override — a real
  // misattribution, not just a display mismatch. Confirmed on JOB-4322: the
  // visit said Aaron, completed; the GAS line item itself still said Kernel
  // Harvey from an earlier assignment, so Kernel Harvey — not Aaron — was the
  // one who'd actually get paid for it.
  //
  // Reassigning a visit's engineer now also clears any per-line override on
  // the lines that visit covers, so the visit becomes the single source of
  // truth for "who is doing this" the moment a job is split, exactly as the
  // module's own header comment says it should be.
  const patchVisit = (id, patch) => {
    const target = visits.find((v) => v.id === id);
    const nextVisits = visits.map((v) => {
      if (v.id !== id) return v;
      const next = { ...v, ...patch };
      if (patch.status === undefined && ["pending", "scheduled"].includes(v.status)) {
        // Booking a visit doesn't mark it Scheduled on its own — an engineer
        // and a date is an offer until the engineer confirms.
        //
        // But MOVING a confirmed visit keeps it confirmed. It used to drop
        // straight back to pending on any date change (a visit confirmed by
        // being Scheduled has no engineerConfirmedAt stamp), which dragged
        // the whole job back to Quote the moment one service was
        // rescheduled. Only a different ENGINEER needs a fresh yes.
        const engineerChanged = patch.engineerId !== undefined && (patch.engineerId || "") !== (v.engineerId || "");
        if (engineerChanged) {
          next.engineerConfirmedAt = null;
          next.status = "pending";
        } else if (!isVisitBooked(next)) {
          next.status = "pending";
        } else {
          next.status = v.status === "scheduled" || next.engineerConfirmedAt ? "scheduled" : "pending";
          if (next.status === "scheduled" && !next.engineerConfirmedAt) {
            next.engineerConfirmedAt = new Date().toISOString();
          }
        }
      }
      return next;
    });
    let extraPatch = {};
    if (patch.engineerId !== undefined && target) {
      const covered = new Set(target.lineIds || []);
      const nextLines = (job.lineItems || []).map((l) =>
        covered.has(l.id) ? { ...l, engineerId: undefined } : l
      );
      extraPatch = { lineItems: nextLines };
    }
    save(nextVisits, extraPatch);
  };

  // Picking Morning/Afternoon fills the arrival window the same way job
  // creation does — same presets, same behaviour — and the times stay
  // editable afterwards for the odd "8am–10am only" booking. Changing the
  // part of day also re-anchors scheduledAt to the new start time, so the
  // calendar and the engineer's card don't keep showing the old slot.
  const setVisitPart = (v, part) => {
    const preset = WINDOW_PRESETS[part];
    const patch = { windowPart: part };
    if (preset) {
      patch.windowFrom = preset.from;
      patch.windowTo = preset.to;
      if (v.scheduledAt) {
        const day = new Date(v.scheduledAt).toISOString().slice(0, 10);
        patch.scheduledAt = ukDateTimeToUtcIso(day, preset.from);
      }
    }
    patchVisit(v.id, patch);
  };

  const removeVisit = (id) => {
    const next = visits.filter((v) => v.id !== id);
    if (!next.length) {
      // Last visit removed → back to a plain unsplit job.
      updateJob(job.id, { visits: null });
      return;
    }
    save(next);
  };

  const addVisit = () => save([...visits, makeVisit(job, [])]);

  // Clicking a service MOVES it onto this visit and off any other. A service
  // is done once, by one person, on one day — allowing it on two visits at
  // once double-counted the job's value and made the panel unreadable.
  // A service belongs to exactly ONE visit, always. Tapping a service moves
  // it onto this visit; tapping the one it's already on does nothing (it
  // used to take it off, leaving the service on no visit at all — JOB-3916
  // lost its FRA and EICR that way). A visit emptied by moving its last
  // service elsewhere is removed, instead of lingering as a blank leg.
  const toggleLine = (visitId, lineId) => {
    const on = visits.find((v) => v.id === visitId)?.lineIds?.includes(lineId);
    if (on) {
      toast("To move it, tap it on another visit. To take it off the job, use Not done… in Services.");
      return;
    }
    const moved = assignLineToVisit(visits, lineId, visitId);
    const emptied = moved.filter((v) => v.id !== visitId && !(v.lineIds || []).length && (visits.find((o) => o.id === v.id)?.lineIds || []).length);
    // Keeps a one-visit split rather than collapsing it: collapsing would
    // throw away that visit's confirmation and progress.
    save(moved.filter((v) => !emptied.includes(v)));
  };

  if (!split) {
    // ONE way to split, deliberately.
    //
    // There used to be a second button ("Group by engineer") that bucketed the
    // services by whoever was already named on each service line. It was
    // redundant: splitPerService below ALREADY carries each line's engineer
    // onto its visit, so the only thing the second button did differently was
    // MERGE two services onto a single visit when they shared an engineer —
    // which the service chips on each visit already let you do by hand, by
    // clicking a service to move it onto another visit. It added no
    // capability, only a choice nobody could interpret, so it's gone.
    return (
      <div className="panel">
        <div className="panel-head">
          <div className="min-w-0">
            <span className="panel-title">Visits</span>
            <p className="panel-sub">
              All {realLines.length} services are booked as one appointment with one
              engineer. Split them if they need different engineers or different days.
            </p>
          </div>
          <button
            className="btn-outline shrink-0 py-1.5 text-xs"
            onClick={() => { save(splitPerService(job)); setOpen(true); }}
            title={`Gives each service its own visit, with its own engineer, date and time. You can move services between visits afterwards, or delete a visit to put them back together.`}
          >
            <LuSplit className="h-3.5 w-3.5" /> Split into {realLines.length} visits
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head panel-head-ruled">
        <div className="min-w-0">
          <span className="panel-title">Visits</span>
          <p className="panel-sub">
            {progress.done} of {progress.total} done
            {readyToInvoice(job)
              ? " · all work complete, ready to invoice"
              : " · not billable until every visit is finished"}
          </p>
        </div>
        <button className="btn-outline shrink-0 py-1.5 text-xs" onClick={addVisit}>
          <LuPlus className="h-3.5 w-3.5" /> Add visit
        </button>
      </div>

      {/* Says out loud what the service chips below do. This is the capability
          the removed "Group by engineer" button was a shortcut for — putting
          two services back on one visit — so it needs to be discoverable
          rather than something you find by experimenting. */}
      <p className="border-b border-navy-100 px-4 py-2 text-[11px] text-navy-500">
        Tap a service to move it onto that visit — put two on the same visit if
        one engineer is doing both. Deleting a visit frees its services up again.
      </p>

      {/* Part done, part not — the gas cert got done, the EICR couldn't be.
          Rather than block the whole job from being invoiced until someone
          fakes the outstanding visit as complete, offer the honest move:
          bill what was actually carried out, and push the rest onto its own
          job so it stays in the pipeline to be rescheduled. */}
      {/* For jobs that are ALREADY invoiced/paid, keep all visits on 1 single job card */}
      {partial && !["invoiced", "paid"].includes(job.status) && (
        <div className="border-b border-navy-100 bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            {partial.doneCount} of {partial.total} visits done — {partial.outstandingLabel} still outstanding
          </p>
          <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300/90">
            Invoice the completed work now and move the rest onto its own job,
            so it can be rescheduled (or cancelled) without holding up billing.
          </p>
          <button
            className="btn-outline mt-2 py-1.5 text-xs"
            onClick={() => {
              const created = splitOffIncompleteWork(job.id);
              if (created) {
                toast.success(`${partial.outstandingLabel} moved to ${created.id} — this job is now ready to invoice.`);
              } else {
                toast.error("Couldn't split this job — check that at least one visit is complete and one isn't.");
              }
            }}
          >
            <LuSplit className="h-3.5 w-3.5" /> Invoice completed work, reschedule the rest
          </button>
        </div>
      )}

      {split && ["invoiced", "paid"].includes(job.status) && (
        <div className="border-b border-navy-100 bg-emerald-50 px-4 py-2.5 dark:bg-emerald-500/10">
          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
            ✓ Single Billed Package — All {visits.length} visits stay on this job card ({job.id}) under one main invoice/payment.
          </p>
        </div>
      )}

      {orphans.length > 0 && (
        <p className="border-b border-navy-100 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-500/10">
          {orphans.length} service{orphans.length !== 1 ? "s" : ""} not on any visit
          ({orphans.map((l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code))).join(", ")})
          — they won&apos;t be scheduled or dispatched.
        </p>
      )}

      <div className="divide-y divide-navy-100">
        {visits.map((v, i) => {
          const vLines = visitLines(job, v);
          const value = vLines.reduce((s, l) => s + lineTotal(l), 0);
          const dateVal = v.scheduledAt ? new Date(v.scheduledAt).toISOString().slice(0, 10) : "";
          return (
            <div key={v.id} className="p-4">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-navy-900">Visit {i + 1}</span>
                <span className={`pill ${stepOf(v).pill}`}>{stepOf(v).label}</span>
                <span className="tnum ml-auto text-[13px] text-navy-500">{gbp(value)}</span>
                <button
                  type="button"
                  onClick={() => removeVisit(v.id)}
                  className="rounded p-1 text-navy-400 hover:text-rose-500"
                  title="Remove this visit"
                >
                  <LuTrash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* ONE path for every visit: engineer → date → engineer
                  confirms → done. Replaces a status pill, a separate
                  confirmation pill AND a status dropdown that could all
                  disagree. The only next move is the button shown. */}
              <VisitStepBar
                v={v}
                engineerName={engineers.find((e) => e.id === v.engineerId)?.name}
                onConfirm={(on) =>
                  window.confirm(on ? "Has the engineer actually agreed to attend this visit? Only press OK if they have said yes." : "Undo this engineer's confirmation?") &&
                  patchVisit(v.id, on
                    ? { engineerConfirmedAt: new Date().toISOString(), status: "scheduled" }
                    : { engineerConfirmedAt: null, status: "pending" })
                }
                onStart={() => patchVisit(v.id, { status: "in_progress" })}
                onDone={() => patchVisit(v.id, { status: "completed", completedAt: new Date().toISOString() })}
                onReopen={() => patchVisit(v.id, { status: "scheduled", completedAt: null })}
                onNotDone={() => {
                  const ids = visitLines(job, v).filter((l) => !isAddonCode(l.code) && !l.cancelled).map((l) => l.id);
                  if (ids.length && onCancelLines) onCancelLines(ids);
                }}
                outcome={v.outcome}
                onOutcome={(o) => patchVisit(v.id, { outcome: o || null })}
              />

              {/* Which services this engineer is doing */}
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {visitLines(job, v).filter((l) => l.cancelled).map((l) => (
                  <span
                    key={l.id}
                    title={`Cancelled — ${l.cancelReasonLabel || "no reason"}`}
                    className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-500 line-through"
                  >
                    {l.code === "CUSTOM" ? l.name : certLabel(l.code)}
                  </span>
                ))}
                {realLines.map((l) => {
                  const on = (v.lineIds || []).includes(l.id);
                  const elsewhere = !on && visits.some((o) => o.id !== v.id && (o.lineIds || []).includes(l.id));
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => toggleLine(v.id, l.id)}
                      title={elsewhere ? "On another visit — click to move it here" : on ? "Click to remove from this visit" : "Click to add to this visit"}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                        on
                          ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15"
                          : elsewhere
                            ? "border-navy-200 text-navy-400 opacity-50 hover:opacity-100"
                            : "border-amber-300 text-amber-700"
                      }`}
                    >
                      {l.code === "CUSTOM" ? l.name : certLabel(l.code)}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  className="input h-9 text-sm"
                  value={v.engineerId || ""}
                  onChange={(e) => patchVisit(v.id, { engineerId: e.target.value || "" })}
                >
                  <option value="">Unassigned</option>
                  {engineers.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="input h-9 text-sm"
                  value={dateVal}
                  onChange={(e) =>
                    patchVisit(v.id, {
                      scheduledAt: e.target.value
                        ? ukDateTimeToUtcIso(e.target.value, v.windowFrom || "09:00")
                        : null,
                    })
                  }
                />
              </div>

              {/* Inspection-only + who certifies.
                  Some engineers attend and inspect but don't issue the
                  certificate — somebody else signs it off, and gets paid for
                  it. Marking the visit inspection-only pays the attending
                  engineer their inspection rate (Engineers -> rates) instead
                  of the full rate, and naming a certifier adds a payable line
                  for them in Engineer pay, with their own balance and payment
                  records like any other engineer. */}
              <div className="mt-2 rounded-lg border border-navy-100 bg-navy-50/60 p-2.5 dark:bg-white/[0.03]">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-navy-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-navy-300 text-brand-500"
                    checked={v.scope === "inspection"}
                    onChange={(e) => {
                      const on = e.target.checked;
                      patchVisit(v.id, {
                        scope: on ? "inspection" : "full",
                        ...(on ? {} : { certifierId: "", certifierFee: "" }),
                      });
                    }}
                  />
                  Inspection only — certificate issued by someone else
                </label>
                {v.scope === "inspection" && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="label text-[10px]">Certificate issued by</label>
                      <select
                        className="input h-8 text-sm"
                        value={v.certifierId || ""}
                        onChange={(e) => {
                          const certifierId = e.target.value;
                          // Seed the fee from that engineer's own full rate
                          // less their inspection rate — what the certificate
                          // alone is worth to them. Editable, because this is
                          // often a one-off arrangement.
                          const cert = engineers.find((en) => en.id === certifierId);
                          const lines = visitLines(job, v).filter((l) => !isAddonCode(l.code));
                          let seeded = "";
                          if (cert && lines.length) {
                            const total = lines.reduce(
                              (sum, l) => sum + (certificationRateForLine(l, cert) ?? 0),
                              0
                            );
                            if (total > 0) seeded = String(Math.round(total * 100) / 100);
                          }
                          patchVisit(v.id, {
                            certifierId,
                            ...(v.certifierFee ? {} : { certifierFee: seeded }),
                          });
                        }}
                      >
                        <option value="">Nobody yet</option>
                        {engineers.map((en) => (
                          <option key={en.id} value={en.id}>{en.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label text-[10px]">Pay them (£)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="input h-8 text-sm"
                        value={v.certifierFee ?? ""}
                        placeholder="0.00"
                        onChange={(e) => patchVisit(v.id, { certifierFee: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  className="input h-9 text-sm"
                  value={v.windowPart || ""}
                  onChange={(e) => setVisitPart(v, e.target.value)}
                  title="Part of day — fills the arrival window automatically"
                >
                  <option value="">Part of day…</option>
                  {TIME_PARTS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  type="time"
                  className="input h-9 text-sm"
                  value={v.windowFrom || ""}
                  onChange={(e) => {
                    const patch = { windowFrom: e.target.value };
                    if (v.scheduledAt && e.target.value) {
                      const day = new Date(v.scheduledAt).toISOString().slice(0, 10);
                      patch.scheduledAt = ukDateTimeToUtcIso(day, e.target.value);
                    }
                    patchVisit(v.id, patch);
                  }}
                  title="Arrival window from"
                />
                <input
                  type="time"
                  className="input h-9 text-sm"
                  value={v.windowTo || ""}
                  onChange={(e) => patchVisit(v.id, { windowTo: e.target.value })}
                  title="Arrival window to"
                />
              </div>
              <input
                className="input mt-2 h-9 text-sm"
                placeholder="Notes for this visit only — shown on this engineer's card"
                value={v.notes || ""}
                onChange={(e) => patchVisit(v.id, { notes: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Where a visit is on its one path, in words.
function stepOf(v) {
  if (v.status === "cancelled") return { key: "cancelled", label: "Not done", pill: "pill-rose" };
  if (v.status === "completed") return { key: "done", label: "Done", pill: "pill-green" };
  if (v.status === "in_progress") return { key: "on_site", label: "In progress", pill: "pill-amber" };
  if (!v.engineerId || v.engineerId === "unassigned") return { key: "engineer", label: "Needs an engineer", pill: "pill-neutral" };
  if (!v.scheduledAt) return { key: "date", label: "Needs a date", pill: "pill-neutral" };
  if (isVisitConfirmed(v)) return { key: "confirmed", label: "Confirmed", pill: "pill-blue" };
  return { key: "awaiting", label: "Awaiting engineer", pill: "pill-amber" };
}

const STEPS = [
  { key: "engineer", label: "Engineer" },
  { key: "date", label: "Date" },
  { key: "confirm", label: "Confirmed" },
  { key: "done", label: "Done" },
];

function VisitStepBar({ v, engineerName, onConfirm, onStart, onDone, onReopen, onNotDone, outcome, onOutcome }) {
  const step = stepOf(v);
  if (step.key === "cancelled") return null;
  const reached = {
    engineer: !!v.engineerId && v.engineerId !== "unassigned",
    date: !!v.scheduledAt,
    confirm: isVisitConfirmed(v),
    done: v.status === "completed",
  };
  const started = v.status === "in_progress";
  const due = v.scheduledAt && new Date(v.scheduledAt).getTime() <= Date.now() + 12 * 3600_000;

  return (
    <div className="mb-3 rounded-lg border border-navy-100 bg-navy-50/60 p-2.5 dark:bg-white/[0.03]">
      <ol className="mb-2 flex items-center gap-1 text-[11px] font-semibold">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] ${
                reached[s.key] ? "bg-brand-500 text-white" : "border border-navy-300 text-navy-400"
              }`}
            >
              {reached[s.key] ? "✓" : i + 1}
            </span>
            <span className={`truncate ${reached[s.key] ? "text-navy-800" : "text-navy-400"}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-navy-200" />}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {step.key === "engineer" && <span className="text-xs text-navy-500">Pick an engineer below.</span>}
        {step.key === "date" && <span className="text-xs text-navy-500">Pick a date below.</span>}
        {step.key === "awaiting" && (
          <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => onConfirm(true)}>
            {engineerName || "Engineer"} has confirmed
          </button>
        )}
        {step.key === "confirmed" && (
          <>
            {due ? (
              <button type="button" className="btn-primary py-1.5 text-xs" onClick={onDone}>Mark done</button>
            ) : (
              <span className="text-xs text-navy-500">Booked — {engineerName || "engineer"} confirmed.</span>
            )}
            <button type="button" className="text-[11px] font-semibold text-navy-400 hover:text-navy-700" onClick={() => onConfirm(false)}>
              Undo confirmation
            </button>
            {!due && (
              <button type="button" className="text-[11px] font-semibold text-navy-400 hover:text-navy-700" onClick={onStart}>
                Started early
              </button>
            )}
          </>
        )}
        {started && (
          <button type="button" className="btn-primary py-1.5 text-xs" onClick={onDone}>Mark done</button>
        )}
        {step.key === "done" && (
          <>
            <select
              className="input h-8 w-auto text-xs"
              value={outcome || ""}
              onChange={(e) => onOutcome(e.target.value)}
              title="Outcome — a visit can be done and still FAIL"
            >
              <option value="">Outcome…</option>
              {VISIT_OUTCOMES.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button type="button" className="text-[11px] font-semibold text-navy-400 hover:text-navy-700" onClick={onReopen}>
              Reopen
            </button>
          </>
        )}
        {step.key !== "done" && (
          <button
            type="button"
            className="ml-auto text-[11px] font-semibold text-navy-400 hover:text-rose-600"
            onClick={onNotDone}
          >
            Not done…
          </button>
        )}
      </div>
    </div>
  );
}
