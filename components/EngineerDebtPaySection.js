"use client";

import { useState, useMemo } from "react";
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
  const [repayAmount, setRepayAmount] = useState("");
  const [repayDate, setRepayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [repayJob, setRepayJob] = useState(null);
  const [repayNotes, setRepayNotes] = useState("");
  const [jobSearch, setJobSearch] = useState("");

  // Filter entries for this specific engineer
  const engEntries = useMemo(() => {
    if (!engineer?.id) return [];
    return (engineerDebts || [])
      .filter((d) => d.engineerId === engineer.id)
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
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

  // Assigned jobs for this engineer (most recent first)
  const engineerJobs = useMemo(() => {
    if (!engineer?.id) return [];
    const assigned = (jobs || []).filter((j) => j.engineerId === engineer.id);
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
          fee,
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [jobs, engineer, clientMap]);

  // Filtered jobs matching the search query
  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) return engineerJobs.slice(0, 15);
    const q = jobSearch.toLowerCase().trim();
    return engineerJobs.filter(
      (j) =>
        j.id.toLowerCase().includes(q) ||
        j.address.toLowerCase().includes(q) ||
        j.clientName.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [engineerJobs, jobSearch]);

  const handleOpenRepay = (preselectedJob = null) => {
    setRepayJob(preselectedJob);
    setRepayAmount(preselectedJob ? String(preselectedJob.fee || "") : "");
    setRepayNotes(preselectedJob ? `Deducted from ${preselectedJob.id} (${preselectedJob.address})` : "");
    setJobSearch("");
    setRepayOpen(true);
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
    setRepayAmount("");
    setRepayNotes("");
  };

  const copyWhatsAppBreakdown = () => {
    const lines = [
      `*Engineer Debt & Payment Breakdown — ${engineer.name}*`,
      `Date: ${new Date().toLocaleDateString("en-GB")}`,
      ``,
      `• *Total Advance / Debt Given:* ${gbp(summary.totalDebt)}`,
      `• *Total Repayments / Deducted:* ${gbp(summary.totalRepaid)}`,
      `• *Remaining Balance to Clear:* ${gbp(summary.balance)}`,
      ``,
      `*Recent Transactions / Deductions:*`,
    ];

    if (engEntries.length === 0) {
      lines.push(`(No debt or repayment records yet)`);
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
    lines.push(`----------------------------------------`);
    lines.push(`*Total Amount Left to Settle:* ${gbp(summary.balance)}`);

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 dark:border-rose-500/20 dark:bg-rose-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-800 dark:text-rose-300">
            <span>Current Debt Balance</span>
            <LuScale className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-400">
            {gbp(summary.balance)}
          </div>
          <p className="mt-0.5 text-[11px] text-rose-600/80 dark:text-rose-400/70">
            {summary.balance === 0 && summary.totalDebt > 0
              ? "Fully cleared"
              : "Outstanding to be deducted / settled"}
          </p>
        </div>

        <div className="rounded-xl border border-navy-200 bg-white p-3.5 dark:border-white/10 dark:bg-navy-900">
          <div className="flex items-center justify-between text-xs font-semibold text-navy-500 dark:text-slate-400">
            <span>Total Advances Given</span>
            <LuWallet className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-navy-900 dark:text-white">
            {gbp(summary.totalDebt)}
          </div>
          <p className="mt-0.5 text-[11px] text-navy-400">
            Recorded advances / loans
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <span>Total Repaid / Deducted</span>
            <LuReceipt className="h-4 w-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {gbp(summary.totalRepaid)}
          </div>
          <p className="mt-0.5 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
            Deducted from jobs or cash settlements
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
            <FiPlus /> Log Deduction / Repayment
          </button>
          <button
            type="button"
            onClick={() => setAddDebtOpen(true)}
            className="btn-outline py-1.5 px-3 text-xs text-rose-700 hover:border-rose-300 dark:text-rose-300"
          >
            <FiPlus /> Record New Advance / Debt
          </button>
        </div>

        <button
          type="button"
          onClick={copyWhatsAppBreakdown}
          className="btn-outline py-1.5 px-3 text-xs font-semibold text-navy-700 hover:text-navy-900"
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
                Recent Jobs Done by {engineer.name}
              </h4>
              <p className="text-[11px] text-navy-500">
                Click &ldquo;Deduct from this Job&rdquo; to sync the job, see their fee, and apply a debt deduction.
              </p>
            </div>
          </div>

          <div className="mt-2.5 divide-y divide-navy-100 overflow-hidden rounded-lg border border-navy-100 text-xs dark:divide-white/5 dark:border-white/10">
            {engineerJobs.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 hover:bg-navy-50/50 dark:hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-brand-600">{job.id}</span>
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
                    <span className="text-[10px] text-navy-400 block">Engineer Fee</span>
                    <span className="font-mono font-bold text-navy-900 dark:text-white">
                      {gbp(job.fee)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenRepay(job)}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 transition"
                  >
                    Deduct from this Job
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
          <span>Transaction &amp; Repayment History</span>
          <span className="text-[11px] font-normal text-navy-400">
            {engEntries.length} record{engEntries.length === 1 ? "" : "s"}
          </span>
        </div>

        {engEntries.length === 0 ? (
          <p className="p-6 text-center text-xs text-navy-400">
            No debt or advance entries recorded for {engineer.name}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-navy-100 text-[10px] uppercase font-bold text-navy-400 dark:border-white/10">
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
                    <tr key={e.id} className="hover:bg-navy-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono text-navy-600 dark:text-slate-300">
                        {fmtDate(e.date || e.createdAt)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isRepay
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                          }`}
                        >
                          {isRepay ? (
                            <>
                              <FiArrowDownRight /> Repayment
                            </>
                          ) : (
                            <>
                              <FiArrowUpRight /> Debt Added
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
                          className="text-navy-400 hover:text-rose-600 transition"
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

      {/* Add Debt Modal */}
      {addDebtOpen && (
        <Modal
          open={addDebtOpen}
          onClose={() => setAddDebtOpen(false)}
          title={`Record Advance / Debt for ${engineer.name}`}
        >
          <form onSubmit={submitAddDebt} className="space-y-4 text-sm">
            <p className="text-xs text-navy-500">
              Record money advanced or owed to this engineer that will be deducted from future job payouts.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input font-mono"
                  placeholder="e.g. 265.00"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Date</label>
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
              <label className="label">Reason / Notes</label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="e.g. Advance requested before start of week"
                value={debtNotes}
                onChange={(e) => setDebtNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setAddDebtOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Record
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Log Repayment / Deduction Modal */}
      {repayOpen && (
        <Modal
          open={repayOpen}
          onClose={() => {
            setRepayOpen(false);
            setRepayJob(null);
          }}
          title={`Log Debt Deduction for ${engineer.name}`}
        >
          <form onSubmit={submitRepay} className="space-y-4 text-sm">
            <div className="rounded-xl border border-navy-200 bg-navy-50 p-3 text-xs dark:border-white/10 dark:bg-navy-800">
              <div className="flex justify-between font-semibold">
                <span className="text-navy-500">Current Debt Balance:</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold font-mono">
                  {gbp(summary.balance)}
                </span>
              </div>
              {repayAmount && Number(repayAmount) > 0 && (
                <div className="mt-1.5 flex justify-between border-t border-navy-200/60 pt-1.5 font-bold dark:border-white/10">
                  <span className="text-navy-500">Balance After Deduction:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                    {gbp(Math.max(0, summary.balance - Number(repayAmount)))}
                  </span>
                </div>
              )}
            </div>

            {/* Smart Searchable Job Picker */}
            <div>
              <label className="label flex items-center justify-between">
                <span>Associate with a Job (Optional)</span>
                {repayJob && (
                  <button
                    type="button"
                    onClick={() => {
                      setRepayJob(null);
                      setRepayAmount("");
                      setRepayNotes("");
                    }}
                    className="text-[11px] text-rose-600 hover:underline"
                  >
                    Clear selected job
                  </button>
                )}
              </label>

              {repayJob ? (
                <div className="rounded-lg border border-brand-300 bg-brand-50/50 p-3 text-xs dark:border-brand-500/30 dark:bg-brand-500/10">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-brand-700 dark:text-brand-300">
                      {repayJob.id}
                    </span>
                    <span className="rounded bg-brand-200/60 px-1.5 py-0.5 text-[10px] font-bold text-brand-800 dark:bg-brand-500/20 dark:text-brand-200">
                      Synced
                    </span>
                  </div>
                  <p className="mt-1 font-medium text-navy-800 dark:text-white">
                    {repayJob.address}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-navy-500">
                    <span>Client: {repayJob.clientName}</span>
                    <span>
                      Engineer Fee: <strong>{gbp(repayJob.fee)}</strong>
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
                      placeholder="Search jobs by ID (e.g. 1494), street, or client..."
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-lg border border-navy-200 divide-y divide-navy-100 text-xs dark:border-white/10 dark:divide-white/5">
                    {filteredJobs.length === 0 ? (
                      <p className="p-3 text-center text-navy-400 text-[11px]">
                        No matching jobs found for this engineer.
                      </p>
                    ) : (
                      filteredJobs.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => {
                            setRepayJob(j);
                            setRepayAmount(String(j.fee || ""));
                            setRepayNotes(`Deducted from ${j.id} (${j.address})`);
                          }}
                          className="w-full p-2 text-left hover:bg-navy-50 dark:hover:bg-white/5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-navy-900 dark:text-white">
                                {j.id}
                              </span>
                              <span className="text-[10px] text-navy-400 font-mono">
                                {fmtDate(j.date)}
                              </span>
                            </div>
                            <p className="truncate text-navy-600 dark:text-slate-300 text-[11px]">
                              {j.address}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono font-bold text-navy-700 dark:text-slate-200">
                            {gbp(j.fee)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Deduction Amount (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input font-mono font-bold text-emerald-700"
                  placeholder="e.g. 40.00"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={repayDate}
                  onChange={(e) => setRepayDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Notes / Memo</label>
              <textarea
                className="input resize-none text-xs"
                rows={2}
                placeholder="e.g. Deducted £40 from job payout"
                value={repayNotes}
                onChange={(e) => setRepayNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setRepayOpen(false);
                  setRepayJob(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Record Deduction
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
