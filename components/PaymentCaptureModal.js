"use client";

// PaymentCaptureModal — appears on the invoiced → paid transition so the
// operator can record method/date/reference. Persists onto the job for
// accountant reports (handoff §4.7).

import { useEffect, useState, useRef } from "react";
import { FiDollarSign } from "react-icons/fi";
import Modal from "./Modal";
import { toast } from "@/lib/toast";

const METHODS = [
  { code: "bank_transfer", label: "Bank transfer (BACS)" },
  { code: "card",          label: "Card" },
  { code: "cash",          label: "Cash" },
  { code: "other",         label: "Other" },
];

export default function PaymentCaptureModal({ open, onClose, job, onSave }) {
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
    const currentSession = `job-${job?.id || 'none'}`;
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
    toast.success("Payment captured");
  };

  return (
    <Modal open={open} onClose={onClose} title={`Capture payment · ${job?.id || ""}`}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary flex items-center gap-2" onClick={submit}>
          <FiDollarSign /> Mark paid
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
        </div>
        <div><label className="label">Amount (£)</label>
          <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div><label className="label">Date received</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div><label className="label">Reference</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BACS ref, txn id…" />
        </div>
      </div>
      <p className="mt-3 text-xs text-navy-500 dark:text-slate-400">
        Saved on the job so it feeds the accountant export and the Payments report.
      </p>
    </Modal>
  );
}
