"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FiPlus, FiTrash2, FiExternalLink, FiArrowLeft, FiClock,
  FiCheckCircle, FiAlertCircle, FiArrowDownRight, FiArrowUpRight,
  FiDollarSign, FiSearch, FiCalendar, FiFileText, FiUser
} from "react-icons/fi";
import { LuScale, LuWallet, LuReceipt } from "react-icons/lu";
import { useStore } from "@/lib/store";
import { gbp, fmtDate } from "@/lib/format";
import { jobFinancials } from "@/lib/finance";
import Modal from "@/components/Modal";

export default function EngineerDebtTab() {
  const {
    engineers = [],
    engineerDebts = [],
    jobs = [],
    clients = [],
    addEngineerDebt,
    logEngineerDebtRepayment,
    deleteEngineerDebtEntry,
  } = useStore();

  const [selectedEngId, setSelectedEngId] = useState("all");
  const [search, setSearch] = useState("");

  // Modals state
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);

  // Add Debt Form State
  const [debtEngId, setDebtEngId] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDate, setDebtDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [debtNotes, setDebtNotes] = useState("");

  // Log Repayment Form State
  const [repayEngId, setRepayEngId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [actualPaid, setActualPaid] = useState("");
  const [repayDate, setRepayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [repayJobId, setRepayJobId] = useState("");
  const [jobPickerQuery, setJobPickerQuery] = useState("");
  const [selectedJobObj, setSelectedJobObj] = useState(null);
  const [repayNotes, setRepayNotes] = useState("");

  // Engineer lookup
  const engMap = useMemo(() => {
    return Object.fromEntries(engineers.map((e) => [e.id, e]));
  }, [engineers]);

  
  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);

  function getPropertyAddress(j) {
    if (!j) return "—";
    const cl = clientMap[j.clientId];
    const pr = cl?.properties?.find(p => p.id === j.propertyId);
    return pr?.address || j.nameOnCert || cl?.name || "Address not recorded";
  }

  // Engineer-specific jobs for picker
  const engineerJobs = useMemo(() => {
    if (!repayEngId) return [];
    const paidJobIds = new Set(
      (engineerPayments || [])
        .filter((p) => p.engineerId === repayEngId)
        .flatMap((p) => p.jobIds || [])
    );
    return (jobs || [])
      .filter(j => {
        if (j.engineerId === repayEngId) return true;
        if (Array.isArray(j.visits) && j.visits.some(v => v.engineerId === repayEngId)) return true;
        if (paidJobIds.has(j.id)) return true;
        return false;
      })
      .slice()
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }, [jobs, repayEngId, engineerPayments]);

  const filteredPickerJobs = useMemo(() => {
    const q = jobPickerQuery.trim().toLowerCase();
    if (!q) return engineerJobs.slice(0, 10);
    const matched = engineerJobs.filter(j => {
      const jid = (j.id || "").toLowerCase();
      const addr = getPropertyAddress(j).toLowerCase();
      const cl = (clientMap[j.clientId]?.name || "").toLowerCase();
      return jid.includes(q) || addr.includes(q) || cl.includes(q);
    });
    if (matched.length > 0) return matched.slice(0, 10);
    // Search all jobs so any job (like JOB-4395) is findable
    return (jobs || []).filter(j => {
      const jid = (j.id || "").toLowerCase();
      const addr = getPropertyAddress(j).toLowerCase();
      const cl = (clientMap[j.clientId]?.name || "").toLowerCase();
      return jid.includes(q) || addr.includes(q) || cl.includes(q);
    }).slice(0, 10);
  }, [engineerJobs, jobPickerQuery, clientMap, jobs]);

  // Per-engineer calculation
  const engineerSummaries = useMemo(() => {
    const map = new Map();
    for (const e of engineerDebts) {
      if (!map.has(e.engineerId)) {
        map.set(e.engineerId, { totalDebt: 0, totalRepaid: 0, entries: [] });
      }
      const s = map.get(e.engineerId);
      s.entries.push(e);
      if (e.type === "debt") s.totalDebt += Number(e.amount) || 0;
      if (e.type === "repayment") s.totalRepaid += Number(e.amount) || 0;
    }

    const list = [];
    for (const [engId, data] of map.entries()) {
      const eng = engMap[engId];
      const bal = Math.max(0, Math.round((data.totalDebt - data.totalRepaid) * 100) / 100);
      list.push({
        engineerId: engId,
        engineer: eng,
        name: eng?.name || engId,
        phone: eng?.phone || "",
        trade: eng?.trade || "",
        totalDebt: Math.round(data.totalDebt * 100) / 100,
        totalRepaid: Math.round(data.totalRepaid * 100) / 100,
        balance: bal,
        cleared: data.totalDebt > 0 && bal === 0,
        percentCleared: data.totalDebt > 0 ? Math.min(100, Math.round((data.totalRepaid / data.totalDebt) * 100)) : 0,
        entriesCount: data.entries.length,
      });
    }

    return list.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  }, [engineerDebts, engMap]);

  // Overall totals
  const overall = useMemo(() => {
    const totalDebt = engineerSummaries.reduce((s, x) => s + x.totalDebt, 0);
    const totalRepaid = engineerSummaries.reduce((s, x) => s + x.totalRepaid, 0);
    const activeBalance = Math.max(0, Math.round((totalDebt - totalRepaid) * 100) / 100);
    const activeEngineersCount = engineerSummaries.filter((x) => x.balance > 0).length;
    return {
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalRepaid: Math.round(totalRepaid * 100) / 100,
      activeBalance,
      activeEngineersCount,
    };
  }, [engineerSummaries]);

  // Filtered ledger entries
  const filteredEntries = useMemo(() => {
    return engineerDebts
      .filter((e) => {
        if (selectedEngId !== "all" && e.engineerId !== selectedEngId) return false;
        if (search) {
          const q = search.toLowerCase();
          const engName = (engMap[e.engineerId]?.name || "").toLowerCase();
          const job = (e.jobId || "").toLowerCase();
          const notes = (e.notes || "").toLowerCase();
          if (!engName.includes(q) && !job.includes(q) && !notes.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  }, [engineerDebts, selectedEngId, search, engMap]);

  // Current balance for modal engineer
  const modalEngBalance = useMemo(() => {
    if (!repayEngId) return 0;
    const s = engineerSummaries.find((x) => x.engineerId === repayEngId);
    return s?.balance ?? 0;
  }, [repayEngId, engineerSummaries]);

  const handleOpenRepayFor = (engId) => {
    setRepayEngId(engId);
    setRepayAmount("");
    setRepayJobId("");
    setRepayNotes("");
    setRepayDate(new Date().toISOString().slice(0, 10));
    setRepayOpen(true);
  };

  const handleOpenAddDebt = (engId = "") => {
    setDebtEngId(engId || (engineers[0]?.id || ""));
    setDebtAmount("");
    setDebtNotes("");
    setDebtDate(new Date().toISOString().slice(0, 10));
    setAddDebtOpen(true);
  };

  const submitAddDebt = (e) => {
    e.preventDefault();
    if (!debtEngId || !debtAmount) return;
    addEngineerDebt({
      engineerId: debtEngId,
      amount: debtAmount,
      date: debtDate,
      notes: debtNotes,
    });
    setAddDebtOpen(false);
  };

  const submitRepay = (e) => {
    e.preventDefault();
    if (!repayEngId || !repayAmount) return;
    logEngineerDebtRepayment({
      engineerId: repayEngId,
      amount: repayAmount,
      date: repayDate,
      jobId: repayJobId,
      notes: repayNotes,
    });
    setRepayOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Outstanding */}
        <div className="card flex flex-col justify-between p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-navy-400">Total Debt Outstanding</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <LuScale className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {gbp(overall.activeBalance)}
            </span>
            <p className="mt-1 text-xs text-navy-500">
              {overall.activeEngineersCount} engineer{overall.activeEngineersCount === 1 ? "" : "s"} with pending balance
            </p>
          </div>
        </div>

        {/* Total Repaid */}
        <div className="card flex flex-col justify-between p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-navy-400">Total Debt Repaid</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <LuWallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {gbp(overall.totalRepaid)}
            </span>
            <p className="mt-1 text-xs text-navy-500">
              Cleared across historical ledger
            </p>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="card flex flex-col justify-between p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-navy-400">Quick Actions</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-100 text-navy-600 dark:bg-white/10 dark:text-navy-300">
              <LuReceipt className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleOpenAddDebt()}
              className="btn-outline flex-1 justify-center py-2 text-xs font-semibold text-rose-700 hover:border-rose-300 dark:text-rose-300"
            >
              <FiPlus /> Add Debt
            </button>
            <button
              type="button"
              onClick={() => handleOpenRepayFor(engineerSummaries[0]?.engineerId || "")}
              className="btn-primary flex-1 justify-center py-2 text-xs font-semibold"
            >
              <FiArrowDownRight /> Log Repayment
            </button>
          </div>
        </div>
      </div>

      {/* Engineer Breakdown Section */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-label text-sm">Engineers with Debt Records</h2>
            <p className="text-xs text-navy-500">Track balances independently from standard job payouts</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
              <input
                type="text"
                className="input pl-8 py-1.5 text-xs"
                placeholder="Search engineer or job..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input py-1.5 text-xs"
              value={selectedEngId}
              onChange={(e) => setSelectedEngId(e.target.value)}
            >
              <option value="all">All Engineers ({engineerSummaries.length})</option>
              {engineerSummaries.map((s) => (
                <option key={s.engineerId} value={s.engineerId}>
                  {s.name} ({gbp(s.balance)} balance)
                </option>
              ))}
            </select>
          </div>
        </div>

        {engineerSummaries.length === 0 ? (
          <div className="card p-8 text-center">
            <LuScale className="mx-auto h-10 w-10 text-navy-300 dark:text-navy-600" />
            <p className="mt-2 font-semibold text-navy-900">No engineer debt records yet</p>
            <p className="mt-1 text-xs text-navy-500">
              When you owe an engineer back pay or extra funds, record it here. Repayments will deduct automatically.
            </p>
            <button
              type="button"
              onClick={() => handleOpenAddDebt()}
              className="btn-primary mt-4 inline-flex items-center gap-1.5 text-xs"
            >
              <FiPlus /> Record First Debt
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {engineerSummaries.map((s) => (
              <div
                key={s.engineerId}
                className={`card p-4 transition ${
                  selectedEngId === s.engineerId ? "ring-2 ring-brand-500" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-navy-900 dark:text-white">{s.name}</h3>
                    {s.trade && <p className="text-xs text-navy-500">{s.trade}</p>}
                    {s.phone && <p className="text-xs text-navy-400">{s.phone}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      s.cleared
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                    }`}
                  >
                    {s.cleared ? "Cleared ✓" : "Owed"}
                  </span>
                </div>

                <div className="mt-3 border-t border-navy-100 pt-3 dark:border-white/10">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-navy-500">Remaining Balance:</span>
                    <span className="text-base font-extrabold text-navy-900 dark:text-white">
                      {gbp(s.balance)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-navy-400">
                    <span>Repaid: {gbp(s.totalRepaid)}</span>
                    <span>Total Debt: {gbp(s.totalDebt)}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${s.percentCleared}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedEngId(selectedEngId === s.engineerId ? "all" : s.engineerId)}
                    className="text-xs font-semibold text-navy-500 hover:text-navy-900 dark:hover:text-white"
                  >
                    {selectedEngId === s.engineerId ? "Show all" : "Filter history →"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenRepayFor(s.engineerId)}
                    disabled={s.balance <= 0}
                    className="btn-primary py-1 px-2.5 text-xs font-semibold disabled:opacity-40"
                  >
                    <FiArrowDownRight /> Repay
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ledger History Table */}
      <section className="card overflow-hidden">
        <div className="border-b border-navy-100 bg-navy-50 px-5 py-3 dark:border-white/10 dark:bg-navy-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-navy-900 dark:text-white">Debt & Repayment Ledger</h3>
            <p className="text-xs text-navy-500">
              {filteredEntries.length} transaction{filteredEntries.length === 1 ? "" : "s"} logged
            </p>
          </div>
          {selectedEngId !== "all" && (
            <button
              type="button"
              onClick={() => setSelectedEngId("all")}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Clear filter ({engMap[selectedEngId]?.name})
            </button>
          )}
        </div>

        {filteredEntries.length === 0 ? (
          <p className="p-8 text-center text-xs text-navy-400">No transactions matching your selection.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-navy-100 text-[11px] font-bold uppercase tracking-wider text-navy-400 dark:border-white/10">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Engineer</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Linked Job</th>
                  <th className="py-2.5 px-4">Notes / Description</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 dark:divide-white/5">
                {filteredEntries.map((e) => {
                  const eng = engMap[e.engineerId];
                  const isRepayment = e.type === "repayment";
                  return (
                    <tr key={e.id} className="hover:bg-navy-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono text-navy-600 dark:text-navy-300">
                        {fmtDate(e.date || e.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-navy-900 dark:text-white">
                        {eng?.name || e.engineerId}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isRepayment
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                          }`}
                        >
                          {isRepayment ? (
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
                      <td className="py-3 px-4 font-mono font-bold">
                        <span className={isRepayment ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                          {isRepayment ? "−" : "+"}{gbp(e.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {e.jobId ? (
                          <Link
                            href={`/jobs/${e.jobId}`}
                            className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
                          >
                            {e.jobId} <FiExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-navy-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-navy-600 dark:text-navy-300">
                        {e.notes || "No notes recorded"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this debt ledger entry?")) {
                              deleteEngineerDebtEntry(e.id);
                            }
                          }}
                          className="text-navy-400 hover:text-rose-600 dark:hover:text-rose-400"
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
      </section>

      {/* Add Debt Modal */}
      {addDebtOpen && (
        <Modal open={addDebtOpen} onClose={() => setAddDebtOpen(false)} onBack={() => setAddDebtOpen(false)} title="Record Debt Owed to Engineer">
          <form onSubmit={submitAddDebt} className="space-y-4 text-sm">
            <p className="text-xs text-navy-500">
              Log an initial or historical debt amount owed to an engineer. This stays completely separate from regular job payroll.
            </p>

            <div>
              <label className="label">Engineer</label>
              <select
                className="input"
                value={debtEngId}
                onChange={(e) => setDebtEngId(e.target.value)}
                required
              >
                <option value="">Select an engineer</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} {e.trade ? `(${e.trade})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Debt Amount (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input font-mono"
                  placeholder="e.g. 500.00"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Date Recorded</label>
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
                placeholder="e.g. Backlog owed from previous period, settled outside app"
                value={debtNotes}
                onChange={(e) => setDebtNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-outline flex items-center gap-1" onClick={() => setAddDebtOpen(false)}>
                <FiArrowLeft /> Back
              </button>
              <button type="submit" className="btn-primary">
                Save Debt Record
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Log Repayment Modal */}
      {repayOpen && (
        <Modal
          open={repayOpen}
          onClose={() => setRepayOpen(false)}
          onBack={selectedJobObj ? () => { setSelectedJobObj(null); setRepayJobId(""); setActualPaid(""); } : () => setRepayOpen(false)}
          title="Log Debt Repayment (Deduction)"
        >
          <form onSubmit={submitRepay} className="space-y-4 text-sm">
            <p className="text-xs text-navy-500">
              Record money paid toward clearing this engineer&apos;s debt. If paid as an extra on top of a job payout, you can optionally link the Job ID.
            </p>

            <div>
              <label className="label">Engineer</label>
              <select
                className="input"
                value={repayEngId}
                onChange={(e) => setRepayEngId(e.target.value)}
                required
              >
                <option value="">Select an engineer</option>
                {engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            {repayEngId && (
              <div className="rounded-lg border border-navy-200 bg-navy-50 p-3 text-xs dark:border-white/10 dark:bg-navy-800">
                <div className="flex justify-between font-semibold">
                  <span className="text-navy-500">Current Debt Balance:</span>
                  <span className="text-rose-600 dark:text-rose-400">{gbp(modalEngBalance)}</span>
                </div>
                {repayAmount && Number(repayAmount) > 0 && (
                  <div className="mt-1.5 flex justify-between border-t border-navy-200/60 pt-1.5 font-bold dark:border-white/10">
                    <span className="text-navy-500">New Balance After Repayment:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {gbp(Math.max(0, modalEngBalance - Number(repayAmount)))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {selectedJobObj ? (
              <div className="rounded-xl border border-navy-200 bg-white p-3.5 space-y-3 dark:border-white/10 dark:bg-navy-900">
                <div className="flex items-center justify-between text-xs font-bold text-navy-800 dark:text-slate-200">
                  <span>Automatic Deduction / Repayment Calculation</span>
                  <span className="text-[11px] text-navy-400 font-normal">Job Fee: {gbp(jobFinancials(selectedJobObj, engMap[repayEngId]).payable)}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">
                      Actual Amount Sent / Paid (£)
                      <span className="ml-1 text-[10px] font-normal text-navy-400">(what you paid them)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input font-mono font-semibold"
                      placeholder="e.g. 129.99"
                      value={actualPaid}
                      onChange={(e) => {
                        const val = e.target.value;
                        setActualPaid(val);
                        const fee = jobFinancials(selectedJobObj, engMap[repayEngId]).payable;
                        const pNum = parseFloat(val);
                        if (!isNaN(pNum)) {
                          const diff = Math.round(Math.abs(pNum - fee) * 100) / 100;
                          setRepayAmount(diff > 0 ? String(diff) : "");
                          if (pNum > fee) {
                            setRepayNotes(`Repaid £${diff.toFixed(2)} extra on top of ${selectedJobObj.id} (£${fee.toFixed(2)} fee, paid £${pNum.toFixed(2)})`);
                          } else if (pNum < fee) {
                            setRepayNotes(`Deducted £${diff.toFixed(2)} from ${selectedJobObj.id} (£${fee.toFixed(2)} fee, paid £${pNum.toFixed(2)})`);
                          }
                        }
                      }}
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
                      className="input font-mono font-bold text-emerald-700 dark:text-emerald-300"
                      placeholder="e.g. 39.99"
                      value={repayAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRepayAmount(val);
                        const fee = jobFinancials(selectedJobObj, engMap[repayEngId]).payable;
                        const rNum = parseFloat(val);
                        if (!isNaN(rNum)) {
                          setActualPaid(String(Math.max(0, Math.round((fee - rNum) * 100) / 100)));
                          setRepayNotes(`Deducted £${rNum.toFixed(2)} from ${selectedJobObj.id} (£${fee.toFixed(2)} fee)`);
                        }
                      }}
                      required
                    />
                  </div>
                </div>

                {Number(repayAmount) > 0 && (
                  <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <div className="flex justify-between font-bold">
                      <span>
                        {Number(actualPaid) > Number(jobFinancials(selectedJobObj, engMap[repayEngId]).payable)
                          ? `Repayment (+${gbp(repayAmount)} extra paid over fee):`
                          : Number(actualPaid) < Number(jobFinancials(selectedJobObj, engMap[repayEngId]).payable)
                          ? `Deduction (${gbp(repayAmount)} withheld from fee):`
                          : `Repayment Amount:`}
                      </span>
                      <span className="font-mono text-sm text-emerald-700 dark:text-emerald-300">−{gbp(repayAmount)}</span>
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
                    placeholder="e.g. 30.00"
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

            <div>
              <label className="label">Associate with a Job (Optional)</label>
              {selectedJobObj ? (
                <div className="flex items-center justify-between rounded-lg border border-teal-500/40 bg-teal-50/50 p-2.5 text-xs dark:bg-teal-950/20">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
                        {selectedJobObj.id}
                      </span>
                      <span className="text-navy-400">•</span>
                      <span className="font-medium text-navy-700 dark:text-navy-200">
                        {getPropertyAddress(selectedJobObj)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-navy-500">
                      Standard Payout: <strong className="text-navy-800 dark:text-white">{gbp(jobFinancials(selectedJobObj, engMap[repayEngId]).payable)}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJobObj(null);
                      setRepayJobId("");
                    }}
                    className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-2.5 text-navy-400" />
                    <input
                      type="text"
                      className="input pl-8 text-xs"
                      placeholder="Search jobs by ID (e.g. JOB-5453), address, or client name..."
                      value={jobPickerQuery}
                      onChange={(e) => setJobPickerQuery(e.target.value)}
                    />
                  </div>
                  {repayEngId && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-navy-200 bg-white shadow-sm dark:border-white/10 dark:bg-navy-900">
                      {filteredPickerJobs.length === 0 ? (
                        <div className="p-2 text-center text-xs text-navy-400">
                          No matching jobs found for this engineer.
                        </div>
                      ) : (
                        filteredPickerJobs.map((j) => {
                          const fin = jobFinancials(j, engMap[repayEngId]);
                          return (
                            <button
                              key={j.id}
                              type="button"
                              onClick={() => {
                                setSelectedJobObj(j);
                                setRepayJobId(j.id);
                                if (!repayNotes) {
                                  setRepayNotes(`Deduction linked to ${j.id} (${getPropertyAddress(j)})`);
                                }
                              }}
                              className="flex w-full items-center justify-between border-b border-navy-100 p-2 text-left text-xs transition hover:bg-navy-50 dark:border-white/5 dark:hover:bg-white/5 last:border-b-0"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-mono font-bold text-navy-800 dark:text-white flex flex-wrap items-center gap-1.5">
                                  <span>{j.id}</span>
                                  {clientMap.get(j.clientId)?.name && (
                                    <span className="font-sans font-semibold text-xs text-navy-600 dark:text-slate-300">
                                      · {clientMap.get(j.clientId).name}
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-[11px] text-navy-500">
                                  {getPropertyAddress(j)}
                                </div>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <div className="font-semibold text-teal-600 dark:text-teal-400">
                                  {gbp(fin.payable)}
                                </div>
                                <div className="text-[10px] text-navy-400">{j.date || "No date"}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="mt-1 text-[11px] text-navy-400">
                Pick a job where you paid the engineer upfront or extra to automatically deduct from debt.
              </p>
            </div>

            <div>
              <label className="label">Payment Note / Description</label>
              <textarea
                className="input resize-none"
                rows={2}
                placeholder="e.g. Paid £120 total on JOB-5453: £90 job payout + £30 extra towards debt clearance"
                value={repayNotes}
                onChange={(e) => setRepayNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-between items-center gap-2 pt-2">
              {selectedJobObj ? (
                <button
                  type="button"
                  className="btn-outline flex items-center gap-1 text-xs"
                  onClick={() => { setSelectedJobObj(null); setRepayJobId(""); setActualPaid(""); }}
                >
                  <FiArrowLeft /> Back to Job List
                </button>
              ) : (
                <button type="button" className="btn-outline flex items-center gap-1" onClick={() => setRepayOpen(false)}>
                  <FiArrowLeft /> Back
                </button>
              )}
              <button type="submit" className="btn-primary">
                Deduct from Debt
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
