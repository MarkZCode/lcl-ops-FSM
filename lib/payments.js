// Money actually received against a job, and what's still owed.
//
// A job used to be simply "paid" or not. Deposits, part payments and credit
// notes all needed a note in the thread and some arithmetic. These are the
// records and the one sum, so the balance shown anywhere is the same number.
//   job.payments    = [{ id, amount, date, method, ref, by }]
//   job.creditNotes = [{ id, number, amount, reason, at, by }]
import { jobPayable } from "./format";

const sum = (list, key = "amount") => (list || []).reduce((a, x) => a + (Number(x?.[key]) || 0), 0);
const r2 = (n) => Math.round(n * 100) / 100;

export function jobReceived(job) { return r2(sum(job?.payments)); }
export function jobCredited(job) { return r2(sum(job?.creditNotes)); }

// What the client still owes. A job marked paid with no payment records is
// taken at its word: balance 0.
export function jobBalance(job) {
  if (!job) return 0;
  const due = r2(jobPayable(job) - jobCredited(job));
  if (job.status === "paid") return 0;
  return Math.max(0, r2(due - jobReceived(job)));
}

// ── Matching a bank statement to invoices ───────────────────────────────
// Takes whatever was pasted from online banking — CSV or copied rows — and
// pulls out each line's amount and text. Money IN only: a line with a
// leading minus is skipped.
export function parseBankLines(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const amounts = [...line.matchAll(/(-?)£?\s?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\b/g)]
      .map((m) => ({ neg: m[1] === "-", value: Number(`${m[2].replace(/,/g, "")}.${m[3]}`) }))
      .filter((a) => !a.neg && a.value > 0);
    if (!amounts.length) continue;
    out.push({ id: `bl-${out.length}`, text: line, amount: amounts[0].value, amounts: amounts.map((a) => a.value) });
  }
  return out;
}

// For each statement line, the unpaid invoice it most likely pays. A match
// needs the reference (job id or invoice number) in the text, or — failing
// that — the exact amount together with the client's surname. An amount on
// its own is never enough: two £65 invoices are common.
export function matchPayments(lines, jobs = [], clients = []) {
  const open = jobs.filter((j) => j.status === "invoiced" || (j.status === "completed" && Number(j.price) > 0));
  const clientOf = new Map(clients.map((c) => [c.id, c]));
  const used = new Set();
  return lines.map((ln) => {
    const hay = ln.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let best = null;
    for (const j of open) {
      if (used.has(j.id)) continue;
      const bal = jobBalance(j);
      const amountOk = ln.amounts.some((a) => Math.abs(a - bal) < 0.005);
      const idRef = String(j.id).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const invRef = j.invoiceNumber ? String(j.invoiceNumber) : "";
      const refHit = hay.includes(idRef) || (invRef.length >= 3 && new RegExp(`(INV|INVOICE|REF)?0*${invRef}(?!\\d)`).test(hay) && amountOk);
      const surname = String(clientOf.get(j.clientId)?.name || "").trim().split(/\s+/).pop().toUpperCase().replace(/[^A-Z]/g, "");
      const nameHit = surname.length >= 4 && hay.includes(surname);
      let score = 0, why = "";
      if (refHit && amountOk) { score = 3; why = "reference and amount match"; }
      else if (refHit) { score = 2; why = `reference matches, but the amount differs (owed £${bal.toFixed(2)})`; }
      else if (nameHit && amountOk) { score = 1; why = "client surname and amount match"; }
      if (score && (!best || score > best.score)) best = { job: j, score, why, exact: amountOk };
    }
    if (best) used.add(best.job.id);
    return { line: ln, match: best };
  });
}
