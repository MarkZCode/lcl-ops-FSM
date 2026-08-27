"use client";

import { useState, useRef, useEffect } from "react";
import { FiPlus, FiTrash2, FiDownload, FiMinusCircle } from "react-icons/fi";
import Modal from "./Modal";
import { DISCOUNT_PRESETS } from "@/lib/constants";
import { INVOICE_PRESETS } from "@/lib/invoiceConfig";
import { gbp } from "@/lib/format";
import { useStore } from "@/lib/store";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

let counter = 0;
// type: "charge" (default) | "discount" — a discount line's `price` is
// entered as a positive amount (more intuitive than typing a minus sign)
// and gets SUBTRACTED from the subtotal at calculation time.
const newLine = (desc = "", price = "", qty = 1, type = "charge") => ({
  id: ++counter,
  desc,
  price,
  qty,
  type,
});

// `prefill` (optional) = { invNo, clientName, clientAddr, propAddr1, propAddr2, lines }
// `docType` = "invoice" (default) | "quote"
// `onSave` (optional) = (lines) => void — when passed, the footer button saves
// the edited line items back to the caller instead of downloading a PDF.
export default function InvoiceModal({ open, onClose, prefill, docType = "invoice", onSave }) {
  const isQuote = docType === "quote";
  const { invoiceSeq, advanceInvoiceSeq } = useStore();
  const [invNo, setInvNo] = useState(String(invoiceSeq));
  const [dateISO, setDateISO] = useState(todayISO());
  const [clientName, setClientName] = useState("");
  const [clientAddr, setClientAddr] = useState("");
  const [propAddr1, setPropAddr1] = useState("");
  const [propAddr2, setPropAddr2] = useState("");
  const [notes, setNotes] = useState("");
  const [taxOn, setTaxOn] = useState(false);
  const [taxRate, setTaxRate] = useState(20);
  const [lines, setLines] = useState([newLine()]);
  const initRef = useRef(null);

  useEffect(() => {
    if (!open) {
      initRef.current = null;
      return;
    }
    const currentSession = prefill?.invNo || prefill?.clientName || 'new';
    if (initRef.current === currentSession) return;
    initRef.current = currentSession;

    // Always start from the persisted next-invoice number (unless a specific
    // number was passed in), so each new invoice gets a fresh number.
    setInvNo(prefill?.invNo || String(invoiceSeq));
    if (prefill) {
      setClientName(prefill.clientName || "");
      setClientAddr(prefill.clientAddr || "");
      setPropAddr1(prefill.propAddr1 || "");
      setPropAddr2(prefill.propAddr2 || "");
      setLines(
        prefill.lines && prefill.lines.length
          ? prefill.lines.map((l) =>
              // A prefilled negative price (e.g. from a previously-saved
              // quote) is shown back as a discount line with a positive
              // amount, not a charge with a confusing minus sign.
              (parseFloat(l.price) || 0) < 0
                ? newLine(l.desc, Math.abs(parseFloat(l.price) || 0), l.qty || 1, "discount")
                : { ...newLine(l.desc, l.price, l.qty || 1), discounted: !!l.discounted }
            )
          : [newLine()]
      );
    } else {
      setLines([newLine()]);
    }
    setDateISO(todayISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setLine = (id, key, val) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: val } : l)));
  const delLine = (id) => setLines((prev) => prev.filter((l) => l.id !== id));
  const addPreset = (p) => setLines((prev) => [...prev, newLine(p.label, p.price, 1)]);
  const addDiscount = (label = "") => setLines((prev) => [...prev, newLine(label, "", 1, "discount")]);

  // Signed amount for one line — discount lines subtract, everything else adds.
  const lineAmount = (l) => {
    // A legacy `discounted` line (waived charge, shown but worth nothing)
    // contributes zero. Without this it was summed at full price.
    if (l.discounted) return 0;
    const amt = (parseFloat(l.price) || 0) * (parseFloat(l.qty) || 1);
    return l.type === "discount" ? -amt : amt;
  };

  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const chargeTotal = lines.filter((l) => l.type !== "discount").reduce((s, l) => s + lineAmount(l), 0);
  const discountTotal = lines.filter((l) => l.type === "discount").reduce((s, l) => s - lineAmount(l), 0);
  const tax = taxOn ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + tax;

  const [generating, setGenerating] = useState(false);

  // Bake the discount sign into `price` for whatever consumes these lines
  // next (PDF generator, onSave callback) — they just see a negative-price
  // line and sum it normally; no downstream code needs to know about the
  // "discount" concept.
  const signedLines = () =>
    lines.map(({ desc, price, qty, type, discounted }) => ({
      desc, qty, ...(discounted ? { discounted: true } : {}),
      price: type === "discount" ? -Math.abs(parseFloat(price) || 0) : price,
    }));

  const handleSave = () => {
    onSave(signedLines());
    onClose();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    // Load the PDF generator (jsPDF + logo) on demand — keeps it out of the
    // job page's initial bundle so the page loads fast.
    const { generateInvoicePDF } = await import("@/lib/generateInvoice");
    generateInvoicePDF({
      docType,
      invNo,
      dateISO,
      clientName,
      clientAddr,
      propAddr1,
      propAddr2,
      notes,
      taxOn,
      taxRate,
      lines: signedLines(),
    });
    setGenerating(false);
    // Quotes don't consume an invoice number; only invoices advance the counter.
    if (!isQuote) {
      advanceInvoiceSeq(invNo);
      const next = parseInt(invNo, 10);
      if (!isNaN(next)) setInvNo(String(next + 1));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={onSave ? `Edit ${isQuote ? "quote" : "invoice"}` : isQuote ? "Create quote" : "Create invoice"}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Close
          </button>
          {onSave ? (
            <button className="btn-primary" onClick={handleSave}>
              Save changes ({gbp(total)})
            </button>
          ) : (
            <button className="btn-primary" onClick={handleGenerate}>
              <FiDownload /> {isQuote ? "Generate quote" : "Generate PDF"} ({gbp(total)})
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Invoice details */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Invoice number</label>
            <input className="input" value={invNo} onChange={(e) => setInvNo(e.target.value)} />
          </div>
          <div>
            <label className="label">Date issued</label>
            <input
              type="date"
              className="input"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
            />
          </div>
        </div>

        {/* Client */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Client / company name</label>
            <input
              className="input"
              placeholder="e.g. Alex Arkentis"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Client billing address (optional)</label>
            <input
              className="input"
              value={clientAddr}
              onChange={(e) => setClientAddr(e.target.value)}
            />
          </div>
        </div>

        {/* Property */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Property address line 1</label>
            <input
              className="input"
              placeholder="e.g. Flat 63, Albany Mansions"
              value={propAddr1}
              onChange={(e) => setPropAddr1(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Property address line 2</label>
            <input
              className="input"
              placeholder="e.g. Albert Bridge Road, London SW11 4PQ"
              value={propAddr2}
              onChange={(e) => setPropAddr2(e.target.value)}
            />
          </div>
        </div>

        {/* Quick-add presets */}
        <div>
          <label className="label">Quick add</label>
          <div className="flex flex-wrap gap-1.5">
            {INVOICE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => addPreset(p)}
                className="rounded-full border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-500 hover:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick-add discounts — same idea as the charge presets above, but
            these add a discount-type line (subtracted from the total) with
            the amount left blank for the operator to fill in, since a
            discount is always negotiated per-job rather than fixed. */}
        <div>
          <label className="label">Quick add discount</label>
          <div className="flex flex-wrap gap-1.5">
            {DISCOUNT_PRESETS.map((label) => (
              <button
                key={label}
                onClick={() => addDiscount(label)}
                className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-500 hover:text-white"
              >
                − {label}
              </button>
            ))}
          </div>
        </div>

        {/* Line items */}
        <div>
          <label className="label">Line items</label>
          <div className="space-y-2">
            {lines.map((l) => {
              const isDiscount = l.type === "discount";
              return (
                <div
                  key={l.id}
                  className={`grid grid-cols-[1fr,90px,60px,36px] gap-2 rounded-lg ${
                    isDiscount ? "border border-rose-200 bg-rose-50/40 p-1.5 dark:border-rose-700/30 dark:bg-rose-950/10" : ""
                  }`}
                >
                  <input
                    className="input"
                    placeholder={isDiscount ? "e.g. Multiple property discount" : "Description"}
                    value={l.desc}
                    onChange={(e) => setLine(l.id, "desc", e.target.value)}
                  />
                  <div className="relative">
                    {isDiscount && (
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-rose-500">−</span>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={`input ${isDiscount ? "pl-5 text-rose-700" : ""}`}
                      placeholder="0.00"
                      title={isDiscount ? "Discount amount — enter as a positive number, it's subtracted automatically" : undefined}
                      value={l.price}
                      onChange={(e) => setLine(l.id, "price", e.target.value)}
                    />
                  </div>
                  <input
                    type="number"
                    className="input"
                    placeholder="1"
                    value={l.qty}
                    onChange={(e) => setLine(l.id, "qty", e.target.value)}
                  />
                  <button
                    onClick={() => delLine(l.id)}
                    className="grid place-items-center rounded-lg border border-navy-200 text-rose-500 hover:bg-rose-50"
                    aria-label="Remove line"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setLines((prev) => [...prev, newLine()])}
              className="w-full rounded-lg border border-dashed border-brand-300 bg-brand-50/50 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <FiPlus className="-mt-0.5 mr-1 inline" /> Add line
            </button>
            <button
              onClick={() => addDiscount()}
              className="w-full rounded-lg border border-dashed border-rose-300 bg-rose-50/50 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              <FiMinusCircle className="-mt-0.5 mr-1 inline" /> Add discount
            </button>
          </div>
        </div>

        {/* Tax + totals */}
        <div className="flex flex-col items-end gap-2 border-t border-navy-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-navy-600">
            <input
              type="checkbox"
              checked={taxOn}
              onChange={(e) => setTaxOn(e.target.checked)}
              className="h-4 w-4 rounded border-navy-300 text-brand-500 focus:ring-brand-400"
            />
            Add VAT
            <input
              type="number"
              className="input w-16 py-1"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              disabled={!taxOn}
            />
            %
          </label>
          <div className="w-full max-w-[240px] space-y-1 text-sm">
            {discountTotal > 0 && (
              <>
                <div className="flex justify-between text-navy-500">
                  <span>Charges</span>
                  <span>{gbp(chargeTotal)}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Discount</span>
                  <span>−{gbp(discountTotal)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-navy-500">
              <span>Subtotal</span>
              <span>{gbp(subtotal)}</span>
            </div>
            {taxOn && (
              <div className="flex justify-between text-navy-500">
                <span>VAT ({taxRate}%)</span>
                <span>{gbp(tax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-navy-100 pt-1 text-base font-bold text-navy-900">
              <span>Total due</span>
              <span className="text-brand-600">{gbp(total)}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Notes (optional)</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
