"use client";

// CancelJobModal — a job never goes to Cancelled without a recorded reason.
//
// "Cancelled" used to be one more button in the status row, indistinguishable
// from "Scheduled": one click, no record. A month later nobody could say why
// three jobs died, whether the client walked, whether we no-showed, or whether
// it was the same landlord twice — which is exactly the pattern you need to
// see. Cancellation is now a deliberate, logged act: a category (so it can be
// counted) plus a note (so it can be understood), written onto the job AND
// appended to its activity thread.

import { useEffect, useState, useRef } from "react";
import { FiXCircle, FiAlertTriangle } from "react-icons/fi";
import Modal from "./Modal";
import { CANCEL_REASONS } from "@/lib/constants";

export default function CancelJobModal({ open, onClose, job, onConfirm }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const initRef = useRef(null);

  useEffect(() => {
    if (!open) { initRef.current = null; return; }
    const session = `job-${job?.id || "none"}`;
    if (initRef.current === session) return;
    initRef.current = session;
    setReason("");
    setNote("");
    setTouched(false);
  }, [open, job]);

  const meta = CANCEL_REASONS.find((r) => r.key === reason);
  // "Other" is only a reason if you say what it was — otherwise it records
  // nothing and we're back to an unexplained cancellation.
  const needsNote = !!meta?.requiresNote;
  const valid = !!reason && (!needsNote || note.trim().length > 2);

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onConfirm({
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      cancelReason: reason,
      cancelReasonLabel: meta?.label || reason,
      cancelNote: note.trim(),
    });
    onClose();
  };

  if (!job) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this job"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Keep job</button>
          <button
            className="btn bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            onClick={submit}
            disabled={!valid}
          >
            <FiXCircle /> Cancel job
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>
            {job.id} will move to <strong>Cancelled</strong> and drop out of the
            pipeline. The reason is saved on the job and added to its activity log.
          </span>
        </p>

        <div>
          <label className="label">Why is it being cancelled?</label>
          <div className="mt-1 space-y-1.5">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setReason(r.key)}
                className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                  reason === r.key
                    ? "border-rose-400 bg-rose-50"
                    : "border-navy-200 bg-white hover:border-navy-300"
                }`}
              >
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    reason === r.key ? "bg-rose-500" : "bg-navy-200"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy-800">{r.label}</span>
                  {r.desc && <span className="block text-[11px] text-navy-500">{r.desc}</span>}
                </span>
              </button>
            ))}
          </div>
          {touched && !reason && (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">Pick a reason to continue.</p>
          )}
        </div>

        <div>
          <label className="label">
            Notes {needsNote ? <span className="text-rose-600">(required)</span> : "(optional)"}
          </label>
          <textarea
            className="input min-h-[72px]"
            placeholder="What happened, who said so, anything worth knowing if this client comes back…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {touched && needsNote && note.trim().length <= 2 && (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">
              Say what happened — that&apos;s the whole point of picking &ldquo;Other&rdquo;.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
