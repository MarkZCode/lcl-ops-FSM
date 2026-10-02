"use client";

// Who is doing this job, and have they said yes — in ONE place.
//
// This replaces three things that used to sit on top of each other and
// could disagree: a "Suggested engineer" list with Assign buttons, an
// "Assigned engineer" dropdown, and an "Engineer confirmation" list.
//
//   • One appointment, one engineer: a single picker (best fit first, with
//     the reason), then the confirmation beside it.
//   • Several services nobody covers alone: one picker per service.
//   • A job split into visits: assigned and confirmed in the Visits panel,
//     summarised here — never two places to set the same thing.
import { useState } from "react";
import { FiCheck } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rankEngineers } from "@/lib/booking";
import { isSplit, getVisits, isVisitLive, isVisitConfirmed, visitLines } from "@/lib/visits";
import { certLabel, acceptanceProgress, scopeAccepted, setScopeConfirmed, dateLine } from "@/lib/jobCard";
import { getJobLines, isAddonCode } from "@/lib/format";

const svc = (l) => (l.code === "CUSTOM" ? l.name : certLabel(l.code));
const none = (id) => !id || id === "unassigned";

export default function EngineerBlock({ job, client, property }) {
  const { jobs, engineers, engineerById, updateJob, logActivity, rules } = useStore();
  const { user } = useAuth();
  const who = user?.name || user?.username || "";
  const real = getJobLines(job).filter((l) => !isAddonCode(l.code) && !l.cancelled);
  const closed = ["completed", "invoiced", "paid", "cancelled"].includes(job.status);
  const engOf = (l) => l.engineerId || job.engineerId || "unassigned";
  const mixed = new Set(real.map(engOf)).size > 1;

  // Can any one engineer do every service on this job?
  const codes = real.map((l) => l.code);
  const withServices = engineers.filter((e) => Array.isArray(e.services) && e.services.length);
  const oneCoversAll = !withServices.length || withServices.some((e) => codes.every((c) => e.services.includes(c)));
  const [perServiceChosen, setPerService] = useState(null);
  const perService = real.length > 1 && (perServiceChosen ?? (mixed || (none(job.engineerId) && !oneCoversAll)));

  // ── Split job: the Visits panel owns it ──
  if (isSplit(job)) {
    const visits = getVisits(job).filter((v) => isVisitLive(job, v));
    return (
      <div className="space-y-1.5">
        <p className="label">Engineers · per visit</p>
        {visits.map((v, i) => {
          const name = engineerById(v.engineerId)?.name;
          const state = none(v.engineerId) ? "No engineer yet" : !v.scheduledAt ? "Needs a date" : ["in_progress", "completed"].includes(v.status) || isVisitConfirmed(v) ? "Confirmed" : "Waiting to confirm";
          return (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 px-2.5 py-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-navy-800">{name || `Visit ${i + 1}`}</span>
                <span className="block truncate text-navy-500">{visitLines(job, v).map(svc).join(", ") || "No services"}</span>
              </span>
              <span className={`shrink-0 font-semibold ${state === "Confirmed" ? "text-brand-700" : "text-amber-700"}`}>{state}</span>
            </div>
          );
        })}
        <a href="#visits" className="inline-block text-xs font-semibold text-brand-600 hover:underline">Assign and confirm in the Visits panel ↓</a>
      </div>
    );
  }

  // Engineers for a picker: the best fits first, each with why.
  const optionsFor = (lines) => {
    const ranked = rankEngineers({ ...job, lineItems: lines }, { engineers, jobs, property, client, rules });
    const seen = new Set(ranked.map((r) => r.engineer.id));
    const rest = engineers.filter((e) => e?.id && e.id !== "unassigned" && e.active !== false && !seen.has(e.id));
    return { ranked, rest };
  };
  const Picker = ({ lines, value, onPick }) => {
    const { ranked, rest } = optionsFor(lines);
    return (
      <select className="input h-9 py-0 text-sm" value={none(value) ? "" : value} disabled={closed} onChange={(e) => onPick(e.target.value || "unassigned")} aria-label="Engineer">
        <option value="">{none(value) ? "Choose an engineer…" : "No engineer"}</option>
        {ranked.length > 0 && (
          <optgroup label="Suggested">
            {ranked.map((r, i) => <option key={r.engineer.id} value={r.engineer.id}>{r.engineer.name} — {i === 0 ? "best fit, " : ""}{r.reasons.slice(0, 2).join(", ")}</option>)}
          </optgroup>
        )}
        {rest.length > 0 && (
          <optgroup label="Everyone else">
            {rest.map((e) => <option key={e.id} value={e.id}>{e.name}{e.trade ? ` · ${e.trade}` : ""}{e.availability === "unavailable" ? " — not available" : ""}</option>)}
          </optgroup>
        )}
      </select>
    );
  };

  const assignAll = (id) => {
    // One engineer for the whole job: clear any per-service choices.
    updateJob(job.id, { engineerId: id, lineItems: Array.isArray(job.lineItems) ? job.lineItems.map((l) => (l.engineerId ? { ...l, engineerId: undefined } : l)) : job.lineItems });
  };
  const assignLine = (lineId, id) => {
    updateJob(job.id, { lineItems: getJobLines(job).map((l) => (l.id === lineId ? { ...l, engineerId: none(id) ? undefined : id } : l)) });
  };

  // Marking someone confirmed is what lets the client be told "booked" —
  // so it asks first, and it's written on the job who said so.
  const confirm = (sc, on) => {
    const name = engineerById(sc.engineerId)?.name || "the engineer";
    const q = on
      ? `Has ${name} actually agreed to attend${job.scheduledAt ? ` on ${dateLine(job)}` : ""}?\n\nOnly press OK if they have said yes — this is what lets the client be told it's booked.`
      : `Undo ${name}'s confirmation? The job goes back to waiting for them.`;
    if (!window.confirm(q)) return;
    updateJob(job.id, setScopeConfirmed(job, sc.key, on, engineerById));
    logActivity(job.id, { type: "status", title: on ? `${name} marked as confirmed` : `${name}'s confirmation undone`, by: who });
  };

  const { scopes } = acceptanceProgress(job, engineerById);
  const Status = ({ sc }) => {
    if (none(sc.engineerId) || closed) return null;
    if (!job.scheduledAt) return <span className="shrink-0 text-xs text-navy-400">Needs a date</span>;
    if (scopeAccepted(job, sc)) {
      return (
        <button type="button" onClick={() => confirm(sc, false)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700" title="Undo the confirmation">
          <FiCheck /> Confirmed
        </button>
      );
    }
    return (
      <button type="button" onClick={() => confirm(sc, true)} className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600">
        Mark confirmed
      </button>
    );
  };

  return (
    <div id="booking" className="scroll-mt-24 space-y-2">
      <p className="label">Engineer{perService ? "s · one per service" : ""}</p>

      {!perService ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><Picker lines={real} value={job.engineerId} onPick={assignAll} /></div>
          {scopes[0] && <Status sc={scopes[0]} />}
        </div>
      ) : (
        <>
          {real.map((l) => (
            <div key={l.id} className="space-y-1">
              <p className="text-xs font-semibold text-navy-700">{svc(l)}</p>
              <Picker lines={[l]} value={engOf(l)} onPick={(id) => assignLine(l.id, id)} />
            </div>
          ))}
          {scopes.filter((sc) => !none(sc.engineerId)).map((sc) => (
            <div key={sc.key} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 px-2.5 py-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-navy-800">{engineerById(sc.engineerId)?.name || sc.label}</span>
                {sc.sub && <span className="block truncate text-navy-500">{sc.sub}</span>}
              </span>
              <Status sc={sc} />
            </div>
          ))}
        </>
      )}

      {real.length > 1 && !closed && (
        <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setPerService(!perService)}>
          {perService ? "Use one engineer for everything" : "Different engineer per service"}
        </button>
      )}
      {!oneCoversAll && !perService && real.length > 1 && none(job.engineerId) && (
        <p className="text-xs text-amber-700">No single engineer covers all {real.length} services.</p>
      )}
    </div>
  );
}
