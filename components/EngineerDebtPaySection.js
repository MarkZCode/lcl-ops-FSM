"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  FiPlus,
  FiTrash2,
  FiCheck,
  FiSearch,
  FiCalendar,
  FiCopy,
  FiCheckCircle,
  FiArrowDownRight,
  FiArrowUpRight,
  FiExternalLink,
  FiDollarSign,
  FiInfo,
  FiArrowLeft,
} from "react-icons/fi";
import { LuScale, LuWallet, LuReceipt } from "react-icons/lu";
import { useStore } from "@/lib/store";
import { gbp, fmtDate } from "@/lib/format";
import { jobFinancials } from "@/lib/finance";
import Modal from "./Modal";

export default function EngineerDebtPaySection({ engineer, row }) {
  const {
    jobs = [],
    clients = [],
    engineerDebts = [],
    engineerPayments = [],
    addEngineerDebt,
    logEngineerDebtRepayment,
    deleteEngineerDebtEntry,
  } = useStore();

  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Add Debt Form State
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDate, setDebtDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [debtNotes, setDebtNotes] = useState("");

  // Repayment / Deduction Form State
  const [repayJob, setRepayJob] = useState(null);
  const [actualPaid, setActualPaid] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayDate, setRepayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [repayNotes, setRepayNotes] = useState("");
  const [jobSearch, setJobSearch] = useState("");

  // Filter entries for this specific engineer
  const engEntries = useMemo(() => {
    if (!engineer?.id) return [];
    return (engineerDebts || [])
      .filter((d) => d.engineerId === engineer.id)
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [engineerDebts, engineer?.id]);

  // Debt & Repayment Totals
  const summary = useMemo(() => {
    let totalDebt = 0;
    let totalRepaid = 0;
    for (const e of engEntries) {
      if (e.type === "debt") totalDebt += Number(e.amount) || 0;
      if (e.type === "repayment") totalRepaid += Number(e.amount) || 0;
    }
    const balance = Math.max(0, Math.round((totalDebt - totalRepaid) * 100) / 100);
    return {
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalRepaid: Math.round(totalRepaid * 100) / 100,
      balance,
    };
  }, [engEntries]);

  // Client lookup map for fast address & name resolution
  const clientMap = useMemo(() => {
    return new Map((clients || []).map((c) => [c.id, c]));
  }, [clients]);

  // Assigned jobs for this engineer (matches engineerId, visits, or recorded payments)
  const engineerJobs = useMemo(() => {
    if (!engineer?.id) return [];
    const engId = engineer.id;
    const paidJobIds = new Set(
      (engineerPayments || [])
        .filter((p) => p.engineerId === engId)
        .flatMap((p) => p.jobIds || [])
    );
    const rowJobIds = new Set((row?.jobDetails || []).map((j) => j.jobId));

    const assigned = (jobs || []).filter((j) => {
      if (j.engineerId === engId) return true;
      if (Array.isArray(j.visits) && j.visits.some((v) => v.engineerId === engId)) return true;
      if (paidJobIds.has(j.id)) return true;
      if (rowJobIds.has(j.id)) return true;
      return false;
    });

    return assigned
      .map((j) => {
        const client = clientMap.get(j.clientId);
        const prop = client?.properties?.find((p) => p.id === j.propertyId);
        const address =
          prop?.address ||
          prop?.postcode ||
          j.nameOnCert ||
          client?.name ||
          "Address not specified";
        const fee = jobFinancials(j, engineer).payable;
        return {
          id: j.id,
          date: j.scheduledAt || j.createdAt,
          address,
          clientName: client?.name || j.nameOnCert || "—",
          status: j.status,
          price: j.price,
          fee: Math.round(Number(fee || 0) * 100) / 100,
        };
      })
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [jobs, engineer, clientMap, engineerPayments, row]);

  // Filtered jobs matching the search query (falls back to searching all jobs if not in engineerJobs)
  const filteredJobs = useMemo(() => {
    const q = jobSearch.toLowerCase().trim();
    if (!q) return engineerJobs.slice(0, 15);

    const matched = engineerJobs.filter(
      (j) =>
        j.id.toLowerCase().includes(q) ||
        j.address.toLowerCase().includes(q) ||
        j.clientName.toLowerCase().includes(q)
    );
    if (matched.length > 0) return matched.slice(0, 20);

    // If not found in engineer jobs, search ALL jobs so JOB-4395 or any job is ALWAYS found
    return (jobs || [])
      .filter((j) => {
        const client = clientMap.get(j.clientId);
        const prop = client?.properties?.find((p) => p.id === j.propertyId);
        const addr = (prop?.address || prop?.postcode || j.nameOnCert || "").toLowerCase();
        return j.id.toLowerCase().includes(q) || addr.includes(q);
      })
      .map((j) => {
        const client = clientMap.get(j.clientId);
        const prop = client?.properties?.find((p) => p.id === j.propertyId);
        const address = prop?.address || prop?.postcode || j.nameOnCert || client?.name || "Address not specified";
        const fee = jobFinancials(j, engineer).payable;
        return {
          id: j.id,
          date: j.scheduledAt || j.createdAt,
          address,
          clientName: client?.name || j.nameOnCert || "—",
          status: j.status,
          price: j.price,
          fee: Math.round(Number(fee || 0) * 100) / 100,
        };
      })
      .slice(0, 20);
  }, [engineerJobs, jobSearch, jobs, clientMap, engineer]);

  const selectJobForRepay = useCallback((job) => {
    setRepayJob(job);
    const fee = job?.fee || 0;
    // By default, set actual paid equal to fee
    setActualPaid(fee > 0 ? String(fee) : "");
    setRepayAmount("");
    setRepayNotes(`Deduction/Repayment linked to ${job.id}`);
  }, []);

  const handleOpenRepay = (preselectedJob = null) => {
    if (preselectedJob) {
      selectJobForRepay(preselectedJob);
    } else {
      setRepayJob(null);
      setActualPaid("");
      setRepayAmount("");
      setRepayNotes("");
    }
    setJobSearch("");
    setRepayOpen(true);
  };

  // Automatic calculation handler when user enters Actual Amount Paid
  const handleActualPaidChange = (val) => {
    setActualPaid(val);
    const paidNum = parseFloat(val);
    if (!repayJob || isNaN(paidNum)) {
      return;
    }
    const fee = Number(repayJob.fee) || 0;
    const diff = Math.round(Math.abs(paidNum - fee) * 100) / 100;
    setRepayAmount(diff > 0 ? String(diff) : "");
    if (paidNum > fee) {
      setRepayNotes(`Repaid £${diff.toFixed(2)} extra on top of ${repayJob.id} (£${fee.toFixed(2)} fee, paid £${paidNum.toFixed(2)})`);
    } else if (paidNum < fee) {
      setRepayNotes(`Deducted £${diff.toFixed(2)} from ${repayJob.id} (£${fee.toFixed(2)} fee, paid £${paidNum.toFixed(2)})`);
    } else {
      setRepayNotes(`Exact payout for ${repayJob.id} (£${fee.toFixed(2)})`);
    }
  };

  // Direct calculation handler when user manually types Repayment / Deduction Amount
  const handleRepayAmountChange = (val) => {
    setRepayAmount(val);
    const repNum = parseFloat(val);
    if (!repayJob || isNaN(repNum)) return;
    const fee = Number(repayJob.fee) || 0;
    // Default assumes deduction from fee
    const remaining = Math.max(0, Math.round((fee - repNum) * 100) / 100);
    setActualPaid(String(remaining));
    setRepayNotes(`Deducted £${repNum.toFixed(2)} from ${repayJob.id} (£${fee.toFixed(2)} fee)`);
  };

  const submitAddDebt = (e) => {
    e.preventDefault();
    if (!debtAmount || Number(debtAmount) <= 0) return;
    addEngineerDebt({
      engineerId: engineer.id,
      amount: Number(debtAmount),
      date: debtDate,
      notes: debtNotes,
    });
    setDebtAmount("");
    setDebtNotes("");
    setAddDebtOpen(false);
  };

  const submitRepay = (e) => {
    e.preventDefault();
    if (!repayAmount || Number(repayAmount) <= 0) return;
    logEngineerDebtRepayment({
      engineerId: engineer.id,
      amount: Number(repayAmount),
      date: repayDate,
      jobId: repayJob ? repayJob.id : "",
      notes: repayNotes,
    });
    setRepayOpen(false);
    setRepayJob(null);
    setActualPaid("");
    setRepayAmount("");
    setRepayNotes("");
  };

  const copyWhatsAppBreakdown = () => {
    const lines = [
      `*Statement of Balance Owed — ${engineer.name}*`,
      `Date: ${new Date().toLocaleDateString("en-GB")}`,
      ``,
      `• *Total Amount Owed to Engineer:* ${gbp(summary.totalDebt)}`,
      `• *Total Paid / Settled:* ${gbp(summary.totalRepaid)}`,
      `• *Remaining Balance We Owe:* ${gbp(summary.balance)}`,
      ``,
      `*Recent Payouts & Balance Adjustments:*`,
    ];

    if (engEntries.length === 0) {
      lines.push(`(No balance or payout records yet)`);
    } else {
      for (const entry of engEntries.slice(0, 10)) {
        const isRepay = entry.type === "repayment";
        const sign = isRepay ? "−" : "+";
        const jobStr = entry.jobId ? ` [${entry.jobId}]` : "";
        const noteStr = entry.notes ? ` — ${entry.notes}` : "";
        lines.push(`• ${fmtDate(entry.date)}: ${sign}${gbp(entry.amount)}${jobStr}${noteStr}`);
      }
    }

    lines.push(``);
    lines.push(`_Landlord Compliance London Operations_`);

    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-4">
      {/* Debt Balance Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
            <span>Balance Owed to Engineer</span>
            <LuScale className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
            {gbp(summary.balance)}
          </div>
          <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-400/70">
            Remaining amount we owe to {engineer.name}
          </p>
        </div>

        <div className="rounded-xl border border-navy-200 bg-white p-3.5 dark:border-white/10 dark:bg-navy-900">
          <div className="flex items-center justify-between text-xs font-semibold text-navy-600 dark:text-slate-300">
            <span>Total Amount Accrued</span>
            <LuWallet className="h-4 w-4 text-navy-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-navy-900 dark:text-white">
            {gbp(summary.totalDebt)}
          </div>
          <p className="mt-0.5 text-[11px] text-navy-400">
            Recorded balance owed to engineer
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <span>Total Paid / Settled</span>
            <LuReceipt className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {gbp(summary.totalRepaid)}
          </div>
          <p className="mt-0.5 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
            Paid out or settled against jobs
          </p>
        </div>
      </div>

      {/* Action Buttons & WhatsApp Explainer */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-100 bg-navy-50/60 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenRepay()}
            className="btn-primary py-1.5 px-3 text-xs"
          >
            <FiPlus /> Record Payout / Settlement
          </button>
          <button
            type="button"
            onClick={() => setAddDebtOpen(true)}
            className="btn-outline py-1.5 px-3 text-xs text-rose-700 hover:border-rose-300 dark:text-rose-300"
          >
            <FiPlus /> Record Amount We Owe
          </button>
        </div>

        <button
          type="button"
          onClick={copyWhatsAppBreakdown}
          className="btn-outline py-1.5 px-3 text-xs font-semibold text-navy-700 hover:text-navy-900 dark:text-slate-200"
          title="Copies a clear breakdown you can paste directly to the engineer on WhatsApp"
        >
          {copied ? (
            <>
              <FiCheck className="text-emerald-600" /> Copied breakdown!
            </>
          ) : (
            <>
              <FiCopy /> Copy Breakdown for Engineer
            </>
          )}
        </button>
      </div>

      {/* Quick Job Payout & Deduction Assistant */}
      {summary.balance > 0 && engineerJobs.length > 0 && (
        <div className="rounded-xl border border-navy-200 bg-white p-3.5 dark:border-white/10 dark:bg-navy-900">
          <div className="flex items-center justify-between border-b border-navy-100 pb-2 dark:border-white/10">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy-700 dark:text-slate-200">
                Jobs for {engineer.name}
              </h4>
              <p className="text-[11px] text-navy-500">
                Select a job to record or offset payout against the balance we owe.
              </p>
            </div>
          </div>

          <div className="mt-2.5 divide-y divide-navy-100 overflow-hidden rounded-lg border border-navy-100 text-xs dark:divide-white/5 dark:border-white/10">
            {engineerJobs.slice(0, 6).map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 hover:bg-navy-50/50 dark:hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{job.id}</span>
                    {job.clientName && job.clientName !== "—" && (
                      <span className="font-semibold text-navy-900 dark:text-slate-100">· {job.clientName}</span>
                    )}
                    <span className="text-[10px] text-navy-400 font-mono">{fmtDate(job.date)}</span>
                    <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-medium text-navy-600 dark:bg-white/10 dark:text-slate-300">
                      {job.status}
                    </span>
                  </div>
                  <p className="truncate text-navy-800 dark:text-slate-200 font-medium mt-0.5">
                    {job.address}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-navy-400 block">Job Fee</span>
                    <span className="font-mono font-bold text-navy-900 dark:text-white">
                      {gbp(job.fee)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenRepay(job)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 transition"
                  >
                    Pay / Settle from this Job
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Transaction History Table */}
      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
        <div className="border-b border-navy-100 bg-navy-50/70 px-4 py-2.5 text-xs font-bold text-navy-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 flex justify-between items-center">
          <span>Payout &amp; Balance History</span>
          <span className="text-[11px] font-normal text-navy-400">
            {engEntries.length} record{engEntries.length === 1 ? "" : "s"}
          </span>
        </div>

        {engEntries.length === 0 ? (
          <div className="p-8 text-center text-xs text-navy-400 dark:text-slate-500">
            <LuScale className="mx-auto h-8 w-8 text-navy-300 opacity-60 mb-1.5" />
            No balance or payout records for {engineer.name} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-navy-100 bg-navy-50/40 text-[11px] font-semibold text-navy-500 dark:border-white/5 dark:bg-white/[0.02]">
                <tr>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Amount</th>
                  <th className="py-2 px-3">Linked Job</th>
                  <th className="py-2 px-3">Notes</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 dark:divide-white/5">
                {engEntries.map((e) => {
                  const isRepay = e.type === "repayment";
                  return (
                    <tr key={e.id} className="hover:bg-navy-50/40 dark:hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono text-navy-600 dark:text-slate-400">
                        {fmtDate(e.date || e.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isRepay
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                          }`}
                        >
                          {isRepay ? (
                            <>
                              <FiArrowDownRight /> Payout / Settled
                            </>
                          ) : (
                            <>
                              <FiArrowUpRight /> Balance Owed Added
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <span className={isRepay ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                          {isRepay ? "−" : "+"}{gbp(e.amount)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {e.jobId ? (
                          <Link
                            href={`/jobs/${e.jobId}`}
                            className="inline-flex items-center gap-1 font-mono font-semibold text-brand-600 hover:underline"
                          >
                            {e.jobId} <FiExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-navy-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-navy-600 dark:text-slate-300 max-w-xs truncate">
                        {e.notes || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => deleteEngineerDebtEntry(e.id)}
                          className="rounded p-1 text-navy-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          title="Delete entry"
                        >
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Record Advance / Loan */}
      {addDebtOpen && (
        <Modal
          open={addDebtOpen}
          onClose={() => setAddDebtOpen(false)}
          onBack={() => setAddDebtOpen(false)}
          title={`Record Amount We Owe · ${engineer.name}`}
        >
          <form onSubmit={submitAddDebt} className="space-y-4 text-sm">
            <p className="text-xs text-navy-500">
              Record an amount we owe to {engineer.name} (e.g. backpay, rate adjustment, or unpaid fee). This increases the balance we owe to them.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount We Owe (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input font-mono"
                  placeholder="e.g. 150.00"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Date Given</label>
                <input
                  type="date"
                  className="input"
                  value={debtDate}
                  onChange={(e) => setDebtDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Notes / Reason (Optional)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Advance for fuel / equipment"
                value={debtNotes}
                onChange={(e) => setDebtNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary flex items-center gap-1"
                onClick={() => setAddDebtOpen(false)}
              >
                <FiArrowLeft /> Back
              </button>
              <button type="submit" className="btn-primary">
                Record Balance Owed (+{gbp(debtAmount || 0)})
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Log Deduction / Repayment with Automatic Calculation */}
      {repayOpen && (
        <Modal
          open={repayOpen}
          onClose={() => setRepayOpen(false)}
          onBack={repayJob ? () => { setRepayJob(null); setActualPaid(""); setRepayAmount(""); setRepayNotes(""); } : () => setRepayOpen(false)}
          title={`Record Payout / Settlement · ${engineer.name}`}
        >
          <form onSubmit={submitRepay} className="space-y-4 text-sm">
            <div className="rounded-xl border border-navy-100 bg-navy-50/70 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex justify-between font-semibold">
                <span className="text-navy-500">Current Balance We Owe:</span>
                <span className="text-rose-600 dark:text-rose-400 font-mono font-bold text-sm">
                  {gbp(summary.balance)}
                </span>
              </div>
            </div>

            {/* Associate with a Job */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Associate with a Job</label>
                {repayJob && (
                  <button
                    type="button"
                    onClick={() => {
                      setRepayJob(null);
                      setActualPaid("");
                      setRepayAmount("");
                      setRepayNotes("");
                    }}
                    className="text-[11px] text-rose-600 hover:underline font-semibold"
                  >
                    Clear selected job
                  </button>
                )}
              </div>

              {repayJob ? (
                <div className="rounded-xl border border-brand-300 bg-brand-50/50 p-3.5 text-xs dark:border-brand-500/30 dark:bg-brand-500/10">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-brand-700 dark:text-brand-300">
                      {repayJob.id}
                    </span>
                    <span className="rounded bg-brand-200/60 px-2 py-0.5 text-[10px] font-bold text-brand-800 dark:bg-brand-500/20 dark:text-brand-200">
                      Job Linked
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-navy-800 dark:text-white">
                    {repayJob.address}
                  </p>
                  <div className="mt-2 flex items-center justify-between border-t border-brand-200/60 pt-2 text-[11px] text-navy-600 dark:border-white/10 dark:text-slate-300">
                    <span>Client: <strong>{repayJob.clientName}</strong></span>
                    <span>
                      Job Fee (Earned): <strong className="font-mono text-sm text-navy-900 dark:text-white">{gbp(repayJob.fee)}</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-2.5 h-3.5 w-3.5 text-navy-400" />
                    <input
                      type="text"
                      className="input pl-8 text-xs"
                      placeholder="Search jobs by ID (e.g. 4395), address, or client..."
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                    />
                  </div>

                  <div className="max-h-36 overflow-y-auto rounded-lg border border-navy-200 divide-y divide-navy-100 text-xs dark:border-white/10 dark:divide-white/5">
                    {filteredJobs.length === 0 ? (
                      <p className="p-3 text-center text-navy-400 text-[11px]">
                        No matching jobs found. Try typing the exact ID (e.g. {jobSearch || "JOB-4395"}).
                      </p>
                    ) : (
                      filteredJobs.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => selectJobForRepay(j)}
                          className="w-full p-2 text-left hover:bg-navy-50 dark:hover:bg-white/5 flex items-center justify-between gap-2 transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-brand-600">{j.id}</span>
                              {j.clientName && j.clientName !== "—" && (
                                <span className="font-semibold text-navy-900 dark:text-slate-100">· {j.clientName}</span>
                              )}
                              <span className="text-[10px] text-navy-400 font-mono">{fmtDate(j.date)}</span>
                            </div>
                            <p className="truncate text-[11px] text-navy-700 dark:text-slate-300">{j.address}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-navy-800 dark:text-slate-200">{gbp(j.fee)}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Automatic Calculation Section */}
            {repayJob ? (
              <div className="rounded-xl border border-navy-200 bg-white p-3.5 space-y-3 dark:border-white/10 dark:bg-navy-900">
                <div className="flex items-center gap-1.5 text-xs font-bold text-navy-800 dark:text-slate-200">
                  <FiDollarSign className="text-emerald-600" /> Automatic Deduction / Repayment Calculation
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">
                      Actual Amount Sent / Paid (£)
                      <span className="ml-1 text-[10px] font-normal text-navy-400">(what you transferred)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input font-mono text-sm font-semibold"
                      placeholder="e.g. 129.99"
                      value={actualPaid}
                      onChange={(e) => handleActualPaidChange(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="label">
                      Deduction / Repayment Amount (£)
                      <span className="ml-1 text-[10px] font-normal text-emerald-600">(auto-calculated)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300"
                      placeholder="e.g. 39.99"
                      value={repayAmount}
                      onChange={(e) => handleRepayAmountChange(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Calculation Explainer Banner */}
                {Number(repayAmount) > 0 && (
                  <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 space-y-1">
                    <div className="flex justify-between font-bold">
                      <span>
                        {Number(actualPaid) > Number(repayJob.fee)
                          ? `Repayment (+${gbp(repayAmount)} extra paid over £${Number(repayJob.fee).toFixed(2)} fee):`
                          : Number(actualPaid) < Number(repayJob.fee)
                          ? `Deduction (${gbp(repayAmount)} withheld from £${Number(repayJob.fee).toFixed(2)} fee):`
                          : `Repayment Amount:`}
                      </span>
                      <span className="font-mono text-sm text-emerald-700 dark:text-emerald-300">
                        −{gbp(repayAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-emerald-700/90 dark:text-emerald-300/90 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/40">
                      <span>New Debt Balance After Saving:</span>
                      <strong className="font-mono text-xs">
                        {gbp(Math.max(0, summary.balance - Number(repayAmount)))}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Repayment Amount (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input font-mono font-bold"
                    placeholder="e.g. 50.00"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Date Paid</label>
                  <input
                    type="date"
                    className="input"
                    value={repayDate}
                    onChange={(e) => setRepayDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Payment Date</label>
                <input
                  type="date"
                  className="input"
                  value={repayDate}
                  onChange={(e) => setRepayDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Notes / Description</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Settled via bank transfer"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-between items-center gap-2 pt-2 border-t border-navy-100 dark:border-white/10">
              {repayJob ? (
                <button
                  type="button"
                  className="btn-outline flex items-center gap-1 text-xs"
                  onClick={() => { setRepayJob(null); setActualPaid(""); setRepayAmount(""); setRepayNotes(""); }}
                >
                  <FiArrowLeft /> Back to Job List
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1"
                  onClick={() => setRepayOpen(false)}
                >
                  <FiArrowLeft /> Back
                </button>
              )}
              <button type="submit" className="btn-primary flex items-center gap-1.5">
                <FiCheckCircle /> Confirm Repayment ({gbp(repayAmount || 0)})
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
