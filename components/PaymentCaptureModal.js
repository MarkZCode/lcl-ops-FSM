"use client";

// PaymentCaptureModal — appears on the invoiced -> paid transition so the
// operator can confirm whether invoice was paid, record method/date/reference,
// and guide the flow to certificate upload and sending.

import { useEffect, useState, useRef } from "react";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";
import Modal from "./Modal";
import { toast } from "@/lib/toast";
import { gbp } from "@/lib/format";

const METHODS = [
  { code: "bank_transfer", label: "Bank transfer (BACS)" },
  { code: "card",          label: "Card" },
  { code: "cash",          label: "Cash" },
  { code: "other",         label: "Other" },
];

export default function PaymentCaptureModal({ open, onClose, job, client, onSave, onNotPaid }) {
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const initRef = useRef(null);

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = `job-${job?.id || "none"}`;
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    setMethod(job?.paymentMethod || "bank_transfer");
    setDate(job?.paidAt ? job.paidAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setReference(job?.paymentRef || job?.invoiceNumber || job?.id || "");
    setAmount(job?.price != null ? String(job.price) : "");
  }, [open, job]);

  const submit = () => {
    if (!date) { toast.error("Date required"); return; }
    onSave({
      status: "paid",
      paidAt: new Date(date).toISOString(),
      paymentMethod: method,
      paymentRef: reference.trim(),
      paymentAmount: Number(amount) || 0,
    });
    onClose();
  };

  const handleNotPaid = () => {
    if (onNotPaid) {
      onNotPaid();
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invoice payment · ${job?.id || ""}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button type="button" className="btn-secondary text-xs sm:text-sm" onClick={handleNotPaid}>
            <FiXCircle /> Not paid yet
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-outline text-xs sm:text-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex items-center gap-2 text-xs sm:text-sm" onClick={submit}>
              <FiCheckCircle /> Yes — Mark as paid
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-navy-100 bg-navy-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Payment check</p>
          <p className="mt-1 text-base font-bold text-navy-900 dark:text-slate-100">
            Has this invoice been paid by the client?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-600 dark:text-slate-300">
            {client?.name && <span>Client: <strong>{client.name}</strong></span>}
            <span>Amount: <strong>{gbp(job?.price)}</strong></span>
            <span>Ref: <strong>{job?.id}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Payment method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount received (£)</label>
            <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Date received</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Payment reference</label>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BACS ref, bank txn id…" />
          </div>
        </div>

        <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          💡 <strong>What happens next:</strong> Marking as paid will advance the job to <strong>Paid</strong> and immediately guide you to <strong>upload and send the certificate</strong>.
        </div>
      </div>
    </Modal>
  );
}
