"use client";

import { useEffect, useState } from "react";
import { FiCalendar } from "react-icons/fi";
import Modal from "./Modal";
import { TIME_PARTS, WINDOW_PRESETS } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { ukDateTimeToUtcIso } from "@/lib/ukTime";

// Move a booked job to a new date/time, with the reason recorded.
//
// Before this the only way to change an appointment was Edit → Scheduling,
// which silently overwrites the date: nothing anywhere said the job had moved,
// when, or why. For the commonest reasons — the engineer is running late, the
// tenant cancelled access — that history is the whole point. Rescheduling is
// a distinct event from editing a job, so it gets its own action, keeps the
// original date visible while you pick the new one, and writes a line into
// the job's activity thread.
const REASONS = [
  "Engineer running late",
  "Engineer unavailable",
  "No access / tenant not in",
  "Customer requested a different day",
  "Weather / site conditions",
  "Other",
];

export default function RescheduleModal({ open, onClose, job, onConfirm }) {
  const [date, setDate] = useState("");
  const [part, setPart] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  // Emailing the client is OFF by default and has to be turned on
  // deliberately. Rescheduling is often an internal correction — fixing a
  // wrong date, shuffling an unconfirmed slot — and a checkbox that arrives
  // pre-ticked sends the client a confirmation for every one of those before
  // anyone notices it was on.
  const [notify, setNotify] = useState(false);

  // Seed from the job's CURRENT slot each time it opens, so the common case
  // (same window, different day) is one field away.
  useEffect(() => {
    if (!open || !job) return;
    const iso = job.scheduledAt ? new Date(job.scheduledAt) : null;
    setDate(iso ? iso.toISOString().slice(0, 10) : "");
    setPart(job.windowPart || "");
    setFrom(job.windowFrom || "");
    setTo(job.windowTo || "");
    setReason(REASONS[0]);
    setNote("");
    setNotify(false);
  }, [open, job]);

  if (!job) return null;

  const pickPart = (p) => {
    setPart(p);
    const preset = WINDOW_PRESETS[p];
    if (preset) {
      setFrom(preset.from);
      setTo(preset.to);
    }
  };

  const submit = () => {
    if (!date) return;
    const scheduledAt = ukDateTimeToUtcIso(date, from || "09:00");
    onConfirm({
      scheduledAt,
      windowPart: part,
      windowFrom: from,
      windowTo: to,
      reason: reason === "Other" ? note.trim() || "Other" : reason,
      note: note.trim(),
      notify,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reschedule job"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={!date}>
            <FiCalendar /> Reschedule
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-600">
          Currently booked for{" "}
          <strong className="text-navy-900">
            {job.scheduledAt ? fmtDateTime(job.scheduledAt) : "no date set"}
          </strong>
          {job.windowFrom && job.windowTo ? ` (${job.windowFrom}–${job.windowTo})` : ""}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">New date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Part of day</label>
            <select className="input" value={part} onChange={(e) => pickPart(e.target.value)}>
              <option value="">Choose…</option>
              {TIME_PARTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Arrival from</label>
            <input type="time" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Arrival to</label>
            <input type="time" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Reason</label>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="label">
            Note {reason === "Other" ? "" : <span className="font-normal text-navy-400">(optional)</span>}
          </label>
          <textarea
            className="input min-h-[64px]"
            placeholder="Anything worth remembering about why this moved…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-navy-700">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-500"
          />
          <span>
            Email the client the new appointment
            {/* Only shown once it's actually switched on — while it's off,
                naming the template describes something that isn't going to
                happen. */}
            {notify && (
              <span className="block text-[11px] text-navy-400">
                Uses your Booking confirmation template. Nothing is sent if the client has no email on file.
              </span>
            )}
          </span>
        </label>
      </div>
    </Modal>
  );
}
