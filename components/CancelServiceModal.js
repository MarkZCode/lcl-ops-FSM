"use client";

// CancelServiceModal — one or more services on a job didn't happen.
//
// The gas got done, the EICR didn't. That is not "cancel the job" and it is
// not "mark it complete and hope" — it's three separate decisions, and each
// one is asked for here rather than assumed:
//
//   1. Why it didn't happen (counted, like job cancellations).
//   2. Is it gone, or does it still need doing? "Rebook" moves it onto its
//      own job as a quote, so the rest of this job can be invoiced now.
//   3. If it's gone: does the CLIENT still pay for it, and is the ENGINEER
//      still paid?
//
// The work itself is done by cancelServices() in lib/store.js.

import { useEffect, useMemo, useRef, useState } from "react";
import { FiXCircle, FiRepeat } from "react-icons/fi";
import Modal from "./Modal";
import { gbp, getJobLines, isAddonCode, jobPayable, lineTotal } from "@/lib/format";
import { lineEngineerId } from "@/lib/visits";

export const SERVICE_CANCEL_REASONS = [
  { key: "no_access", label: "No access on the day", desc: "Tenant out, no keys, engineer couldn't get in." },
  { key: "client_cancelled", label: "Client cancelled it", desc: "Didn't want this service after all." },
  { key: "could_not_complete", label: "Couldn't be completed", desc: "Unsafe, incomplete installation, parts needed." },
  { key: "not_needed", label: "Not needed", desc: "Already has a valid certificate, booked in error." },
  { key: "other", label: "Other", desc: "Say what happened.", requiresNote: true },
];

