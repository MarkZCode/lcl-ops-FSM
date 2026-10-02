// Builds the invoice/quote line + header data from a job, so the Invoice button
// AND the "attach to email" flow produce identical documents.
import { getJobLines, lineTotal, lineGross, jobDiscount } from "./format";

const fmtOff = (n) => `£${(Number(n) || 0).toFixed(2)}`;

export function buildInvoiceLines(job) {
  const lines = getJobLines(job).flatMap((l) => {
    const qty = l.qty || 1;
    const hasOverride = l.total != null && l.total !== "";
    const tierSuffix = l.tier ? ` (${l.tier})` : "";
    // Waived add-on (parking/congestion): show the ORIGINAL amount struck through
    // and marked discounted, but it adds £0 to the invoice total.
    // A WAIVED line — charged to the customer at £0 but still shown, so they
    // can see what they were given rather than the charge quietly vanishing.
    //
    // This used to be a single line at its FULL price carrying a `discounted`
    // flag, and every consumer had to remember to treat that flag as "worth
    // nothing". The invoice builder didn't: it dropped the flag the moment it
    // seeded its editor, so a waived £5 parking charge came back as an
    // ordinary £5 charge and the customer was billed for it. Emitting the
    // charge and its offset as two real lines means the arithmetic works
    // everywhere by itself, with no flag to forget.
    // A service that was cancelled and NOT charged: shown with its offset,
    // named as not carried out, so the client sees it was on the booking and
    // that they aren't paying for it — rather than a line that silently
    // vanished from what they were quoted.
    if (l.cancelled && l.waived) {
      const gross = lineGross(l);
      return [
        { desc: l.name + tierSuffix, price: gross, qty: 1, code: l.code },
        { desc: `${l.name} — not carried out${l.cancelReasonLabel ? ` (${l.cancelReasonLabel.toLowerCase()})` : ""}, not charged`, price: -gross, qty: 1, code: l.code },
      ];
    }
    if (l.waived) {
      const gross = lineGross(l);
      return [
        { desc: l.name + tierSuffix, price: gross, qty: 1, code: l.code },
        { desc: `${l.name} — waived`, price: -gross, qty: 1, code: l.code },
      ];
    }
    // Cancelled but charged anyway (late cancellation, no access on the
    // day). Billed at its price, and says why — an unexplained charge for a
    // certificate the client never received is the invoice that gets
    // disputed.
    if (l.cancelled) {
      return {
        desc: `${l.name}${tierSuffix} — not carried out${l.cancelReasonLabel ? ` (${l.cancelReasonLabel.toLowerCase()})` : ""}, charged per our terms`,
        price: lineTotal(l),
        qty: 1,
        code: l.code,
      };
    }
    // Gas (tiered) or a manually-priced line bills as a single line at its
    // exact total; standard lines bill as unit price × quantity.
    // A per-line discount has to reach the invoice, or the customer is billed
    // MORE than the job says they owe. This branch was missing entirely: a
    // standard line billed as unit x qty, which is the price BEFORE the
    // discount, so a £30 goodwill discount on a £150 EICR produced a £220 job
    // and a £250 invoice. Bill the true payable amount and name the discount
    // on the line so the customer can see what they were given.
    const off = Math.max(0, Number(l.discount) || 0);
    if (off > 0) {
      return {
        desc: `${l.name}${tierSuffix}${qty > 1 ? ` x${qty}` : ""} — ${fmtOff(off)} off`,
        price: lineTotal(l),
        qty: 1,
        code: l.code,
      };
    }
    if (l.code === "GAS" || hasOverride) {
      return {
        desc:
          l.name +
          tierSuffix +
          (l.code === "GAS" && qty > 1 ? ` (${qty} appliances)` : ""),
        price: lineTotal(l),
        qty: 1,
        code: l.code,
      };
    }
    return { desc: l.name + tierSuffix, price: Number(l.unit) || 0, qty, code: l.code };
  });

  // A whole-job discount is its own line rather than being spread across the
  // services — that's how it was agreed with the customer ("£20 off the lot"),
  // and burying it inside the line prices hides what they were given.
  // Named on the invoice — "Referral Discount" tells the customer why they
  // got it, where a bare "Discount" invites the question.
  const off = jobDiscount(job);
  if (off > 0) lines.push({ desc: job?.discountReason || "Discount", price: -off, qty: 1 });
  return lines;
}

// Where a job keeps the details saved from the "Edit invoice" / "Edit quote"
// popup — e.g. a client who wants the invoice made out to a different name
// or billing address.
export const overridesKey = (docType) => (docType === "quote" ? "quoteOverrides" : "invoiceOverrides");

export function buildInvoicePrefill(job, client, property, docType = "invoice") {
  const base = {
    // Made out to whoever pays: the billing party when the client has one
    // (an agent booking for a landlord), otherwise the client.
    clientName: client?.billingName || client?.name || "",
    clientAddr: client?.billingAddress || client?.company || "",
    propAddr1: property?.label || "",
    propAddr2: property?.postcode || "",
    lines: buildInvoiceLines(job),
    ...(docType === "quote" && Number(job?.noAccessFee) > 0 ? { noAccessFee: Number(job.noAccessFee) } : {}),
  };
  // Saved edits win over what's derived from the client/job, so a changed
  // name or address sticks on every re-open, send and re-download.
  const saved = job?.[overridesKey(docType)];
  if (!saved) return base;
  return {
    ...base,
    ...["clientName", "clientAddr", "propAddr1", "propAddr2"].reduce(
      (o, k) => (typeof saved[k] === "string" ? { ...o, [k]: saved[k] } : o),
      {}
    ),
    lines: saved.lines?.length ? saved.lines : base.lines,
  };
}
