"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  FiTrendingUp, FiCheckSquare,
  FiClock, FiDollarSign, FiPieChart, FiPlus, FiTrash2, FiEdit2,
  FiCheckCircle, FiX, FiUsers, FiBarChart2, FiActivity, FiChevronDown, FiExternalLink,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { gbp } from "@/lib/format";
import { statusMeta, DEFAULT_TRANSFER_FEE } from "@/lib/constants";
import {
  getPeriodRange, shiftRef, computeStats, buildSeries, expensesForRange,
  computeEngineerPay, computePipeline, computeCashflow, trendVs, jobInRange,
} from "@/lib/stats";
import { parkingSummary, congestionSummary } from "@/lib/finance";
import { serviceShort } from "@/lib/format";
import { isWithinInterval, parseISO, getDay } from "date-fns";
import EngineerPayModal from "@/components/EngineerPayModal";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import BarChart from "@/components/BarChart";
import RequirePermission from "@/components/RequirePermission";
import PeriodControls from "@/components/PeriodControls";
import { usePeriodRange, REPORTS_STORAGE_KEY } from "@/lib/usePeriodRange";
import Link from "next/link";
import { LuChartPie } from "react-icons/lu";

// Remembers the last period/range you picked so leaving Reports and coming
// back (or refreshing) doesn't silently reset it to "this month". Same key
// the Dashboard reads/writes — see REPORTS_STORAGE_KEY's own comment.
const VIEW_STORAGE_KEY = REPORTS_STORAGE_KEY;
function loadSavedView() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || "null"); } catch { return null; }
}

const REPORT_TABS = [
  { k: "pnl", l: "P&L" },
  { k: "expenses", l: "Expenses" },
  { k: "trends", l: "Trends" },
  { k: "pay", l: "Engineer pay" },
  { k: "pipeline", l: "Pipeline" },
];

const EXPENSE_CATEGORIES = ["Staffing", "Technology", "Marketing", "Operations", "Legal", "Vehicles", "Insurance", "Bank Transfer Fees", "Other"];

const CAT_COLORS = {
  Staffing: "bg-blue-100 text-blue-700",
  Technology: "bg-purple-100 text-purple-700",
  Marketing: "bg-pink-100 text-pink-700",
  Operations: "bg-amber-100 text-amber-700",
  Legal: "bg-navy-100 text-navy-700",
  Vehicles: "bg-orange-100 text-orange-700",
  Insurance: "bg-teal-100 text-teal-700",
  "Bank Transfer Fees": "bg-slate-100 text-slate-600",
  Other: "bg-gray-100 text-gray-600",
};

// One figure in the phone P&L: label + caption on the left, value right, with
// the change-vs-previous chip beside the label rather than as its own column —
// there isn't room for a fourth column on a 375px screen.
function RRow({ label, sub, value, trend, onClick }) {
  return (
    <div className={`m-row ${onClick ? "cursor-pointer active:opacity-70" : ""}`} onClick={onClick}>
      <span className="m-row-main">
        <span className="m-row-label">
          {label}
          {trend && (
            <span className={`m-row-trend ${trend.direction === "down" ? "m-row-trend-down" : "m-row-trend-up"}`}>
              {trend.direction === "down" ? "▼" : "▲"} {trend.value}
            </span>
          )}
        </span>
        <span className="m-row-sub">{sub}</span>
      </span>
      <span className="m-row-val">{value}</span>
    </div>
  );
}

export default function ReportsPage() {
  return <RequirePermission anyOf={["reports", "expenses"]}><ReportsInner /></RequirePermission>;
}