export default function CancelServiceModal({ open, onClose, job, initialLineIds = [], engineerName = (id) => id, onConfirm }) {
  const [selected, setSelected] = useState([]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("cancel"); // cancel | rebook
  const [billing, setBilling] = useState("waive"); // waive | charge
  const [payEngineer, setPayEngineer] = useState(false);
  const [touched, setTouched] = useState(false);
  const initRef = useRef(null);

  const lines = useMemo(
    () => (job ? getJobLines(job).filter((l) => !isAddonCode(l.code) && !l.cancelled) : []),
    [job]
  );

  useEffect(() => {
    if (!open) { initRef.current = null; return; }
    const session = `${job?.id}-${initialLineIds.join(",")}`;
    if (initRef.current === session) return;
    initRef.current = session;
    setSelected(initialLineIds.length ? initialLineIds : []);
    setReason("");
    setNote("");
    setMode("cancel");
    setBilling("waive");
    setPayEngineer(false);
    setTouched(false);
  }, [open, job, initialLineIds]);

  if (!job) return null;

  const meta = SERVICE_CANCEL_REASONS.find((r) => r.key === reason);
  const needsNote = !!meta?.requiresNote;
  const everything = selected.length > 0 && selected.length === lines.length;
  // Rebooking every service is just rescheduling the job.
  const rebookBlocked = mode === "rebook" && everything;
  const valid =
    selected.length > 0 &&
    !!reason &&
    (!needsNote || note.trim().length > 2) &&
    !rebookBlocked;

  // What the job will add up to afterwards — shown before anything is saved,
  // so nobody finds out from the invoice.
  const preview = (() => {
    const all = getJobLines(job);
    const want = new Set(selected);
    if (mode === "rebook") {
      return jobPayable({ ...job, lineItems: all.filter((l) => !want.has(l.id)) });
    }
    const next = all.map((l) => (want.has(l.id) ? { ...l, waived: billing !== "charge" } : l));
    return jobPayable({ ...job, lineItems: next });
  })();

  const selectedValue = lines.filter((l) => selected.includes(l.id)).reduce((s, l) => s + lineTotal(l), 0);
  const engineersOnSelected = [...new Set(
    lines.filter((l) => selected.includes(l.id)).map((l) => lineEngineerId(job, l)).filter((id) => id && id !== "unassigned")
  )];
  const engLabel = engineersOnSelected.length
    ? engineersOnSelected.map(engineerName).join(" & ")
    : "the engineer";

  const toggle = (id) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onConfirm({
      lineIds: selected,
      reason,
      reasonLabel: meta?.label || reason,
      note: note.trim(),
      mode,
      billing,
      payEngineer,
    });
  };

  const Choice = ({ active, onClick, title, desc, tone = "navy" }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
        active
          ? tone === "rose"
            ? "border-rose-400 bg-rose-50 ring-1 ring-rose-300"
            : "border-navy-800 bg-navy-50 ring-1 ring-navy-300"
          : "border-navy-200 bg-white hover:border-navy-300"
      }`}
    >
      <span className="block text-sm font-semibold text-navy-800">{title}</span>
      {desc && <span className="mt-0.5 block text-xs text-navy-500">{desc}</span>}
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Service not carried out"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Keep it</button>
          <button
            className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
            onClick={submit}
            disabled={touched && !valid}
          >
            {mode === "rebook" ? <FiRepeat /> : <FiXCircle />}
            {mode === "rebook" ? "Move to a new job" : "Cancel service"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 1 — which services */}
        <div>
          <p className="label">Which service{lines.length > 1 ? "s" : ""}?</p>
          <div className="flex flex-wrap gap-2">
            {lines.map((l) => {
              const on = selected.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggle(l.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    on ? "border-rose-400 bg-rose-50 text-rose-700" : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
                  }`}
                >
                  {l.name} · {gbp(lineTotal(l))}
                </button>
              );
            })}
          </div>
          {touched && !selected.length && <p className="mt-1 text-xs text-rose-600">Pick at least one service.</p>}
          {everything && mode === "cancel" && (
            <p className="mt-2 text-xs text-amber-700">
              That&rsquo;s every service on the job — the job will close as Cancelled, or as
              Completed if you&rsquo;re still charging something.
            </p>
          )}
        </div>

        {/* 2 — why */}
        <div>
          <p className="label">Why didn&rsquo;t it happen?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SERVICE_CANCEL_REASONS.map((r) => (
              <Choice key={r.key} active={reason === r.key} onClick={() => setReason(r.key)} title={r.label} desc={r.desc} tone="rose" />
            ))}
          </div>
          {touched && !reason && <p className="mt-1 text-xs text-rose-600">Pick a reason.</p>}
          <textarea
            className="input mt-2 min-h-[64px] text-sm"
            placeholder={needsNote ? "What happened? (required)" : "Anything worth recording (optional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {touched && needsNote && note.trim().length <= 2 && (
            <p className="mt-1 text-xs text-rose-600">Say what happened.</p>
          )}
        </div>

        {/* 3 — gone, or still wanted */}
        <div>
          <p className="label">Does it still need doing?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Choice
              active={mode === "cancel"}
              onClick={() => setMode("cancel")}
              title="No — cancel it"
              desc="Stays on this job, marked not carried out."
            />
            <Choice
              active={mode === "rebook"}
              onClick={() => setMode("rebook")}
              title="Yes — rebook it"
              desc="Moves to its own job as a quote. Bill the rest of this job now."
            />
          </div>
          {rebookBlocked && (
            <p className="mt-1 text-xs text-rose-600">
              That&rsquo;s every service — use Reschedule on the job instead.
            </p>
          )}
          {mode === "rebook" && !rebookBlocked && job.visits?.length > 0 && (
            <p className="mt-1 text-[11px] text-navy-500">
              Want it to stay on this job instead? Close this and just change that visit&rsquo;s date.
            </p>
          )}
        </div>

        {/* 4 — money, only when it's cancelled for good */}
        {mode === "cancel" && (
          <>
            <div>
              <p className="label">What does the client pay for it?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Choice
                  active={billing === "waive"}
                  onClick={() => setBilling("waive")}
                  title="Nothing"
                  desc="Shown on the invoice as not charged."
                />
                <Choice
                  active={billing === "charge"}
                  onClick={() => setBilling("charge")}
                  title={`In full · ${gbp(selectedValue)}`}
                  desc="Late cancellation / no access, per your terms."
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-navy-200 bg-white p-3 text-sm text-navy-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-500"
                checked={payEngineer}
                onChange={(e) => setPayEngineer(e.target.checked)}
              />
              <span>
                <strong>Still pay {engLabel}</strong> for {selected.length > 1 ? "these" : "this"}
                <span className="block text-xs text-navy-500">
                  Tick if they attended and it wasn&rsquo;t their fault (e.g. no access). Their normal rate applies.
                  Separate from what the client is charged.
                </span>
              </span>
            </label>
          </>
        )}

        <div className="flex items-center justify-between rounded-lg bg-navy-50 px-3 py-2.5 text-sm">
          <span className="text-navy-600">This job will total</span>
          <span className="tnum font-bold text-navy-900">
            {gbp(preview)}
            {Math.abs(preview - (Number(job.price) || 0)) >= 0.01 && (
              <span className="ml-2 text-xs font-medium text-navy-400 line-through">{gbp(job.price)}</span>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}
