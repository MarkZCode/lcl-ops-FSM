"use client";

// Settings → Bank accounts. The approved accounts an invoice can ask to be
// paid into. Which one goes on an invoice is chosen when the invoice is made
// and stays chosen until someone picks another.
import { useState } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiCheckCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { pickBank, bankLabel } from "@/lib/bank";

const FIELDS = [
  ["label", "Name for this account (only you see it)"],
  ["accountHolder", "Account holder"],
  ["accountNumber", "Account number"],
  ["sortCode", "Sort code"],
  ["bankName", "Bank"],
  ["iban", "IBAN (optional)"],
  ["bic", "BIC / SWIFT (optional)"],
];

export default function BankAccounts() {
  const { bankAccounts, invoiceBankId, saveBankAccount, removeBankAccount, setInvoiceBank } = useStore();
  const [form, setForm] = useState(null);
  const active = pickBank(bankAccounts, invoiceBankId);
  const ok = form && form.accountHolder?.trim() && form.accountNumber?.trim() && form.sortCode?.trim();

  return (
    <section>
      <h2 className="mb-3 section-label text-sm">Bank accounts</h2>
      <div className="card p-5">
        <p className="text-xs text-navy-500">The account marked “On new invoices” is the one printed on the next invoice. You can also switch it from the invoice screen itself — the choice stays until it&apos;s changed. An invoice already sent keeps the account it went out with.</p>
        <ul className="mt-3 divide-y divide-navy-100">
          {bankAccounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-navy-900">{bankLabel(a)}</span>
                <span className="block text-xs text-navy-500">{a.accountHolder} · {a.sortCode} · {a.accountNumber}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {a.id === active.id ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"><FiCheckCircle /> On new invoices</span>
                ) : (
                  <button className="btn-outline py-1 text-xs" onClick={() => setInvoiceBank(a.id)}>Use on new invoices</button>
                )}
                <button className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-navy-500 hover:text-brand-600" aria-label="Edit account" onClick={() => setForm({ ...a })}><FiEdit2 className="h-3.5 w-3.5" /></button>
                {bankAccounts.length > 1 && (
                  <button className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-rose-500 hover:bg-rose-50" aria-label="Remove account" onClick={() => window.confirm(`Remove ${bankLabel(a)}?`) && removeBankAccount(a.id)}><FiTrash2 className="h-3.5 w-3.5" /></button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {form ? (
          <div className="mt-3 space-y-2 border-t border-navy-100 pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FIELDS.map(([k, ph]) => (
                <input key={k} className="input" placeholder={ph} value={form[k] || ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary py-1.5 text-xs" disabled={!ok} onClick={() => { saveBankAccount({ ...form, label: form.label?.trim() || `${form.accountHolder} · ${form.bankName || ""}`.trim() }); setForm(null); }}>Save account</button>
              <button className="btn-outline py-1.5 text-xs" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-outline mt-3 py-1.5 text-xs" onClick={() => setForm({ label: "", accountHolder: "", accountNumber: "", sortCode: "", bankName: "", iban: "", bic: "" })}><FiPlus /> Add account</button>
        )}
      </div>
    </section>
  );
}