function ReportsInner() {
  const { can } = useAuth();
  // A user granted only "expenses" (not the full "reports" permission) is
  // here to log/view company expenses — not to see revenue, margins, or
  // engineer pay. Lock them to that one tab instead of hiding-then-showing
  // the rest, which would leak state (period/range) built for a fuller view.
  const expensesOnly = !can("reports") && can("expenses");
  const { jobs, engineers, expenses, engineerPayments, addExpense, updateExpense, removeExpense, addEngineerPayment, removeEngineerPayment } = useStore();
  // Holds just the engineer id, not the row object itself — the row is
  // re-derived from `pay.rows` on every render below. Storing the object
  // directly used to freeze it at click-time: editing a job's payable
  // amount inside the modal correctly updated the job and recomputed `pay`,
  // but the modal kept showing this frozen snapshot, so the edit looked
  // like it hadn't saved even though it had.
  const [payModalEngineerId, setPayModalEngineerId] = useState(null);
  const [metric, setMetric] = useState("revenue");
  // Which tab you were on is remembered alongside the period/range that was
  // already persisted here — refreshing while three tabs deep in Engineer pay
  // and landing back on P&L every time is a small thing that gets old fast.
  // Resolved synchronously in the initialiser so the right tab paints on the
  // first frame rather than flashing P&L and then switching.
  const [view, setView] = useState(() => {
    if (expensesOnly) return "expenses";
    const saved = loadSavedView();
    return REPORT_TABS.some((t) => t.k === saved?.tab) ? saved.tab : "pnl";
  });
  // Period/range state + persistence, shared with the Jobs list so both
  // pickers behave the same. `tab` rides along in the same saved record.
  const ctl = usePeriodRange(VIEW_STORAGE_KEY, {
    defaultPeriod: "month",
    extra: expensesOnly ? undefined : { tab: view },
  });
  const { period, ref, setRef, range, isCurrent } = ctl;

  const [editingExp, setEditingExp] = useState(null); // { id } or "new"
  const [feesOpen, setFeesOpen] = useState(false);
  const [expForm, setExpForm] = useState({ name: "", amount: "", category: "Operations", date: new Date().toISOString().slice(0, 10), recurring: false });

  const stats = useMemo(() => computeStats(jobs, range, engineers, engineerPayments), [jobs, range, engineers, engineerPayments]);
  // Previous period — powers the ▲/▼ change badges on every KPI card. A
  // custom range has no natural "previous" window, so skip the comparison
  // rather than shifting by a month that doesn't match the range length.
  const prevStats = useMemo(() => {
    if (period === "custom") return stats;
    const prevRange = getPeriodRange(period, shiftRef(period, ref, -1));
    return computeStats(jobs, prevRange, engineers, engineerPayments);
  }, [jobs, period, ref, stats, engineers, engineerPayments]);
  const cashflow = useMemo(() => computeCashflow(jobs, range), [jobs, range]);
  const series = useMemo(() => buildSeries(jobs, period, range), [jobs, period, range]);
  const pay = useMemo(() => computeEngineerPay(jobs, range, engineers, engineerPayments), [jobs, range, engineers, engineerPayments]);
  // Pipeline used to be computed over EVERY job ever, ignoring the period
  // selector sitting directly above it — changing Month/Year/Range did
  // nothing to these figures, which is what made the tab look broken.
  const pipelineJobs = useMemo(() => jobs.filter((j) => jobInRange(j, range)), [jobs, range]);
  const pipeline = useMemo(() => computePipeline(pipelineJobs), [pipelineJobs]);
  // Add-on charges (parking, congestion) billed on top of the job. Same
  // "did the visit actually happen" gate revenue uses — a quote carrying a
  // parking line hasn't collected anything yet.
  const addons = useMemo(() => {
    const done = jobs.filter((j) => jobInRange(j, range) && ["completed", "invoiced", "paid"].includes(j.status));
    return { parking: parkingSummary(done), congestion: congestionSummary(done) };
  }, [jobs, range]);

  // Most recent job activity — used both to auto-jump on first load and to
  // power the "jump to latest activity" hint when a viewed period is empty.
  const latestActivityRef = useMemo(() => {
    const dated = jobs
      .map((j) => j.scheduledAt || j.createdAt)
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d) && d <= new Date());
    return dated.length ? new Date(Math.max(...dated.map((d) => d.getTime()))) : null;
  }, [jobs]);
  const latestActivityLabel = useMemo(
    () => (latestActivityRef ? getPeriodRange("month", latestActivityRef).label : ""),
    [latestActivityRef]
  );

  // If the current month has no revenue-relevant jobs but an earlier month does,
  // land on that month instead of a wall of £0.00 that reads as "data is missing."
  // Runs once per data load, and never overrides a manual navigation.
  const autoJumped = useRef(false);
  useEffect(() => {
    if (autoJumped.current || !jobs.length || period !== "month" || !isCurrent) return;
    autoJumped.current = true;
    if (stats.total > 0 || !latestActivityRef) return;
    setRef(latestActivityRef);
  }, [jobs, period, isCurrent, stats.total, latestActivityRef]);

  // Expenses for this period (recurring always included; one-time if date in range)
  // Recurring costs are counted once per MONTH the range covers — see
  // expensesForRange(). Doing it inline here counted a monthly subscription
  // once no matter how wide the range was, so July + August never equalled
  // Jul–Aug and every multi-month view understated its costs.
  const expBreakdown = useMemo(() => expensesForRange(expenses, range), [expenses, range]);
  const periodExpenses = expBreakdown.items;
  const loggedExpenses = expBreakdown.total;
  // Bank fees on engineer transfers are a company expense, not engineer pay —
  // the bank charges them, the engineer never sees them. addEngineerPayment()
  // (lib/store.js) now logs the fee as a real, dated expense (category "Bank
  // Transfer Fees") the moment a payment is recorded, so it's already inside
  // loggedExpenses via the normal date-range filter above — it used to be a
  // derived number tacked on here instead, invisible in the expense list
  // itself and impossible to edit or delete if it was ever wrong.
  // Split the period's expenses so the auto-generated transfer fees can be
  // grouped behind one expandable row instead of flooding the list.
  const feeExpenses = periodExpenses.filter((e) => e.category === "Bank Transfer Fees");
  const otherExpenses = periodExpenses.filter((e) => e.category !== "Bank Transfer Fees");
  const feeTotal = feeExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const transferFeeExpense = feeTotal;
  const totalExpenses = loggedExpenses;
  // TWO different profit questions, and they are NOT interchangeable:
  //
  //  accrualProfit — revenue minus what this period's jobs COST in engineer
  //                  labour, whether or not it's been handed over yet. The
  //                  right number for "is the work priced properly".
  //  cashProfit    — revenue minus what actually LEFT THE BANK to engineers
  //                  in this period (payments + transfer fees). The right
  //                  number for "what have we actually kept".
  //
  // They diverge whenever a payment settles jobs from outside the range —
  // which is normal, and was why the headline read £441 while only £385 had
  // really been kept. Showing the accrual figure as the single "Net Profit"
  // while a "Paid to engineers" card sat beside it with a bigger number made
  // the page look like it was contradicting itself.
  const accrualProfit = (stats.netProfit ?? 0) - totalExpenses;
  const cashProfit = (stats.netProfitAfterPay ?? 0) - totalExpenses;
  const cashProfitPct = stats.revenue > 0 ? Math.round((cashProfit / stats.revenue) * 100) : 0;
  const accrualProfitPct = stats.revenue > 0 ? Math.round((accrualProfit / stats.revenue) * 100) : 0;
  // Kept for the existing P&L rows further down that already read these names.
  const trueProfit = accrualProfit;
  const trueProfitAfterPay = cashProfit;
  const trueProfitPct = accrualProfitPct;
  const showSundayPayReminder = period === "week" && [0, 6].includes(getDay(new Date())) && pay.totalBalance > 0;

  // Group expenses by category for chart. "Bank Transfer Fees" is a normal
  // category now (see addEngineerPayment in lib/store.js), not injected here.
  const expByCategory = EXPENSE_CATEGORIES.map((cat) => ({
    cat,
    total:
      expBreakdown.oneTime.filter((e) => e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0) +
      expBreakdown.recurring.filter((e) => e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0) * expBreakdown.months,
  })).filter((e) => e.total > 0);

  const saveExpense = () => {
    if (!expForm.name.trim() || !expForm.amount) return;
    if (editingExp === "new") {
      addExpense({ ...expForm, amount: Number(expForm.amount) });
    } else {
      updateExpense(editingExp, { ...expForm, amount: Number(expForm.amount) });
    }
    setEditingExp(null);
    setExpForm({ name: "", amount: "", category: "Operations", date: new Date().toISOString().slice(0, 10), recurring: false });
  };

  const startEdit = (exp) => {
    setExpForm({ name: exp.name, amount: String(exp.amount), category: exp.category, date: exp.date, recurring: !!exp.recurring });
    setEditingExp(exp.id);
  };

  return (
    <>
      <PageHeader
        icon={FiActivity}
        title={expensesOnly ? "Company Expenses" : "Reports"}
        subtitle={expensesOnly ? "Log and review company expenses" : "Revenue, profit and financial overview"}
        // Summary opens from here rather than from the nav. It's the same
        // period and the same figures as the tabs below, laid out in full —
        // so it belongs next to them, not as a second financial section in
        // the sidebar competing with this one.
        actions={!expensesOnly && (
          <Link href="/summary" className="btn-outline shrink-0" title="Full breakdown of this period — finances, engineer pay, funnel, expenses">
            <LuChartPie className="h-4 w-4" />
            <span className="hidden sm:inline">Summary</span>
          </Link>
        )}
      />

      <div className="page space-y-6">
        {/* Section tabs — each financial area gets its own dedicated view.
            An expenses-only user only ever sees the one tab they're allowed
            into — no point showing tabs that just redirect them away. */}
        {!expensesOnly && (
          <div className="scroll-area -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-1 p-1">
              {REPORT_TABS.map(({k,l}) => (
                <button key={k} onClick={() => setView(k)}
                  className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-semibold transition ${view===k?"bg-navy-800 text-white dark:bg-white/15":"text-navy-500 hover:bg-navy-50 dark:hover:bg-white/5"}`}
                >{l}</button>
              ))}
            </div>
          </div>
        )}

        {view === "pipeline" && <PipelineView pipeline={pipeline} />}

        {/* Shared period controls — apply to every financial tab except Pipeline */}
        {view !== "pipeline" && <>
          {showSundayPayReminder && !expensesOnly && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-900">Engineer pay due — {range.label}</p>
                <p className="text-xs text-amber-700">
                  Sunday pay run: <strong>{gbp(pay.totalBalance)}</strong> outstanding across engineers.
                </p>
              </div>
              <button
                className="btn-primary shrink-0"
                onClick={() => {
                  const first = pay.rows.find((r) => r.balance > 0);
                  if (first) setPayModalEngineerId(first.id);
                }}
              >
                Review engineer pay
              </button>
            </div>
          )}

          <PeriodControls ctl={ctl} />

        </>}

        {/* ════ P&L TAB ════ */}
        {view === "pnl" && <>
          {stats.total === 0 && latestActivityRef && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
              <p className="text-sm text-amber-200">
                No jobs in {range.label} — your most recent activity was {latestActivityLabel}.
              </p>
              <button onClick={() => setRef(latestActivityRef)} className="btn-outline shrink-0">
                Jump to {latestActivityLabel}
              </button>
            </div>
          )}
          {/* ── PHONE: one bottom line, then grouped rows ─────────────────
              Seven saturated stat slabs stacked to ~1270px on a phone, in two
              competing greens, with every figure at the same volume. Same
              information as the grid below, ~810px, and it opens on the number
              you came for. See .m-hero / .m-group in globals.css. */}
          <div className="lg:hidden">
            <div className="m-hero">
              <p className="m-hero-label">Profit · {range.label}</p>
              <p className="m-hero-value bg-gradient-to-br from-emerald-400 to-green-600 bg-clip-text text-transparent">{gbp(accrualProfit)}</p>
              <div className="m-hero-foot">
                <span className="m-hero-chip">{accrualProfitPct}% of revenue</span>
                <span>after engineers &amp; expenses</span>
              </div>
            </div>

            <p className="m-group-title">Money in</p>
            <div className="m-group">
              <RRow label="Revenue" sub="Completed · invoiced · paid"
                value={gbp(stats.revenue)} trend={trendVs(stats.revenue, prevStats.revenue)} />
              <RRow label="Collected" sub={`${gbp(stats.outstanding)} outstanding`}
                value={gbp(stats.collected)} trend={trendVs(stats.collected, prevStats.collected)} />
            </div>

            <p className="m-group-title">Money out</p>
            <div className="m-group">
              <RRow label="Engineer cost" sub="Work done this period"
                value={gbp(pay.totalAccrued ?? 0)} onClick={() => setView("pay")} />
              <RRow label="Company expenses"
                sub={`${periodExpenses.length} logged${transferFeeExpense > 0 ? " · incl. bank fees" : ""}`}
                value={gbp(totalExpenses)} onClick={() => setView("expenses")} />
            </div>

            <p className="m-group-title">Activity</p>
            <div className="m-group">
              <RRow label="Jobs completed" sub={`${stats.total} in period`}
                value={stats.completed} trend={trendVs(stats.completed, prevStats.completed)} />
              <RRow label="Avg job value" sub="Per completed job"
                value={gbp(stats.avgValue)} trend={trendVs(stats.avgValue, prevStats.avgValue)} />
            </div>
          </div>

          {/* ── TOP STAT CARDS — each shows change vs the previous period ── */}
          <div className="hidden grid-cols-1 gap-4 sm:grid-cols-2 lg:grid lg:grid-cols-3 xl:grid-cols-4">
            <StatCard tone="light" icon={FiTrendingUp} label="Revenue" value={gbp(stats.revenue)}
              sub="Completed · invoiced · paid" trend={trendVs(stats.revenue, prevStats.revenue)} />
            <StatCard tone="light" icon={FiDollarSign} label="Collected" value={gbp(stats.collected)}
              sub={`${gbp(stats.outstanding)} outstanding`} trend={trendVs(stats.collected, prevStats.collected)} />
            {/* True bottom line — engineer costs AND company expenses both
                deducted. This card used to show profit after engineer costs
                only (a different, higher number than the "True Net Profit"
                row at the bottom of this same page), which read as the
                figure being wrong rather than just a different definition.
                No trend arrow: comparing to the previous period would need
                that period's expenses too, which isn't computed here. */}
            {/* Headline is the ACCRUAL figure — same basis as Revenue above
                it and as the Dashboard's own Profit card: a job's cost counts
                toward the period its WORK fell in, not whichever period the
                payment run happened to land in. The cash figure (what
                actually left the bank) sits in the P&L breakdown below,
                still visible, just no longer the headline — a payment that
                settles jobs from outside this range used to make the
                headline jump around for reasons that had nothing to do with
                this period's own performance. */}
            <StatCard tone="green" icon={FiPieChart} label="Money kept" value={gbp(accrualProfit)}
              sub={`${accrualProfitPct}% of revenue · after engineer costs & expenses`} />
            {/* The two money-OUT figures sit together, in red, immediately
                after the bottom line — they're the pair you read against each
                other, and engineer cost being stranded in the second row
                separated it from the expenses it belongs beside. */}
            <StatCard tone="light" icon={FiUsers} label="Engineer cost" value={gbp(pay.totalAccrued ?? 0)}
              valueTone="negative" sub="Work done this period" onClick={() => setView("pay")} />
            <StatCard tone="light" icon={FiBarChart2} label="Company expenses" value={gbp(totalExpenses)}
              valueTone="negative"
              sub={`${periodExpenses.length} expense${periodExpenses.length !== 1 ? "s" : ""} this period`}
              onClick={() => setView("expenses")} />
            <StatCard tone="light" icon={FiCheckSquare} label="Jobs completed" value={stats.completed}
              sub={`${stats.total} in period`} trend={trendVs(stats.completed, prevStats.completed)} />
            <StatCard tone="light" icon={FiClock} label="Avg job value" value={gbp(stats.avgValue)}
              sub="Per completed job" trend={trendVs(stats.avgValue, prevStats.avgValue)} />
          </div>

          {/* ── ADD-ON CHARGES — parking and congestion are billed on top of
              the job and reimbursed separately, so what the business actually
              KEEPS on them is a genuine (small) profit line that nothing on
              this page surfaced. Deliberately a compact row: these are tens of
              pounds next to hundreds, and sizing them like the headline KPIs
              would overstate them. */}
          {(addons.parking.collected > 0 || addons.congestion.collected > 0) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="metric-card">
                <p className="metric-label">Parking collected</p>
                <p className="metric-value mt-1.5 text-xl">{gbp(addons.parking.collected)}</p>
                <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">From customers</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Parking kept</p>
                <p className={`metric-value mt-1.5 text-xl ${addons.parking.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {gbp(Math.abs(addons.parking.net))}
                </p>
                <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">
                  After {gbp(addons.parking.reimbursed)} reimbursed
                </p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Congestion collected</p>
                <p className="metric-value mt-1.5 text-xl">{gbp(addons.congestion.collected)}</p>
                <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">From customers</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Congestion kept</p>
                <p className={`metric-value mt-1.5 text-xl ${addons.congestion.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {gbp(Math.abs(addons.congestion.net))}
                </p>
                <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">
                  After {gbp(addons.congestion.reimbursed)} reimbursed
                </p>
              </div>
            </div>
          )}

          {/* ── CASHFLOW HEALTH — collection efficiency, not just totals ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="metric-card">
              <p className="metric-label">Collection rate</p>
              <p className="metric-value mt-2">{cashflow.collectionRate != null ? `${cashflow.collectionRate}%` : "—"}</p>
              <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">Of invoiced work in this period that&apos;s been paid</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Avg days to payment</p>
              <p className="metric-value mt-2">{cashflow.avgDaysToPay != null ? cashflow.avgDaysToPay : "—"}</p>
              <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">From invoice sent to money in</p>
            </div>
            <div className={`metric-card ${cashflow.overdueCount > 0 ? "border-rose-200 dark:border-rose-500/30" : ""}`}>
              <p className="metric-label">Overdue invoices</p>
              <p className={`metric-value mt-2 ${cashflow.overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                {cashflow.overdueCount}
              </p>
              <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">
                {cashflow.overdueCount > 0 ? `${gbp(cashflow.overdueValue)} unpaid for 7+ days — chase these` : "Nothing unpaid over 7 days"}
              </p>
            </div>
          </div>

          {/* ── P&L BREAKDOWN ── */}
          <div className="panel mx-auto max-w-[720px]">
            <div className="panel-head panel-head-ruled">
              <span className="panel-title">Profit &amp; Loss · {range.label}</span>
            </div>
            <div className="divide-y divide-navy-100">
              {/* Revenue */}
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600"><FiTrendingUp className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Gross Revenue</p>
                    <p className="text-xs text-navy-400">Completed, invoiced & paid jobs</p>
                  </div>
                </div>
                <span className="text-base font-black text-navy-900">{gbp(stats.revenue)}</span>
              </div>
              {/* Engineer labour */}
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700"><FiUsers className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Engineer Costs</p>
                    <p className="text-xs text-navy-400">Labour ({pay.rows.filter(r=>r.jobs>0).map(r=>`${r.name} ${r.payLabel}`).join(", ") || "—"}) + VAT + parking</p>
                  </div>
                </div>
                <span className="text-base font-black text-navy-900">− {gbp(pay.totalOwed)}</span>
              </div>
              {/* Net after engineers (accrued) */}
              <div className="flex items-center justify-between px-5 py-3">
                <p className="text-sm font-semibold text-navy-600 pl-11">Net after engineers (accrued)</p>
                <span className="text-sm font-bold text-navy-800">{gbp(stats.netProfit ?? 0)} <span className="text-xs font-normal text-navy-400">({stats.profitMargin ?? 0}%)</span></span>
              </div>
              {pay.totalPaid > 0 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-navy-100">
                  <div className="pl-11">
                    <p className="text-sm font-semibold text-navy-600">Engineer pay recorded</p>
                    {pay.totalTransferFees > 0 && (
                      <p className="text-xs text-navy-400">
                        What engineers received. {gbp(pay.totalCashOut)} left the account in total —
                        the {gbp(pay.totalTransferFees)} of bank fees for these jobs is logged as its own
                        expense and counted under expenses below.
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-navy-900">− {gbp(pay.totalPaid)}</span>
                </div>
              )}
              {pay.totalBalance > 0 && (
                <div className="flex items-center justify-between px-5 py-2">
                  <p className="text-sm font-medium text-navy-600 pl-11">Still owed to engineers</p>
                  <span className="text-sm font-bold text-navy-900">{gbp(pay.totalBalance)}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-5 py-3 border-t border-navy-100">
                <p className="text-sm font-semibold text-brand-800 pl-11">Profit after engineer pay (cash)</p>
                <span className="text-sm font-bold text-brand-700">{gbp(stats.netProfitAfterPay ?? 0)}</span>
              </div>
              {/* Company expenses */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-rose-50/40 dark:bg-rose-500/[0.08]">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-100 text-rose-600"><FiBarChart2 className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">Company Expenses</p>
                    <p className="text-xs text-navy-400">
                      {periodExpenses.length} expense{periodExpenses.length !== 1 ? "s" : ""} logged
                      {transferFeeExpense > 0 && ` + ${gbp(transferFeeExpense)} bank transfer fees`}
                    </p>
                  </div>
                </div>
                <span className="text-base font-black text-rose-600">− {gbp(totalExpenses)}</span>
              </div>
              {/* Bottom line — the ACCRUAL answer, matching the headline
                  "Money kept" card and the Dashboard's own Profit figure:
                  this period's revenue against what this period's OWN jobs
                  actually cost in labour, regardless of when that labour got
                  paid. The cash version sits under it, named, so the two can
                  never look like the same number disagreeing with itself. */}
              <div className={`flex items-center justify-between px-5 py-4 ${accrualProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-500/[0.10]" : "bg-rose-50 dark:bg-rose-500/[0.10]"}`}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg font-bold text-lg ${accrualProfit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>£</span>
                  <div>
                    <p className="text-sm font-bold text-navy-900">Money kept</p>
                    <p className="text-xs text-navy-400">
                      Revenue − {gbp(pay.totalOwed)} this period&rsquo;s jobs cost in labour − {gbp(totalExpenses)} expenses
                    </p>
                  </div>
                </div>
                <span className={`text-xl font-black ${accrualProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{gbp(Math.abs(accrualProfit))}</span>
              </div>
              {/* Cash view — only worth showing when it genuinely differs. */}
              {Math.abs(accrualProfit - cashProfit) > 0.005 && (
                <div className="flex items-center justify-between border-t border-navy-100 px-5 py-3">
                  <div className="pl-11">
                    <p className="text-sm font-semibold text-navy-600">On a cash basis</p>
                    <p className="text-xs text-navy-400">
                      Using the {gbp(pay.totalCashOut ?? pay.totalPaid)} that actually left the bank this period rather than what this
                      period&rsquo;s jobs cost — the two differ when a payment settles jobs from outside this range.
                    </p>
                  </div>
                  <span className="text-sm font-bold text-navy-800">{gbp(cashProfit)}</span>
                </div>
              )}
            </div>
          </div>

        </>}

        {/* ════ EXPENSES TAB ════ */}
        {view === "expenses" && <>
          {/* ── COMPANY EXPENSES MANAGER ── */}
          <div className="panel">
            <div className="panel-head panel-head-ruled flex-wrap">
              <div>
                <span className="panel-title">Company Expenses · {range.label}</span>
                <p className="panel-sub">Phone bills · salaries · software · domain · anything ongoing</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-navy-500">
                  Total <strong className="text-base font-black text-rose-600">{gbp(totalExpenses)}</strong>
                </span>
                <button onClick={() => { setEditingExp("new"); setExpForm({ name: "", amount: "", category: "Operations", date: new Date().toISOString().slice(0, 10), recurring: false }); }}
                  className="btn-primary py-1.5 text-xs">
                  <FiPlus /> Add expense
                </button>
              </div>
            </div>

            {/* Inline add/edit form */}
            {editingExp && (
              <div className="border-b border-brand-100 bg-brand-50/50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="lg:col-span-2">
                    <label className="label">Expense name</label>
                    <input className="input" placeholder="e.g. Phone number · AI subscription" value={expForm.name}
                      onChange={(e) => setExpForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                  </div>
                  <div>
                    <label className="label">Amount (£)</label>
                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={expForm.amount}
                      onChange={(e) => setExpForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select className="input" value={expForm.category} onChange={(e) => setExpForm(f => ({ ...f, category: e.target.value }))}>
                      {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input className="input" type="date" value={expForm.date} onChange={(e) => setExpForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-navy-600">
                    <input type="checkbox" checked={expForm.recurring} onChange={(e) => setExpForm(f => ({ ...f, recurring: e.target.checked }))}
                      className="h-4 w-4 rounded border-navy-300 text-brand-500" />
                    Recurring (show every period)
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingExp(null)} className="btn-outline py-1.5 text-xs"><FiX /> Cancel</button>
                    <button onClick={saveExpense} className="btn-primary py-1.5 text-xs"><FiCheckCircle /> Save</button>
                  </div>
                </div>
              </div>
            )}

            {/* Expenses list.
                Only ever shows expenses that are actually IN the selected
                period. Out-of-period rows used to render dimmed with an
                "outside period" note, which meant a list headed "August 2026"
                was quietly padded with July's rows that no total on the page
                counted — greyed-out noise you had to mentally filter. If you
                want another month's expenses, change the period. */}
            {periodExpenses.length === 0 ? (
              <p className="p-8 text-center text-sm text-navy-400">
                {expenses.length === 0
                  ? "No expenses logged yet. Add phone bills, salaries, software costs and more."
                  : `No expenses in ${range.label}. Change the period above to see others.`}
              </p>
            ) : (
              <div className="divide-y divide-navy-100">
                {/* Bank transfer fees collapse into ONE row. They're generated
                    automatically — one per engineer payment — so at any real
                    volume they bury every hand-logged expense under a wall of
                    identical £0.74 lines. One summary row that expands into
                    the individual fees keeps them auditable without the mess. */}
                {feeExpenses.length > 0 && (
                  <>
                    <button
                      onClick={() => setFeesOpen((v) => !v)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-navy-50"
                    >
                      <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${CAT_COLORS["Bank Transfer Fees"] || CAT_COLORS.Other}`}>
                        Bank Transfer Fees
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy-800">
                          Bank transfer fees
                        </p>
                        <p className="text-xs text-navy-400">
                          {feeExpenses.length} transfer{feeExpenses.length !== 1 ? "s" : ""} this period · tap to {feesOpen ? "hide" : "view"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-black text-navy-900">{gbp(feeTotal)}</span>
                      <FiChevronDown className={`h-4 w-4 shrink-0 text-navy-400 transition-transform ${feesOpen ? "rotate-180" : ""}`} />
                    </button>
                    {feesOpen && feeExpenses.map((exp) => (
                      <div key={exp.id} className="flex items-center gap-3 bg-navy-50/50 py-2.5 pl-12 pr-5 dark:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-navy-700">{exp.name}</p>
                          <p className="text-xs text-navy-400">{exp.date}</p>
                        </div>
                        <span className="shrink-0 text-[13px] font-semibold text-navy-800">{gbp(Number(exp.amount) || 0)}</span>
                        <div className="flex shrink-0 gap-1">
                          {exp.linkedPaymentId && (
                            <button
                              onClick={() => setView("pay")}
                              title="Open the engineer payment this fee came from"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:border-brand-300 hover:text-brand-600"
                            >
                              <FiExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => startEdit(exp)} className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-brand-600 hover:border-brand-300">
                            <FiEdit2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {otherExpenses.map((exp) => (
                  <div key={exp.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold ${CAT_COLORS[exp.category] || CAT_COLORS.Other}`}>
                      {exp.category}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-800">{exp.name}</p>
                      <p className="text-xs text-navy-400">{exp.date}{exp.recurring ? " · recurring" : ""}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-navy-900">{gbp(Number(exp.amount) || 0)}</span>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => startEdit(exp)} className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-brand-600 hover:border-brand-300">
                        <FiEdit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeExpense(exp.id)} className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:text-rose-600 hover:border-rose-200">
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Category breakdown */}
            {expByCategory.length > 0 && (
              <div className="border-t border-navy-100 bg-navy-50/50 px-5 py-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-navy-400">Breakdown by category</p>
                <div className="flex flex-wrap gap-2">
                  {expByCategory.map(({ cat, total }) => (
                    <div key={cat} className="flex items-center gap-2 rounded-lg bg-white border border-navy-100 px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${CAT_COLORS[cat] || CAT_COLORS.Other}`}>{cat}</span>
                      <span className="text-sm font-bold text-navy-900">{gbp(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="px-5 py-3 text-[11px] text-navy-400 border-t border-navy-100">
              One-time expenses are included when their date falls in the selected period. Mark an expense as &ldquo;recurring&rdquo; to include it in every period automatically.
            </p>
          </div>

        </>}

        {/* ════ TRENDS TAB ════ */}
        {view === "trends" && <>
          {/* ── TREND CHART ── */}
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Trend</span>
              <div className="flex items-center gap-1 rounded-lg border border-navy-200 bg-white p-1">
                <button onClick={() => setMetric("revenue")} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${metric === "revenue" ? "bg-navy-800 text-white" : "text-navy-500"}`}>Revenue</button>
                <button onClick={() => setMetric("count")} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${metric === "count" ? "bg-navy-800 text-white" : "text-navy-500"}`}>Jobs</button>
              </div>
            </div>
            <div className="panel-body">
              <BarChart data={series} metric={metric} />
            </div>
          </div>

          {/* ── BREAKDOWNS ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="panel panel-body">
              <h2 className="mb-4 section-label text-sm">By service</h2>
              {stats.byService.length === 0 ? <p className="text-sm text-navy-400">No jobs in this period.</p> : (
                <ul className="space-y-3">
                  {stats.byService.map((s) => {
                    const max = stats.byService[0].count || 1;
                    return (
                      <li key={s.code}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate text-navy-700">{s.name}</span>
                          <span className="ml-2 shrink-0 font-semibold text-navy-900">{s.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-navy-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.count / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="panel panel-body">
              <h2 className="mb-4 section-label text-sm">By engineer</h2>
              {stats.byEngineer.length === 0 ? <p className="text-sm text-navy-400">No jobs in this period.</p> : (
                <ul className="space-y-3">
                  {stats.byEngineer.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                        <span className="truncate text-sm text-navy-700">{e.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-navy-900">{gbp(e.revenue)}</span>
                        <span className="block text-[11px] text-navy-400">{e.count} job{e.count !== 1 ? "s" : ""}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel panel-body">
              <h2 className="mb-4 section-label text-sm">By status</h2>
              {Object.keys(stats.byStatus).length === 0 ? <p className="text-sm text-navy-400">No jobs in this period.</p> : (
                <ul className="space-y-2.5">
                  {Object.entries(stats.byStatus).map(([key, count]) => {
                    const meta = statusMeta(key);
                    return (
                      <li key={key} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          <span className="text-navy-700">{meta.label}</span>
                        </span>
                        <span className="font-semibold text-navy-900">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

        </>}

        {/* ════ ENGINEER PAY TAB ════ */}
        {view === "pay" && <>
          {/* ── ENGINEER PAY TABLE — scoped strictly to the selected period.
              (An "all time" summary used to sit here too, but it showed a
              second, different owed figure alongside the period one, which
              read as confusing/duplicate rather than useful — removed.) ── */}
          <div className="panel">
            <div className="panel-head panel-head-ruled flex-wrap">
              <div>
                <span className="panel-title">Engineer pay · {range.label}</span>
                <p className="panel-sub">
                  &quot;Paid&quot; here means logged via Record payment below — separate from the customer&apos;s payment status on the job.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-navy-500">Owed <strong className="text-amber-700">{gbp(pay.totalOwed)}</strong></span>
                <span className="text-navy-500">Paid <strong className="text-emerald-700">{gbp(pay.totalPaid)}</strong></span>
                <span className="text-navy-500">Due <strong className="text-rose-600">{gbp(pay.totalBalance)}</strong></span>
              </div>
            </div>
            {engineers.length === 0 ? (
              /* [].every(...) is vacuously TRUE — with no engineers loaded at
                 all, pay.rows is empty and the check below couldn't tell that
                 apart from "loaded fine, genuinely no jobs this period". That
                 silently showed the same "no completed jobs" message for a
                 real loading/fetch problem as for an ordinary quiet month,
                 with nothing pointing at the actual cause. */
              <div className="p-5 text-sm text-navy-400">
                <p>Engineers haven&apos;t loaded yet — this isn&apos;t a real empty period.</p>
                <p className="mt-1 text-xs">If this doesn&apos;t resolve itself in a few seconds, reload the page.</p>
              </div>
            ) : pay.rows.every((r) => r.jobs === 0) ? (
              <div className="p-5 text-sm text-navy-400">
                <p>No completed jobs for any engineer in {range.label}.</p>
                {latestActivityRef && range.label !== latestActivityLabel && (
                  <button onClick={() => setRef(latestActivityRef)} className="btn-outline mt-3">
                    Jump to {latestActivityLabel}
                  </button>
                )}
              </div>
            ) : (
              <div className="scroll-area overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold">Engineer</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Jobs</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Labour</th>
                      <th className="px-3 py-2.5 text-right font-semibold">VAT</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Parking</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Paid</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {pay.rows.map((r) => (
                      <tr
                        key={r.id}
                        className={`cursor-pointer transition hover:bg-brand-50/40 ${r.jobs === 0 ? "text-navy-300" : ""}`}
                        /* Opens for ANY engineer who worked in the period.
                           Gating on owed/paid > 0 silently dead-ended rows
                           like an engineer whose only job resolved to £0
                           labour — they still have a job breakdown and bank
                           details, and the hint below promises a click works. */
                        onClick={() => { if (r.jobs > 0 || r.owed > 0 || r.paid > 0) setPayModalEngineerId(r.id); }}
                      >
                        <td className="px-5 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                            <span className="font-medium text-navy-800">{r.name}</span>
                            {r.payType === "weekly" && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Weekly</span>}
                            {r.vatRegistered && <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-500">VAT</span>}
                          </span>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-navy-700">{r.jobs}</td>
                        <td className="tnum px-3 py-2.5 text-right text-navy-700">{gbp(r.revenue)}</td>
                        <td className="tnum px-3 py-2.5 text-right text-navy-700">
                          {gbp(r.labour)} <span className="text-[11px] text-navy-400">({r.payLabel})</span>
                          {/* Say WHY a figure is below the full rate, rather
                              than leaving a lower number looking like an error. */}
                          {r.inspectionJobs > 0 && (
                            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                              {r.inspectionJobs} inspection only
                            </span>
                          )}
                          {r.certificateJobs > 0 && (
                            <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                              {r.certificateJobs} certificate only
                            </span>
                          )}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-navy-500">{r.vat > 0 ? gbp(r.vat) : "—"}</td>
                        <td className="tnum px-3 py-2.5 text-right text-navy-500">{r.parkingReimbursed > 0 ? gbp(r.parkingReimbursed) : "—"}</td>
                        <td className="tnum px-3 py-2.5 text-right text-emerald-700">{r.paid > 0 ? gbp(r.paid) : "—"}</td>
                        <td className="tnum px-5 py-2.5 text-right font-bold text-amber-700">{gbp(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-navy-200 bg-navy-50/80 dark:bg-white/[0.04]">
                    <tr>
                      <td className="px-5 py-2.5 text-sm font-bold text-navy-700" colSpan={2}>Totals</td>
                      <td className="tnum px-3 py-2.5 text-right text-sm font-bold text-navy-900">{gbp(stats.revenue)}</td>
                      {/* Labour, VAT and parking were left blank here, so the
                          only totalled money columns were revenue and what had
                          already been paid — you could not read the period's
                          total labour cost off the bottom of its own table. */}
                      <td className="tnum px-3 py-2.5 text-right text-sm font-bold text-navy-900">{gbp(pay.totalLabour)}</td>
                      <td className="tnum px-3 py-2.5 text-right text-sm font-bold text-navy-700">{pay.totalVat > 0 ? gbp(pay.totalVat) : "—"}</td>
                      <td className="tnum px-3 py-2.5 text-right text-sm font-bold text-navy-700">{pay.totalParking > 0 ? gbp(pay.totalParking) : "—"}</td>
                      <td className="tnum px-3 py-2.5 text-right text-sm font-bold text-emerald-700">{gbp(pay.totalPaid)}</td>
                      <td className="tnum px-5 py-2.5 text-right text-sm font-black text-amber-700">{gbp(pay.totalBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="px-5 py-3 text-[11px] text-navy-400">Click an engineer for job breakdown, bank details and to record payment. Labour = % cut (or weekly retainer). Parking = receipt reimbursements.</p>
          </div>

          <EngineerPayModal
            open={!!payModalEngineerId}
            onClose={() => setPayModalEngineerId(null)}
            row={payModalEngineerId ? pay.rows.find((r) => r.id === payModalEngineerId) : null}
            engineer={payModalEngineerId ? engineers.find((e) => e.id === payModalEngineerId) : null}
            range={range}
            onPay={(payment) => { addEngineerPayment(payment); }}
            onRemovePayment={removeEngineerPayment}
          />

          {/* ── PARKING ── */}
          {stats.parking && (stats.parking.collected > 0 || stats.parking.reimbursed > 0) && (
            <div className="panel">
              <div className="panel-head panel-head-ruled">
                <span className="panel-title">Parking reconciliation · {range.label}</span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-navy-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-5 text-center">
                  <p className="text-xs text-navy-400">Collected from customers</p>
                  <p className="mt-1 text-xl font-bold text-navy-900">{gbp(stats.parking.collected)}</p>
                </div>
                <div className="p-5 text-center">
                  <p className="text-xs text-navy-400">Reimbursed to engineers</p>
                  <p className="mt-1 text-xl font-bold text-amber-700">{gbp(stats.parking.reimbursed)}</p>
                </div>
                <div className="p-5 text-center">
                  <p className="text-xs text-navy-400">Net parking {stats.parking.net >= 0 ? "profit" : "cost"}</p>
                  <p className={`mt-1 text-xl font-bold ${stats.parking.net >= 0 ? "text-brand-700" : "text-rose-600"}`}>{gbp(Math.abs(stats.parking.net))}</p>
                </div>
              </div>
            </div>
          )}
        </>}
      </div>
    </>
  );
}

function PipelineView({ pipeline }) {
  const { total, quotes, booked, paid, cancelled, conversionRate, closeRate, avgDaysToBook, topServices } = pipeline;
  const bars = [
    { label: "Quotes raised", value: total, color: "bg-navy-300" },
    { label: "Booked / in progress", value: booked, color: "bg-brand-400" },
    { label: "Paid", value: paid, color: "bg-brand-600" },
  ];
  const max = Math.max(...bars.map(b => b.value), 1);
  return (
    <div className="space-y-6">
      <div className="panel panel-body mx-auto max-w-[720px]">
        <h3 className="mb-4 section-label text-sm">Quote → Paid funnel (all time)</h3>
        <div className="space-y-3">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-navy-600">
                <span>{b.label}</span><span className="font-semibold">{b.value}</span>
              </div>
              <div className="h-5 w-full rounded-full bg-navy-100">
                <div className={`h-5 rounded-full ${b.color} transition-all`} style={{ width: `${(b.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Quote → Booked</p><p className="mt-1 text-3xl font-bold text-navy-900">{conversionRate}%</p><p className="text-xs text-navy-500">{booked} of {total} quotes booked</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Booked → Paid</p><p className="mt-1 text-3xl font-bold text-navy-900">{closeRate}%</p><p className="text-xs text-navy-500">{paid} of {booked} booked jobs paid</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Avg days to book</p><p className="mt-1 text-3xl font-bold text-navy-900">{avgDaysToBook ?? "—"}</p><p className="text-xs text-navy-500">Quote to scheduled</p></div>
      </div>
      {topServices.length > 0 && (
        <div className="panel panel-body mx-auto max-w-[720px]">
          <h3 className="mb-3 section-label text-sm">Most requested services</h3>
          <ul className="divide-y divide-navy-100">
            {topServices.map((s) => (
              <li key={s.code} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-navy-800">{serviceShort(s.code)}</span>
                <span className="text-navy-500">{s.count} jobs</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
