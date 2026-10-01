"use client";

// Deposits, part payments and credit notes on a job, and the balance left.
// Sits in the Payment panel above the Mark-as buttons.
import { useState } from "react";
import { FiPlus, FiTrash2, FiFileMinus, FiLink } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { gbp, fmtDate, jobPayable } from "@/lib/format";
import { jobBalance, jobReceived, jobCredited } from "@/lib/payments";
import { buildInvoicePrefill } from "@/lib/invoiceData";
import { toast } from "@/lib/toast";

const METHODS = ["Bank transfer", "Card", "Cash", "Other"];
const today = () => new Date().toISOString().slice(0, 10);

export default function PaymentLedger({ job, client, property, onPaidInFull }) {
  const { updateJob, logActivity } = useStore();
  const { user } = useAuth();
  const [mode, setMode] = useState(null); // "pay" | "credit"
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState(METHODS[0]);
  const [note, setNote] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const who = user?.name || user?.username || "";

  const payments = job.payments || [];
  const credits = job.creditNotes || [];
  const balance = jobBalance(job);
  const open = (m) => { setMode(m); setAmount(m === "pay" ? String(balance || "") : ""); setDate(today()); setNote(""); };

  const savePayment = () => {
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(amt > 0)) return;
    const next = [...payments, { id: "pay-" + Date.now().toString(36), amount: amt, date, method, ref: note.trim(), by: who }];
    updateJob(job.id, { payments: next });
    logActivity(job.id, { type: "payment", title: `Payment received · ${gbp(amt)} (${method.toLowerCase()})`, detail: note.trim(), by: who });
    setMode(null);
    const left = jobBalance({ ...job, payments: next });
    if (left <= 0 && job.status !== "paid") onPaidInFull?.();
    else toast.success(`${gbp(left)} still owed.`);
  };

  const saveCredit = async () => {
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(amt > 0) || note.trim().length < 3) return;
    const number = `CN-${job.invoiceNumber || job.id.replace(/^JOB-/, "")}-${credits.length + 1}`;
    const next = [...credits, { id: "cn-" + Date.now().toString(36), number, amount: amt, reason: note.trim(), at: new Date().toISOString(), by: who }];
    updateJob(job.id, { creditNotes: next });
    logActivity(job.id, { type: "payment", title: `Credit note ${number} · ${gbp(amt)}`, detail: note.trim(), by: who });
    setMode(null);
    try {
      const { generateInvoicePDF } = await import("@/lib/generateInvoice");
      const base = buildInvoicePrefill(job, client, property, "invoice");
      generateInvoicePDF({
        ...base, docType: "credit", invNo: number, dateISO: today(),
        againstInvoice: job.invoiceNumber || job.id,
        lines: [{ desc: note.trim(), price: amt, qty: 1 }],
      });
    } catch { toast.error("Saved, but the PDF couldn't be made."); }
  };

  const remove = (kind, id) => {
    if (!window.confirm("Remove this record?")) return;
    updateJob(job.id, kind === "pay" ? { payments: payments.filter((p) => p.id !== id) } : { creditNotes: credits.filter((c) => c.id !== id) });
  };

  // Card payment link (Stripe). Only works once STRIPE_SECRET_KEY is set on
  // the server; until then the server says so and nothing is created.
  const payLink = async () => {
    setLinkBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/pay-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data?.session?.access_token || ""}` },
        body: JSON.stringify({ jobId: job.id, amount: balance }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.notConfigured) { toast("Card payments aren't set up yet — it needs a Stripe account connected."); return; }
      if (!r.ok || !d.url) throw new Error(d.error || "Couldn't create the link.");
      await navigator.clipboard.writeText(d.url).catch(() => {});
      updateJob(job.id, { payLinkUrl: d.url, payLinkAt: new Date().toISOString() });
      toast.success("Payment link copied — paste it to the client.");
    } catch (e) {
      toast.error(String(e.message || e));
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-navy-100 p-3 text-xs">
      <div className="grid grid-cols-2 gap-y-1">
        <span className="text-navy-500">Job total</span><span className="text-right font-medium text-navy-800">{gbp(jobPayable(job))}</span>
        {credits.length > 0 && (<><span className="text-navy-500">Credit notes</span><span className="text-right font-medium text-navy-800">−{gbp(jobCredited(job))}</span></>)}
        {payments.length > 0 && (<><span className="text-navy-500">Received</span><span className="text-right font-medium text-brand-700">−{gbp(jobReceived(job))}</span></>)}
        <span className="border-t border-navy-100 pt-1 font-semibold text-navy-700">Balance owed</span>
        <span className={`border-t border-navy-100 pt-1 text-right font-bold ${balance > 0 ? "text-navy-900" : "text-brand-700"}`}>{gbp(balance)}</span>
      </div>

      {(payments.length > 0 || credits.length > 0) && (
        <ul className="mt-2 space-y-1 border-t border-navy-100 pt-2">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-navy-600">
              <span className="min-w-0 truncate">{fmtDate(p.date)} · {p.method}{p.ref ? ` · ${p.ref}` : ""}</span>
              <span className="flex shrink-0 items-center gap-2"><strong className="text-navy-800">{gbp(p.amount)}</strong>
                <button type="button" aria-label="Remove payment" className="text-navy-300 hover:text-rose-500" onClick={() => remove("pay", p.id)}><FiTrash2 /></button></span>
            </li>
          ))}
          {credits.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-navy-600">
              <span className="min-w-0 truncate">{c.number} · {c.reason}</span>
              <span className="flex shrink-0 items-center gap-2"><strong className="text-navy-800">−{gbp(c.amount)}</strong>
                <button type="button" aria-label="Remove credit note" className="text-navy-300 hover:text-rose-500" onClick={() => remove("credit", c.id)}><FiTrash2 /></button></span>
            </li>
          ))}
        </ul>
      )}

      {mode ? (
        <div className="mt-2 space-y-2 border-t border-navy-100 pt-2">
          <p className="font-semibold text-navy-700">{mode === "pay" ? "Record a payment" : "Issue a credit note"}</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="number" min="0" step="0.01" placeholder="Amount £" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {mode === "pay"
              ? <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              : <span />}
            {mode === "pay" && (
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            )}
            <input className={`input ${mode === "pay" ? "" : "col-span-2"}`} placeholder={mode === "pay" ? "Reference (optional)" : "Reason — shown on the credit note"} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary py-1.5 text-xs" onClick={mode === "pay" ? savePayment : saveCredit}>{mode === "pay" ? "Save payment" : "Save and download"}</button>
            <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-3 border-t border-navy-100 pt-2">
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700" onClick={() => open("pay")}><FiPlus /> Part payment</button>
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-navy-600 hover:text-navy-800" onClick={() => open("credit")}><FiFileMinus /> Credit note</button>
          {balance > 0 && (
            <button type="button" disabled={linkBusy} className="inline-flex items-center gap-1 font-semibold text-navy-600 hover:text-navy-800" onClick={payLink}><FiLink /> {linkBusy ? "Creating…" : "Card payment link"}</button>
          )}
        </div>
      )}
    </div>
  );
}
