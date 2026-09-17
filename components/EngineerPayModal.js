"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { FiCheckCircle, FiUploadCloud, FiTrash2, FiExternalLink, FiImage, FiFileText, FiEdit2, FiRotateCcw } from "react-icons/fi";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { gbp, fmtDate, getJobLines, isAddonCode } from "@/lib/format";
import { grossUpTransfer, certificationRateForLine, inspectionRateForLine, rateForLine } from "@/lib/finance";
import { certificationForEngineer, certificationPatch } from "@/lib/visits";
import { DEFAULT_TRANSFER_FEE } from "@/lib/constants";
import { uploadFile, removeFile, fileSrc } from "@/lib/uploads";
// generateEngineerStatement is lazy-imported in downloadStatement — it pulls
// jsPDF + the base64 logo (~150kB) which would otherwise bloat /reports.

export default function EngineerPayModal({
  open,
  onClose,
  row,
  engineer,
  range,
  onPay,
  onRemovePayment,
}) {
  const { updateJob, jobs, engineers } = useStore();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  // Which job's Payable cell is mid-edit (manual override), and its draft value.
  const [editingJobId, setEditingJobId] = useState(null);
  const [overrideDraft, setOverrideDraft] = useState("");
  // Which jobs the payment box is about to settle. A Set, not a single id:
  // paying one job and paying a hand-picked group of them are the same
  // action with a different number of rows ticked, and one transfer covering
  // three jobs costs one bank fee instead of three.
  // Empty = pay the whole outstanding balance.
  const [selectedJobIds, setSelectedJobIds] = useState(() => new Set());
  // Which job's breakdown is open underneath. Clicking a row INSPECTS it;
  // ticking its box selects it for a combined payment. Those are two different
  // intentions and the row click used to do only the second, so there was no
  // way to see what a figure was actually made of before paying it.
  const [focusedJobId, setFocusedJobId] = useState(null);
  // Write a manual amount against THIS engineer on that job, never job-wide.
  // A job-level figure was applied to everyone working the job, so setting
  // one person's fee silently pinned their colleague's to the same number
  // (see payOverrideFor in lib/finance.js). Any legacy job-level value is
  // cleared as it's replaced, so the two can't disagree afterwards.
  const setPayOverride = (jobId, value) => {
    const job = jobs.find((x) => x.id === jobId);
    const existing = (job && job.engineerPayOverrides) || {};
    const next = { ...existing };
    if (value === null || value === "") delete next[engineer.id];
    else next[engineer.id] = Number(value);
    updateJob(jobId, { engineerPayOverrides: next, engineerPayOverride: null });
  };

  const toggleJob = (jobId) =>
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });

  // Switching engineer (or closing) clears the tick list — carrying a
  // selection between two people's statements is never what's meant.
  useEffect(() => {
    setSelectedJobIds(new Set());
    setAmount("");
    setFocusedJobId(null);
  }, [engineer?.id, open]);

  if (!row || !engineer) return null;

  const unsettled = (row.jobDetails || []).filter((j) => !j.settled);
  const chosen = unsettled.filter((j) => selectedJobIds.has(j.jobId));
  const chosenTotal = chosen.reduce((s2, j) => s2 + (Number(j.owed) || 0), 0);
  // Tick some rows and the box pays exactly those; tick none and it pays the
  // whole balance, which is what it always did.
  const defaultAmount = chosen.length
    ? chosenTotal.toFixed(2)
    : (row.balance > 0 ? row.balance : row.owed).toFixed(2);
  const payAmount = amount !== "" ? Number(amount) : Number(defaultAmount);
  // The amount above is what the engineer must RECEIVE. The bank takes its fee
  // out of the transfer, so the figure actually typed into the banking app has
  // to be grossed up — otherwise they land short by the fee every single time.
  const transfer = grossUpTransfer(payAmount, DEFAULT_TRANSFER_FEE);

  // Column totals for the job table. Settled jobs still appear in the list
  // (with their real value) but are excluded from what's still owed — without
  // both figures side by side the header "Total owed" looks like it disagrees
  // with the rows above it.
  const jd = row.jobDetails || [];
  const sum = (fn) => jd.reduce((s, j) => s + (Number(fn(j)) || 0), 0);
  const totals = {
    revenue: sum((j) => j.revenue),
    labour: sum((j) => j.labour),
    vat: sum((j) => j.vat),
    parking: sum((j) => j.parkingReimbursed),
    payableAll: sum((j) => j.owed),
    payableUnsettled: jd.filter((j) => !j.settled).reduce((s, j) => s + (Number(j.owed) || 0), 0),
    settledCount: jd.filter((j) => j.settled).length,
  };

  // row.payments is every payment DATED inside this range, whichever job it
  // actually covers — a transfer for a job from a different period that
  // happened to be sent this period is real money, but it isn't money paid
  // for one of THIS PERIOD'S JOBS, so it doesn't belong in a view titled
  // "RIZWAN · 1 Aug – 27 Aug" listing exactly 2 jobs. Scoping "Cash out" and
  // the payment list to only payments that name one of this period's jobs
  // keeps every figure on this screen about the same 2 jobs it's showing.
  const periodJobIds = new Set(jd.map((j) => j.jobId));
  const periodPayments = (row.payments || []).filter((p) =>
    (p.jobIds || []).some((id) => periodJobIds.has(id))
  );
  const periodPaid = periodPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const periodTransferFees = periodPayments.reduce((s, p) => s + (Number(p.transferFee) || 0), 0);
  const periodCashOut = periodPaid + periodTransferFees;

  const handleFile = async (file) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Upload an image or PDF.");
      return;
    }
    if (file.size > 9 * 1024 * 1024) {
      setError("File too large (max 9 MB).");
      return;
    }
    setBusy(true);
    const up = await uploadFile(file, `engineer-payments/${engineer.id}`);
    setProof(up);
    setBusy(false);
  };

  // Pay a single job. The whole point of dropping "Mark settled": one click
  // records real money against one job, and that record is what marks it paid.
  const payOneJob = (j) => {
    const t = grossUpTransfer(j.owed, DEFAULT_TRANSFER_FEE);
    if (t.earnings <= 0) return;
    onPay({
      engineerId: engineer.id,
      jobIds: [j.jobId],
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      periodLabel: range.label,
      amount: t.earnings,
      transferFee: t.fee,
      amountSent: t.send,
      paidAt: new Date().toISOString(),
      notes: `Job ${j.jobId}`,
      proof: null,
    });
  };

  const submitPayment = () => {
    if (!payAmount || payAmount <= 0) {
      setError("Enter a payment amount.");
      return;
    }
    onPay({
      engineerId: engineer.id,
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      periodLabel: range.label,
      // Which jobs this payment settles. Without this a bulk payment records
      // money but leaves every job still showing as owed — the exact
      // "I paid them but it still says unpaid" confusion.
      jobIds: chosen.length ? chosen.map((j) => j.jobId) : unsettled.map((j) => j.jobId),
      // amount = engineer earnings (settles their balance)
      // transferFee / amountSent = company cash cost of moving the money
      amount: transfer.earnings,
      transferFee: transfer.fee,
      amountSent: transfer.send,
      paidAt: new Date().toISOString(),
      notes: notes.trim(),
      proof,
    });
    setAmount("");
    setNotes("");
    setProof(null);
    setError("");
    setSelectedJobIds(new Set());
  };

  const downloadStatement = async (paidAmount) => {
    const { generateEngineerStatementPDF } = await import("@/lib/generateEngineerStatement");
    const jobs = (row.jobDetails || []).map((j) => ({
      jobId: j.jobId,
      date: j.date,
      description: j.description,
      net: j.labour,
      vat: j.vat,
      parking: j.parkingReimbursed,
      total: j.owed,
    }));
    const totalNet = row.labour;
    const totalVat = row.vat;
    const totalParking = row.parkingReimbursed;
    const total = paidAmount != null ? paidAmount : row.owed;
    generateEngineerStatementPDF({
      statementNo: `${engineer.id}-${range.start.getTime()}`,
      dateISO: new Date().toISOString(),
      periodLabel: range.label,
      engineer: {
        name: engineer.name,
        company: engineer.company,
        bankName: engineer.bankName,
        bankAccountName: engineer.bankAccountName,
        bankSortCode: engineer.bankSortCode,
        bankAccountNumber: engineer.bankAccountNumber,
      },
      jobs,
      totals: { net: totalNet, vat: totalVat, parking: totalParking, total },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`${engineer.name} · ${range.label}`}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Close</button>
          {row.jobDetails?.length > 0 && (
            <button className="btn-outline" onClick={() => downloadStatement()}>
              <FiFileText /> Download statement
            </button>
          )}
          {row.balance > 0 && (
            <button className="btn-primary" onClick={submitPayment} title={`Engineer receives ${gbp(transfer.earnings)} — you send ${gbp(transfer.send)}`}>
              <FiCheckCircle /> Record payment · send {gbp(transfer.send)}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Summary — each figure says where it comes from, so "Total owed"
            can never look like it contradicts the job rows below. */}
        <div className="panel">
          <div className="metric-row">
            <div className="metric-cell">
              <p className="metric-label">Jobs</p>
              <div className="metric-figure"><span className="metric-value">{row.jobs}</span></div>
              <p className="metric-sub">
                {totals.settledCount > 0 ? `${totals.settledCount} already settled` : "None settled yet"}
              </p>
            </div>
            <div className="metric-cell">
              <p className="metric-label">Owed this period</p>
              <div className="metric-figure"><span className="metric-value">{gbp(row.owed)}</span></div>
              <p className="metric-sub">
                {totals.settledCount > 0
                  ? `of ${gbp(totals.payableAll)} total — settled excluded`
                  : "Unsettled jobs"}
              </p>
            </div>
            {/* Headline is the money that actually LEFT THE ACCOUNT. It read
                "Already paid £60.00" while £60.74 had gone out, so the tile
                and the payment history underneath disagreed on the same
                transfer. The engineer's own figure stays underneath, because
                that — not the gross — is what settles their balance. */}
            <div className="metric-cell">
              <p className="metric-label">{periodTransferFees > 0 ? "Cash out" : "Already paid"}</p>
              <div className="metric-figure"><span className="metric-value">{gbp(periodCashOut)}</span></div>
              <p className="metric-sub">
                {periodTransferFees > 0
                  ? `${gbp(periodPaid)} to them + ${gbp(periodTransferFees)} bank fees`
                  : "Recorded payments for these jobs"}
              </p>
            </div>
            <div className="metric-cell">
              <p className="metric-label">Due</p>
              <div className="metric-figure">
                <span className={`metric-value ${row.balance > 0 ? "delta-down" : ""}`}>{gbp(row.balance)}</span>
              </div>
              <p className="metric-sub">
                {row.balance > 0 ? `send ${gbp(grossUpTransfer(row.balance).send)} to clear` : "Fully settled"}
              </p>
            </div>
          </div>
        </div>

        {row.payType === "weekly" && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Weekly retainer: <strong>{gbp(row.weeklyRate)}</strong> per week + parking reimbursements.
          </p>
        )}

        {/* Job breakdown */}
        {row.jobDetails?.length > 0 ? (
          <div>
            <h3 className="mb-2 section-label text-xs">Jobs this period</h3>
            {/* No inner scroller and no sticky header.
                This table sat in its own `max-h-80 overflow-y-auto` box with a
                sticky <thead> — a scroll container nested inside the modal's
                own scroll container. That is what produced the header printed
                on top of the first row. A pay run is a handful of jobs, so the
                table simply renders at its natural height and the modal body
                does the scrolling: one scrollbar, and nothing to overlap. */}
            <div className="overflow-x-auto rounded-xl border border-navy-100">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-navy-50 text-[10px] uppercase tracking-wide text-navy-500">
                  <tr>
                    <th className="px-2 py-2 font-semibold" title="Tick jobs to pay them together in one transfer">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-3 py-2 font-semibold">Job</th>
                    <th className="px-2 py-2 text-right font-semibold">Revenue</th>
                    <th className="px-2 py-2 text-right font-semibold">Labour</th>
                    <th className="px-2 py-2 text-right font-semibold">VAT</th>
                    <th className="px-2 py-2 text-right font-semibold">Parking</th>
                    <th className="px-3 py-2 text-right font-semibold">Payable</th>
                    <th className="px-2 py-2 text-right font-semibold" title="What to transfer if you pay this job on its own (payable + the bank's per-transfer fee)">Send alone</th>
                    <th className="px-2 py-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {row.jobDetails.map((j) => (
                    <tr
                      key={j.jobId}
                      onClick={() => setFocusedJobId((cur) => (cur === j.jobId ? null : j.jobId))}
                      className={`cursor-pointer transition-colors ${j.settled ? "opacity-60" : ""} ${
                        focusedJobId === j.jobId
                          ? "bg-brand-50 ring-1 ring-inset ring-brand-300"
                          : selectedJobIds.has(j.jobId) ? "bg-brand-50" : "hover:bg-navy-50/50"
                      }`}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {!j.settled && (
                          <input
                            type="checkbox"
                            checked={selectedJobIds.has(j.jobId)}
                            onChange={() => { setAmount(""); toggleJob(j.jobId); }}
                            className="h-4 w-4 cursor-pointer accent-brand-500"
                            aria-label={`Include ${j.jobId} in this payment`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/jobs/${j.jobId}`} className="font-semibold text-brand-600 hover:underline" onClick={onClose}>
                          {j.jobId}
                        </Link>
                        {j.overridden && <p className="text-[10px] text-navy-400">Manual amount</p>}
                        {j.parking?.receiptSubmitted && (
                          <p className="text-[10px] text-navy-400">Receipt {gbp(j.parking.receiptAmount)}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-navy-700">{gbp(j.revenue)}</td>
                      <td className="px-2 py-2 text-right text-navy-700">{gbp(j.labour)}</td>
                      <td className="px-2 py-2 text-right text-navy-500">{j.vat > 0 ? gbp(j.vat) : "—"}</td>
                      <td className="px-2 py-2 text-right text-navy-500">{j.parkingReimbursed > 0 ? gbp(j.parkingReimbursed) : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {editingJobId === j.jobId ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              autoFocus
                              type="number" step="0.01" min="0"
                              className="input h-7 w-20 py-0.5 text-right text-xs"
                              value={overrideDraft}
                              onChange={(e) => setOverrideDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setPayOverride(j.jobId, overrideDraft === "" ? null : Number(overrideDraft));
                                  setEditingJobId(null);
                                }
                                if (e.key === "Escape") setEditingJobId(null);
                              }}
                            />
                            <button
                              type="button"
                              className="rounded px-1.5 py-1 text-brand-600 hover:bg-brand-50"
                              title="Save"
                              onClick={() => {
                                setPayOverride(j.jobId, overrideDraft === "" ? null : Number(overrideDraft));
                                setEditingJobId(null);
                              }}
                            >
                              <FiCheckCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-semibold text-amber-700">{gbp(j.owed)}</span>
                            <button
                              type="button"
                              className="rounded p-1 text-navy-300 hover:bg-navy-100 hover:text-navy-600"
                              title="Set a manual pay amount for this job (e.g. a reduced-rate reinspection)"
                              onClick={() => {
                                setEditingJobId(j.jobId);
                                setOverrideDraft(j.overridden ? String(j.labour) : "");
                              }}
                            >
                              <FiEdit2 className="h-3 w-3" />
                            </button>
                            {j.overridden && (
                              <button
                                type="button"
                                className="rounded p-1 text-navy-300 hover:bg-navy-100 hover:text-navy-600"
                                title="Clear manual amount — use the normal formula again"
                                onClick={() => setPayOverride(j.jobId, null)}
                              >
                                <FiRotateCcw className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      {/* What to actually transfer for THIS job on its own.
                          Clicking it loads the job into the payment box below.
                          The fee is per transfer, so this only holds if the
                          job is paid by itself — paying several together
                          incurs one fee for the whole run, not one each. */}
                      <td className="px-2 py-2 text-right">
                        {j.settled ? (
                          <span className="text-navy-400">—</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setAmount(""); toggleJob(j.jobId); }}
                            title={`Add ${j.jobId} to the payment below — tick several to pay them in one transfer (one bank fee, not one each)`}
                            className={`tnum rounded px-1.5 py-0.5 font-semibold transition-colors ${
                              selectedJobIds.has(j.jobId)
                                ? "bg-brand-100 text-brand-700"
                                : "text-navy-700 hover:bg-navy-100"
                            }`}
                          >
                            {gbp(grossUpTransfer(j.owed).send)}
                          </button>
                        )}
                      </td>
                      {/* Pay this job. Replaces the old "Mark settled" toggle,
                          which was a SECOND way of saying a job was dealt with
                          and constantly disagreed with the payment records —
                          flagging a job removed it from `owed` without any
                          money being recorded. Now: pay the job, or it's owed.
                          One mechanism. */}
                      <td className="px-2 py-2 text-right">
                        {j.settled ? (
                          <span
                            className="pill pill-green"
                            title="A recorded payment covers this job"
                          >
                            Paid
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => payOneJob(j)}
                            disabled={busy}
                            className="btn-outline py-1 text-[11px]"
                            title={`Record payment for ${j.jobId} — engineer receives ${gbp(j.owed)}, you send ${gbp(grossUpTransfer(j.owed).send)}`}
                          >
                            Record pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals — without these the header figure looks like it
                    disagrees with the rows, because settled jobs are listed
                    but deliberately excluded from what's still owed. */}
                <tfoot className="border-t border-navy-200 bg-navy-50 text-[13px] font-semibold text-navy-900">
                  <tr>
                    <td className="px-2 py-2" />
                    <td className="px-3 py-2">All {jd.length} job{jd.length !== 1 ? "s" : ""}</td>
                    <td className="tnum px-2 py-2 text-right">{gbp(totals.revenue)}</td>
                    <td className="tnum px-2 py-2 text-right">{gbp(totals.labour)}</td>
                    <td className="tnum px-2 py-2 text-right">{totals.vat > 0 ? gbp(totals.vat) : "—"}</td>
                    <td className="tnum px-2 py-2 text-right">{totals.parking > 0 ? gbp(totals.parking) : "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{gbp(totals.payableAll)}</td>
                    <td className="px-2 py-2" colSpan={2} />
                  </tr>
                  {totals.settledCount > 0 && (
                    <tr className="border-t border-navy-100 font-medium text-navy-600">
                      <td className="px-3 py-2" colSpan={6}>
                        Still owed ({jd.length - totals.settledCount} unsettled, {totals.settledCount} settled)
                      </td>
                      <td className="tnum px-3 py-2 text-right text-navy-900">{gbp(totals.payableUnsettled)}</td>
                      <td className="tnum px-2 py-2 text-right text-navy-900">
                        {totals.payableUnsettled > 0 ? gbp(grossUpTransfer(totals.payableUnsettled).send) : "—"}
                      </td>
                      <td className="px-2 py-2" />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-navy-500">
              Click a job to see how its fee was worked out. Tick jobs to pay them together in one transfer —
              &ldquo;Send alone&rdquo; is payable + {gbp(DEFAULT_TRANSFER_FEE)} bank fee if that job is paid on its own,
              and one transfer costs one fee however many jobs it covers.
            </p>

            {/* Breakdown of clicked or selected jobs — what the work was, how the fee
                was derived, and both ways to pay / undo payment. */}
            {(() => {
              // Show selected jobs if any are ticked, else show focused job
              const targetJobs = selectedJobIds.size > 0
                ? jd.filter((x) => selectedJobIds.has(x.jobId))
                : focusedJobId
                ? jd.filter((x) => x.jobId === focusedJobId)
                : [];

              if (targetJobs.length === 0) return null;

              const isMulti = targetJobs.length > 1;
              const Row = ({ label, value, tone = "" }) => (
                <div className="flex items-center justify-between py-1">
                  <span className="text-navy-500">{label}</span>
                  <span className={`tnum font-semibold ${tone || "text-navy-900"}`}>{value}</span>
                </div>
              );

              return (
                <div className="mt-3 space-y-3">
                  {isMulti && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-xs font-semibold text-brand-900">
                      <span>
                        Showing breakdown for {targetJobs.length} selected jobs · Combined Payable: {gbp(targetJobs.reduce((s, j) => s + (Number(j.owed) || 0), 0))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedJobIds(new Set())}
                        className="text-[11px] font-bold text-brand-700 hover:underline"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}

                  {targetJobs.map((j) => {
                    const picked = selectedJobIds.has(j.jobId);
                    const paymentForJob = periodPayments.find((p) => (p.jobIds || []).includes(j.jobId))
                      || (row.payments || []).find((p) => (p.jobIds || []).includes(j.jobId));

                    return (
                      <div key={j.jobId} className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/jobs/${j.jobId}`} className="text-sm font-bold text-brand-700 hover:underline" onClick={onClose}>
                              {j.jobId}
                            </Link>
                            <p className="text-[11px] text-navy-500">
                              {j.date ? fmtDate(j.date) : "No date"} · {j.description || "—"}
                            </p>
                          </div>
                          {!isMulti && (
                            <button
                              type="button"
                              onClick={() => setFocusedJobId(null)}
                              className="text-[11px] font-semibold text-navy-500 hover:text-navy-900"
                            >
                              Close
                            </button>
                          )}
                        </div>

                        {/* Who inspected vs who certified — decided HERE, at
                            the moment you're working out what to pay someone,
                            which is when the question actually comes up. The
                            job's own Certification panel sets the same fields
                            through the same helper; this is a second door into
                            one arrangement, not a second arrangement. */}
                        {!j.certificateOnly && (
                          <CertificationControl
                            job={jobs.find((x) => x.id === j.jobId)}
                            engineer={engineer}
                            engineers={engineers}
                            updateJob={updateJob}
                          />
                        )}

                        {Array.isArray(j.lines) && j.lines.length > 0 && (
                          <div className="my-2.5 rounded-lg border border-navy-100 bg-navy-50/70 p-2.5 text-xs">
                            <p className="mb-1.5 font-semibold text-navy-800">Services in this job:</p>
                            {/* With a manual amount set, these are the rates
                                the job WOULD have paid. Saying so stops the
                                two figures reading as a contradiction — the
                                services no longer have to add up to the fee
                                below, because the override replaced it. */}
                            {j.overridden && (
                              <p className="mb-1.5 text-[11px] text-navy-500">
                                Normal rates for reference — a manual amount of {gbp(j.labour)} is set for this job and replaces them.
                              </p>
                            )}
                            <div className="space-y-1 divide-y divide-navy-100/50">
                              {j.lines.map((l, idx) => (
                                <div key={idx} className="flex items-center justify-between pt-1 first:pt-0 text-navy-700">
                                  <span className="font-medium">
                                    {l.name} {l.tier ? `(${l.tier})` : ""} {l.qty > 1 ? `× ${l.qty}` : ""}
                                  </span>
                                  <div className="flex items-center gap-3 text-right">
                                    <span className="text-navy-500">Customer: {gbp(l.lineRevenue)}</span>
                                    <span className={j.overridden ? "text-navy-400 line-through" : "font-semibold text-amber-700"}>
                                      Engineer Pay: {gbp(l.linePay)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="divide-y divide-navy-100 text-xs">
                          <Row label="Customer paid for this job" value={gbp(j.revenue)} />
                          <Row
                            label={`Engineer fee (${
                              j.overridden
                                ? "manual override"
                                : j.payType === "fixed_service" || j.payType === "fixed_gas"
                                ? "fixed rate setting"
                                : j.payType === "per_job"
                                ? `${j.cut}% cut`
                                : j.payType === "weekly"
                                ? "weekly retainer"
                                : "engineer rate"
                            })`}
                            value={gbp(j.labour)}
                          />
                          {j.vat > 0 && <Row label="VAT on their fee (20%)" value={gbp(j.vat)} />}
                          {j.parkingReimbursed > 0 && <Row label="Parking reimbursed (receipt submitted)" value={gbp(j.parkingReimbursed)} />}
                          {j.parking?.charged > 0 && !j.parkingReimbursed && (
                            <Row label="Parking charged to customer (no receipt)" value={gbp(j.parking.charged)} tone="text-navy-400" />
                          )}
                          <Row label="Engineer receives" value={gbp(j.owed)} tone="text-brand-700" />
                          <Row label={`Send alone (incl. ${gbp(DEFAULT_TRANSFER_FEE)} bank fee)`} value={gbp(grossUpTransfer(j.owed).send)} />
                        </div>

                        {j.overridden && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                            Manual amount — set on the job, not calculated from their rate.
                          </p>
                        )}

                        {j.settled ? (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-2.5">
                            <span className="text-[11px] font-semibold text-emerald-700">
                              Already settled — {paymentForJob ? `recorded payment on ${fmtDate(paymentForJob.paidAt)}` : "covered by payment"}
                            </span>
                            {paymentForJob && onRemovePayment && (
                              <button
                                type="button"
                                onClick={() => onRemovePayment(paymentForJob.id)}
                                className="btn-outline border-rose-200 bg-white text-rose-600 hover:bg-rose-50 py-1 text-xs"
                                title="Undo this recorded payment and restore job to unpaid"
                              >
                                <FiRotateCcw className="mr-1 inline h-3.5 w-3.5" /> Undo payment
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => payOneJob(j)}
                              disabled={busy}
                              className="btn-primary py-1.5 text-xs"
                            >
                              Pay this job only · send {gbp(grossUpTransfer(j.owed).send)}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAmount(""); toggleJob(j.jobId); }}
                              className="btn-outline py-1.5 text-xs"
                            >
                              {picked ? "Remove from combined payment" : "Add to combined payment"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-sm text-navy-400">No completed jobs in this period.</p>
        )}

        {/* Reconciliation guard. A payment can only honestly settle jobs worth
          what it paid. Silent drift here is what let three jobs read "Paid"
          off two payments that didn't cover them.
          Uses periodPayments (scoped to this period's jobs, see above) —
          comparing against row.payments (every payment dated in range,
          including transfers for jobs from other periods) made an unrelated,
          perfectly correct payment look like an overpayment on these jobs. */}
      {(() => {
        const paidWork = jd.filter((j) => j.settled).reduce((s2, j) => s2 + (Number(j.owed) || 0), 0);
        const paidCash = periodPaid;
        const diff = Math.round((paidCash - paidWork) * 100) / 100;
        if (Math.abs(diff) < 0.01) return null;
        return (
          <p className={`rounded-lg px-3 py-2 text-xs ${diff < 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10"}`}>
            {diff < 0
              ? `Jobs marked paid are worth ${gbp(paidWork)} but only ${gbp(paidCash)} has been recorded against them — ${gbp(Math.abs(diff))} short.`
              : `${gbp(paidCash)} recorded against ${gbp(paidWork)} of paid jobs — ${gbp(diff)} more than the work.`}
          </p>
        );
      })()}

      {/* Bank details */}
        <div className="rounded-xl border border-navy-100 bg-navy-50/40 p-4">
          <h3 className="mb-2 section-label text-xs">Bank details</h3>
          {engineer.bankName || engineer.bankAccountName || engineer.bankSortCode || engineer.bankAccountNumber ? (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[10px] font-bold uppercase text-navy-400">Bank name</dt>
                <dd className="font-medium text-navy-900">{engineer.bankName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-navy-400">Account name</dt>
                <dd className="font-medium text-navy-900">{engineer.bankAccountName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-navy-400">Sort code</dt>
                <dd className="font-mono font-medium text-navy-900">{engineer.bankSortCode || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-navy-400">Account no.</dt>
                <dd className="font-mono font-medium text-navy-900">{engineer.bankAccountNumber || "—"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-navy-500">No bank details on file — add them in Engineers → Edit.</p>
          )}
        </div>

        {/* Record payment */}
        {row.balance > 0 && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-brand-700">Record payment</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Engineer receives (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  placeholder={defaultAmount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="BACS ref, invoice no…" />
              </div>
            </div>

            {/* The number to actually type into the banking app. The bank
                deducts its fee from the transfer, so sending the earned
                figure leaves the engineer short by exactly that fee. */}
            {transfer.send > 0 && (
              <div className="mt-3 rounded-lg border border-navy-200 bg-white/60 px-3 py-2.5 dark:bg-white/[0.03]">
                <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-navy-100 pb-1.5 text-[11px] text-navy-500">
                  <span className="min-w-0 truncate">
                    {chosen.length
                      ? `Covering ${chosen.length} job${chosen.length > 1 ? "s" : ""}: ${chosen.map((j) => j.jobId).join(", ")}`
                      : `Covering all ${unsettled.length} unsettled job${unsettled.length === 1 ? "" : "s"}`}
                  </span>
                  {chosen.length > 0 && (
                    <button type="button" className="shrink-0 hover:text-navy-900" onClick={() => { setSelectedJobIds(new Set()); setAmount(""); }}>
                      Pay full balance instead
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-navy-600">
                  <span>Engineer receives</span>
                  <span className="tnum">{gbp(transfer.earnings)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-navy-600">
                  <span>Transfer fee (company absorbs)</span>
                  <span className="tnum">+ {gbp(transfer.fee)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-navy-100 pt-1.5 text-[13px] font-semibold text-navy-900">
                  <span>Send this amount</span>
                  <span className="tnum">{gbp(transfer.send)}</span>
                </div>
              </div>
            )}
            <div className="mt-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-navy-600">
                <FiImage /> Payment proof (screenshot / invoice)
              </p>
              {proof ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="truncate font-medium text-navy-800">{proof.name}</span>
                  <button type="button" className="text-rose-500" onClick={() => { if (proof.path) removeFile(proof.path); setProof(null); }}>
                    <FiTrash2 />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 bg-white py-3 text-xs text-navy-500 hover:border-brand-400"
                >
                  <FiUploadCloud /> {busy ? "Uploading…" : "Upload proof"}
                </button>
              )}
              <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          </div>
        )}

        {/* Payment history — scoped to periodPayments (this period's jobs
            only). row.payments also includes payments for jobs from other
            periods that simply happened to be sent while this range was open;
            listing those here, under a title naming exactly 2 jobs, was what
            made "3 jobs' worth of payments" look like it belonged to 2. */}
        {periodPayments.length > 0 && (
          <div>
            <h3 className="mb-2 section-label text-xs">Payment history</h3>
            <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100">
              {periodPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    {/* Lead with what LEFT THE ACCOUNT — that's the figure
                        typed into the bank and the one being reconciled
                        against a statement. Showing only the engineer's
                        earnings made a £38.74 transfer read as "£38.00". */}
                    <p className="font-semibold text-emerald-700">
                      {gbp(p.amountSent ?? (Number(p.amount) || 0) + (Number(p.transferFee) || 0))} sent
                    </p>
                    <p className="text-xs text-navy-400">
                      {gbp(p.amount)} to them
                      {Number(p.transferFee) > 0 ? ` + ${gbp(p.transferFee)} fee` : ""}
                      {" · "}{fmtDate(p.paidAt)}{p.notes ? ` · ${p.notes}` : ""}
                    </p>
                    {p.jobIds?.length > 0 && (
                      <p className="text-[11px] text-navy-400">Covers {p.jobIds.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.proof && (
                      <button
                        type="button"
                        className="text-brand-600"
                        onClick={() => {
                          const src = fileSrc(p.proof);
                          if (src) window.open(src, "_blank");
                        }}
                      >
                        <FiExternalLink />
                      </button>
                    )}
                    <button type="button" className="text-navy-400 hover:text-rose-500" onClick={() => onRemovePayment(p.id)} aria-label="Remove payment">
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Inspection vs certificate, inside the pay run ────────────────────────
//
// "Pay him for the inspection only — someone else did the certificate" is a
// decision made while looking at what you owe someone, not while editing the
// job days earlier. So it lives here as well as on the job.
//
// Ticking it does three things at once, which is the whole point: this
// engineer drops to their inspection rate, the person who issued the
// certificate is asked for by name, and that person picks up their own
// payable row against THIS job — same statement, same payment records,
// same settle-by-job mechanics as attended work. Nothing is detached from
// the job; certifierLegs() in lib/visits.js reads it straight back off the
// job when the pay run is recomputed.
function CertificationControl({ job, engineer, engineers, updateJob }) {
  if (!job || !engineer) return null;

  const current = certificationForEngineer(job, engineer.id);
  const lines = getJobLines(job).filter((l) => !isAddonCode(l.code));
  const certifier = engineers.find((e) => e.id === current.certifierId) || null;

  // What the toggle costs, both ways, shown before it's flipped rather than
  // discovered on a statement afterwards.
  const fullPay = lines.reduce(
    (s, l) => s + rateForLine(l, engineer.serviceRates, engineer.gasBaseRate, engineer.gasExtraRate),
    0
  );
  const inspPay = lines.reduce((s, l) => {
    const r = inspectionRateForLine(l, engineer.inspectionRates);
    return s + (r != null ? r : rateForLine(l, engineer.serviceRates, engineer.gasBaseRate, engineer.gasExtraRate));
  }, 0);
  const missingInspectionRate =
    current.inspectionOnly &&
    lines.some((l) => inspectionRateForLine(l, engineer.inspectionRates) == null);

  // Seed the certifier's fee from THEIR configured certificate rate (full
  // rate minus their inspection rate), so the two halves of a split job add
  // up to what one person doing all of it would have cost. Always editable.
  const seedFee = (certId) => {
    const cert = engineers.find((e) => e.id === certId);
    if (!cert || !lines.length) return "";
    const total = lines.reduce((s, l) => s + (certificationRateForLine(l, cert) ?? 0), 0);
    return total > 0 ? String(Math.round(total * 100) / 100) : "";
  };

  const patch = (changes) =>
    updateJob(job.id, certificationPatch(job, engineer.id, { ...current, ...changes }));

  return (
    <div className="my-2.5 rounded-lg border border-navy-100 bg-navy-50/70 p-2.5 text-xs dark:border-white/10 dark:bg-white/[0.04]">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 rounded border-navy-300 text-brand-500"
          checked={current.inspectionOnly}
          onChange={(e) => patch({ inspectionOnly: e.target.checked })}
        />
        <span>
          <span className="font-semibold text-navy-800">
            Pay {engineer.name} for the inspection only
          </span>
          <span className="block text-[11px] text-navy-500">
            Someone else issued the certificate and gets paid for it separately.
          </span>
        </span>
      </label>

      {!current.inspectionOnly ? (
        <p className="mt-2 text-[11px] text-navy-500">
          Whole job — inspection and certificate{fullPay > 0 ? `, ${gbp(fullPay)}` : ""}.
        </p>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          <p className="text-[11px] text-navy-600">
            {engineer.name}: <strong className="text-navy-900">{gbp(inspPay)}</strong> for the
            inspection
            {fullPay > 0 && inspPay !== fullPay && (
              <span className="text-navy-400"> (whole job would be {gbp(fullPay)})</span>
            )}
          </p>

          {missingInspectionRate && (
            <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-500/10">
              No inspection-only rate set for {engineer.name} on this service, so they&apos;re
              still on the full rate. Set one in Engineers → edit → rates.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="label text-[10px]">Certificate issued by</label>
              <select
                className="input h-8 text-xs"
                value={current.certifierId}
                onChange={(e) => {
                  const certifierId = e.target.value;
                  patch({
                    certifierId,
                    ...(current.certifierFee ? {} : { certifierFee: seedFee(certifierId) }),
                  });
                }}
              >
                <option value="">Nobody yet</option>
                {engineers
                  .filter((e) => e.id !== engineer.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label text-[10px]">Pay them (£) — total for this job</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input h-8 text-xs"
                placeholder="0.00"
                value={current.certifierFee ?? ""}
                onChange={(e) => patch({ certifierFee: e.target.value })}
              />
            </div>
          </div>

          {certifier && Number(current.certifierFee) > 0 ? (
            <p className="text-[11px] text-navy-500">
              {certifier.name} is owed{" "}
              <strong className="text-navy-900">{gbp(Number(current.certifierFee))}</strong> for
              this certificate. It appears on their own Engineer pay statement against {job.id}.
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Nobody recorded as issuing the certificate yet — until one is set, nothing is
              owed for it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
