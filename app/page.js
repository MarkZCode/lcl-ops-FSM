"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiBriefcase, FiPlus, FiArrowRight, FiCalendar,
  FiDollarSign, FiBell, FiFileText, FiCheckCircle,
  FiAlertCircle, FiTrendingUp, FiPhone, FiClock,
  FiLayers, FiCreditCard, FiInbox, FiActivity, FiTarget, FiUser, FiChevronRight,
  FiBarChart2, FiPieChart, FiUsers, FiSliders, FiCheck,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { gbp, fmtDate, serviceShort } from "@/lib/format";
import { getRenewals } from "@/lib/renewals";
import { getPeriodRange, jobInRange, jobDate, computeOperatingKpis, expensesForRange, computeEngineerPay, computeStats, profitBases } from "@/lib/stats";
import { usePeriodRange, REPORTS_STORAGE_KEY } from "@/lib/usePeriodRange";
import PeriodControls from "@/components/PeriodControls";
import { isToday, parseISO } from "date-fns";
import DailyActivityPanel from "@/components/DailyActivityPanel";
import OpsBoard from "@/components/OpsBoard";
import DashboardBrief from "@/components/DashboardBrief";
import DashboardTasks from "@/components/DashboardTasks";
import NeedsDecisionPanel from "@/components/NeedsDecisionPanel";
import CoverageMap from "@/components/CoverageMap";
import RevenueChart from "@/components/RevenueChart";
import JobModal from "@/components/JobModal";
import { useSectionTour } from "@/components/OnboardingTour";
import { useAuth } from "@/lib/auth";
import LogoMark from "@/components/LogoMark";
import { MoneyCounter } from "@/components/AnimatedCounter";

const PIPELINE = [
  { key: "quote",       label: "Quotes",      dot: "bg-slate-400",  card: "", val: "text-slate-700 dark:text-slate-200", sub: "text-slate-500 dark:text-slate-400" },
  { key: "scheduled",   label: "Scheduled",   dot: "bg-blue-500",   card: "", val: "text-blue-700 dark:text-blue-300", sub: "text-blue-500 dark:text-blue-400" },
  { key: "in_progress", label: "In Progress", dot: "bg-amber-500",  card: "", val: "text-amber-700 dark:text-amber-300", sub: "text-amber-500 dark:text-amber-400" },
  { key: "invoiced",    label: "Invoiced",    dot: "bg-violet-500", card: "", val: "text-violet-700 dark:text-violet-300", sub: "text-violet-500 dark:text-violet-400" },
  { key: "paid",        label: "Paid",        dot: "bg-brand-500",  card: "", val: "text-brand-700 dark:text-brand-300", sub: "text-brand-500 dark:text-brand-400" },
];

const STATUS_DOT = {
  quote: "bg-slate-400", scheduled: "bg-blue-500",
  in_progress: "bg-amber-500", invoiced: "bg-violet-500",
  paid: "bg-brand-500", cancelled: "bg-rose-500",
};
const STATUS_LABEL = {
  quote: "Quote", scheduled: "Scheduled", in_progress: "In Progress",
  invoiced: "Invoiced", paid: "Paid", cancelled: "Cancelled",
};
// Solid state chips on list rows — findable at a glance down a long list in
// a way a small dot never is. Quote stays neutral because "not decided yet"
// isn't a state worth shouting about.
const STATUS_PILL = {
  quote: "pill-neutral",
  scheduled: "pill-blue",
  in_progress: "pill-amber",
  invoiced: "pill-neutral",
  paid: "pill-green",
  cancelled: "pill-rose",
};

// A cost-derived figure, or a dash.
//
// Never render £0.00 for something that simply hasn't loaded. "Engineer Cost
// £0.00" and "Net Profit = Revenue" are confident, specific claims about the
// month — and if engineers, expenses and payments aren't in memory they're
// also false, while looking exactly like a real month with no costs. A dash
// says "not known yet", which is the truth.
function CostFigure({ ready, children }) {
  if (ready) return children;
  return (
    <span className="text-navy-300 dark:text-slate-600" title="Engineer and expense data hasn't loaded yet — not calculated">
      —
    </span>
  );
}

// Panels a person can switch off for themselves (Customise).
const DASH_PANELS = [
  ["brief", "Briefing strip"], ["revenue", "Revenue and today"], ["performance", "Performance"],
  ["pipeline", "Job pipeline"], ["ops", "Operations — what's waiting"], ["activity", "Daily activity"], ["recent", "Recent jobs and renewals"],
];

export default function Dashboard() {
  const { jobs: allJobs, clients, hydrated, engineers, expenses, engineerPayments, financeReady, retryHydrate } = useStore();

  // The ONLY thing this page wanted the prospects table for was one number:
  // how many renewals fall due in the next 14 days. Getting it in the browser
  // meant downloading ~14.5k rows / ~12MB over ~15 paginated requests every
  // time the dashboard opened — on a phone, over mobile data, to render a
  // single integer. That was the single largest cost in the app.
  //
  // /api/stats/renewals computes it next to the database and returns ~30
  // bytes. The dashboard no longer pulls the big table at all.
  const [renewalStats, setRenewalStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/stats/renewals", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setRenewalStats(json);
      } catch {
        // A missing renewals count is a blank KPI, never a broken dashboard.
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const prospectsReady = renewalStats != null;
  const { user, can } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !can("dashboard")) {
      router.replace(user.role === "engineer" ? "/portal" : "/dispatch");
    }
  }, [user, can, router]);

  const myEngId = useMyEngineerId();
  const jobs = useMemo(
    () => (myEngId ? allJobs.filter((j) => jobBelongsToEngineer(j, myEngId)) : allJobs),
    [allJobs, myEngId]
  );
  const [modalOpen, setModalOpen] = useState(false);
  // Which panels this person wants on their dashboard (remembered on this
  // device). Everything is on until it's switched off.
  const [hiddenPanels, setHiddenPanels] = useState([]);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  useEffect(() => {
    try { const h = JSON.parse(localStorage.getItem("lcl-dash-hidden") || "[]"); if (Array.isArray(h)) setHiddenPanels(h); } catch {}
  }, []);
  const show = (k) => !hiddenPanels.includes(k);
  const togglePanel = (k) => setHiddenPanels((prev) => {
    const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
    try { localStorage.setItem("lcl-dash-hidden", JSON.stringify(next)); } catch {}
    return next;
  });

  // Same shared period state Reports uses — same storage key, same hook —
  // so picking a period on either page is instantly reflected on the other.
  // See lib/usePeriodRange.js's REPORTS_STORAGE_KEY comment.
  const ctl = usePeriodRange(REPORTS_STORAGE_KEY, { defaultPeriod: "month" });

  const tour = useSectionTour("dashboard", [
    { selector: null, position: "center", label: "Welcome", title: "Your field-service hub 👋", body: "A quick guide to the key parts of the app." },
    { selector: ".kpi-strip", label: "KPIs", title: "Pipeline at a glance", body: "Live counts and revenue across every stage of your job pipeline." },
    { selector: '[data-tour-nav="/dispatch"]', label: "Dispatch", title: "Assign jobs to engineers", body: "Head to Dispatch to manage your engineer columns." },
  ]);

  const stats = useMemo(() => {
    const now = new Date();

    // These follow the period selector like every other figure on the page.
    // They used to count EVERY job ever, whatever month was on screen — so
    // looking at June still showed today's unpaid invoices, and the card
    // contradicted the month printed directly above it.
    //
    // `today` is deliberately NOT scoped: "Today's schedule" means today,
    // not the selected month, and renewals are forward-looking by nature.
    const periodJobs = jobs.filter((j) => jobInRange(j, ctl.range));

    const active = periodJobs.filter((j) => ["quote", "scheduled", "in_progress"].includes(j.status)).length;
    const today  = jobs.filter((j) => j.scheduledAt && isToday(parseISO(j.scheduledAt))).length;
    const quotes = periodJobs.filter((j) => j.status === "quote").length;

    const outstanding = periodJobs
      .filter((j) => j.status === "invoiced")
      .reduce((s, j) => s + (j.price || 0), 0);

    const overdueCount = periodJobs.filter((j) => {
      if (j.status !== "invoiced") return false;
      const sent = j.invoicedAt || j.createdAt;
      return !sent || Date.now() - new Date(sent).getTime() > 30 * 86400000;
    }).length;

    const paidJobs = jobs.filter((j) => j.status === "paid");

    // ── Selected period, defined EXACTLY as Reports defines it, from the
    // SAME shared state Reports uses (ctl, from usePeriodRange) — not a
    // second "this month" calculation kept in sync by hand. A job counts
    // toward the period by its scheduled date (falling back to when it was
    // raised), and counts as revenue once it is completed/invoiced/paid.
    // The old "Collected in <Month>" card used paidAt instead, so it answered
    // a different question from every other revenue figure in the app and
    // read £135 on a month the reports called £664.96.
    const selectedRange = ctl.range;
    const monthJobs = jobs.filter((j) => jobInRange(j, selectedRange));
    const monthDone = monthJobs.filter((j) => ["completed", "invoiced", "paid"].includes(j.status));
    const monthRevenue = monthDone.reduce((s, j) => s + (j.price || 0), 0);

    // Average value of paid jobs (a clean "how big is a typical job" signal)
    const avgValue = paidJobs.length
      ? Math.round(paidJobs.reduce((s, j) => s + (j.price || 0), 0) / paidJobs.length)
      : 0;

    // Total value sitting in the live pipeline (quote → invoiced)
    const pipelineValue = periodJobs
      .filter((j) => ["quote", "scheduled", "in_progress", "invoiced"].includes(j.status))
      .reduce((s, j) => s + (j.price || 0), 0);

    const renewals = getRenewals(jobs, 60).length;

    // Computed server-side — see the /api/stats/renewals fetch above.
    const urgentProspects = renewalStats?.urgent ?? 0;

    const pipeline = Object.fromEntries(
      PIPELINE.map((s) => {
        const sj = jobs.filter((j) => j.status === s.key);
        return [s.key, { count: sj.length, value: sj.reduce((sum, j) => sum + (j.price || 0), 0) }];
      })
    );
    const pipelineMax = Math.max(1, ...PIPELINE.map((s) => pipeline[s.key]?.count || 0));

    const periodStats = computeStats(jobs, selectedRange, engineers, engineerPayments);
    const expBreakdown = expensesForRange(expenses, selectedRange);
    const pay = computeEngineerPay(jobs, selectedRange, engineers, engineerPayments);
    // Bank transfer fees are now logged as a real, dated expense the moment
    // a payment is recorded (see addEngineerPayment in lib/store.js), so
    // expBreakdown.total already includes them via the normal date filter —
    // adding pay.totalTransferFees on top would double-count every fee.
    const companyExpenses = expBreakdown.total;
    // ACCRUAL basis, matching revenue's own basis — a job counts toward this
    // month because its WORK happened this month, so the labour cost set
    // against it must be for that same job, not whichever month the engineer
    // happened to actually get paid. `pay.totalCashOut` (what left the bank
    // this month) mixes jobs from other months in whenever a payment run
    // lands late — a July job paid in August pulled its cost out of August's
    // profit while its revenue stayed counted in July, understating one month
    // and overstating the other. `pay.totalAccrued` is already computed on
    // the jobs-done-this-period basis (see computeEngineerPay in lib/stats.js)
    // — same one `periodStats.netProfit` below uses — so this is just wiring
    // the Dashboard to the figure that was already correct elsewhere.
    const engineerCost = pay.totalAccrued;
    const engineerPaid = pay.totalPaid;
    const engineerOutstanding = pay.totalBalance;

    // ── The money model, stated once ─────────────────────────────────────
    //   Revenue     = cash actually COLLECTED. An invoice nobody has paid
    //                 yet is not revenue — it's a promise. The unpaid
    //                 amount is surfaced on the card so it isn't simply
    //                 invisible, but it is deliberately NOT added in.
    //   Net Profit  = Revenue − engineer cost.        (what the work earns)
    //   True Profit = Net Profit − company expenses.  (the bottom line)
    //
    // This replaces a single "Profit" figure that multiplied engineer cost
    // by a collected/invoiced ratio — an estimate that was neither the
    // accrual nor the cash number, and reconciled to nothing.
    const revenueCollected = periodStats.collected ?? 0;
    const unpaidInvoiced = Math.max(0, (periodStats.revenue ?? 0) - revenueCollected);
    // Full engineer cost. The engineer is paid whether or not the client
    // clears the invoice, so the company bears that cost either way.
    const netProfit = Math.round((revenueCollected - engineerCost) * 100) / 100;
    const trueProfit = Math.round((netProfit - companyExpenses) * 100) / 100;
    const revenueNote = unpaidInvoiced > 0
      ? `${gbp(unpaidInvoiced)} invoiced but unpaid — not counted`
      : selectedRange.label;
    const engineerCostNote = engineerOutstanding > 0
      ? `Paid ${gbp(engineerPaid)} · Outstanding ${gbp(engineerOutstanding)}`
      : `All ${gbp(engineerPaid)} paid`;

    // ── Company Account — cumulative profit since day one, current month
    // included, never reset by a month rolling over ──────────────────────
    // This is deliberately NOT "sum up each month's Profit figure
    // separately" — that would double-apply the paidRatio estimate (see
    // `realizedProfit` above: it's collected revenue minus an ESTIMATED
    // share of engineer cost, not a real per-job settlement date) once per
    // month and compound its drift. Instead this runs the exact same
    // formula, the exact same functions, over ONE range spanning from the
    // earliest record in the business to the end of the current month —
    // so every job and expense is counted exactly once, by construction,
    // and "this month" is simply the tail end of that one range rather than
    // a separate figure added on top.
    //
    // The range must be the REAL elapsed window, not a generic "all time"
    // span — expensesForRange() multiplies a recurring expense by the
    // number of calendar months the range covers, so a 100-year placeholder
    // range would inflate every subscription cost roughly 1200x.
    //
    // Deliberately anchored to the ACTUAL current calendar month (today),
    // never to `selectedRange`/`ctl` above — Company Account must not move
    // when someone changes what period Reports/Dashboard is looking at.
    // Runs from the first record up to the END OF THE SELECTED PERIOD, so
    // the cumulative total grows as you page forward through the months and
    // shrinks as you page back — August shows June+July+August, not the
    // whole history regardless of what's on screen.
    const jobDates = jobs.map(jobDate).filter(Boolean);
    const expenseDates = (expenses || [])
      .map((e) => { try { return e.date ? parseISO(e.date) : null; } catch { return null; } })
      .filter((d) => d && !Number.isNaN(d.getTime()));
    const allDates = [...jobDates, ...expenseDates];
    const companyStart = allDates.length
      ? new Date(Math.min(...allDates.map((d) => d.getTime())))
      : selectedRange.start;
    const companyRange = { start: companyStart, end: selectedRange.end };

    const companyStats = computeStats(jobs, companyRange, engineers, engineerPayments);
    const companyExpTotal = expensesForRange(expenses, companyRange).total;
    const companyPay = computeEngineerPay(jobs, companyRange, engineers, engineerPayments);
    // Same formula as True Profit above, over the whole history — so the
    // cumulative figure is genuinely the sum of the months, not a second
    // definition that happens to sit next to them.
    const companyAccount = Math.round(
      ((companyStats.collected ?? 0) - companyPay.totalAccrued - companyExpTotal) * 100
    ) / 100;

    // The same period counted without mixing bases — see profitBases().
    // True Profit takes income as cash collected but costs as work done, so
    // a month waiting on invoices reads as a loss it didn't make.
    const bases = profitBases(jobs, selectedRange, engineers, engineerPayments, expenses);

    return { bases, active, today, quotes, outstanding, overdueCount, monthRevenue, monthDoneCount: monthDone.length, monthLabel: selectedRange.label, avgValue, pipelineValue, renewals, urgentProspects, pipeline, pipelineMax, netProfit, trueProfit, revenueCollected, unpaidInvoiced, revenueNote, engineerCostNote, engineerPaid, engineerOutstanding, companyExpenses, engineerCost, companyAccount };
  }, [jobs, engineers, engineerPayments, expenses, renewalStats, ctl.range]);

  // How the business is running, not just what it billed — measured over the
  // last 90 days so the rates have enough jobs behind them to mean anything.
  // A 7-day win rate on two quotes is noise, not a metric.
  const kpis = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86400000);
    return computeOperatingKpis(jobs, { start, end }, engineers, clients);
  }, [jobs, engineers, clients]);

  const recent = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10),
    [jobs]
  );
  const todayJobs = useMemo(
    () => jobs.filter((j) => j.scheduledAt && isToday(parseISO(j.scheduledAt))),
    [jobs]
  );

  const [greeting, setGreeting] = useState("");
  const [dateStr,  setDateStr]  = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    setDateStr(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }, []);
  const displayName = user?.role === "admin" ? "Sir" : (user?.username || user?.name || "").split(" ")[0] || "";

  const clientMap  = useMemo(() => Object.fromEntries(clients.map((c)  => [c.id, c])),   [clients]);
  const engineerMap = useMemo(() => Object.fromEntries(engineers.map((e) => [e.id, e])), [engineers]);

  return (
    <>
      {tour}

      {/* ── HEADER — flat page chrome, single hairline, no colour slab ── */}
      <div className="bar-navy">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pb-1 pt-6 sm:flex-nowrap sm:px-8 sm:pt-7">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            {/* Big, confident greeting with a quiet subtitle under it — the
                reference leads with this rather than a bordered header bar. */}
            <h1 className="truncate text-[28px] font-bold tracking-[-0.028em] text-navy-900 sm:text-[2rem] sm:font-extrabold sm:tracking-[-0.03em]">
              {greeting}{displayName ? `, ${displayName}` : ""}
            </h1>
            {/* On a phone the date alone is the useful half — the "Here's your
                workspace summary" preamble wrapped to a second line and said
                nothing the screen wasn't already showing. */}
            <p className="mt-1 text-[0.8125rem] text-navy-500 sm:text-[0.9375rem]">
              <span className="hidden sm:inline">Here&apos;s your workspace summary · </span>{dateStr}
            </p>
          </div>
          {hydrated && stats.urgentProspects > 0 && (
            <Link href="/prospects" className="badge-rose hidden sm:inline-flex">
              <FiAlertCircle className="h-3 w-3" /> {stats.urgentProspects} renewal{stats.urgentProspects > 1 ? "s" : ""} due
            </Link>
          )}
          <button className="btn-primary shrink-0" onClick={() => setModalOpen(true)}>
            <FiPlus /> <span className="hidden sm:inline">New job</span><span className="sm:hidden">New</span>
          </button>
          <Link href="/clients?new=1" className="btn-outline hidden shrink-0 lg:inline-flex" title="Add a client">
            <FiPlus /> Client
          </Link>
          <div className="relative shrink-0">
            <button type="button" className="btn-outline" onClick={() => setCustomiseOpen((o) => !o)} aria-expanded={customiseOpen} title="Choose which panels you see">
              <FiSliders /> <span className="hidden sm:inline">Customise</span>
            </button>
            {customiseOpen && (
              <>
                <div className="menu-backdrop fixed inset-0 z-10" onClick={() => setCustomiseOpen(false)} aria-hidden />
                <div className="menu-pop absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-navy-200 bg-white py-1 shadow-lg dark:bg-[#141414]">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-navy-400">Show on my dashboard</p>
                  {DASH_PANELS.map(([k, l]) => (
                    <button key={k} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50" onClick={() => togglePanel(k)}>
                      {l} {show(k) && <FiCheck className="text-brand-600" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* The whole period laid out end to end — see app/summary. */}
          <Link href="/summary" className="btn-outline shrink-0" title="Full breakdown of this period — finances, engineer pay, funnel, expenses">
            <FiPieChart /> <span className="hidden sm:inline">Summary</span>
          </Link>
        </div>
      </div>

      <div className="page space-y-6">
        {hydrated && !financeReady && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="min-w-0 flex-1">
              <strong>Costs haven&apos;t loaded.</strong> Engineer rates, expenses and payments
              didn&apos;t come back from the server, so profit figures are shown as &ldquo;—&rdquo;
              rather than calculated without them. Revenue and job counts are correct.
            </span>
            <button type="button" className="btn-outline shrink-0" onClick={() => retryHydrate?.()}>
              Retry
            </button>
          </div>
        )}

        {/* Same period control Reports uses, same shared state — changing it
            here changes what Reports shows too, and vice versa. */}
        {hydrated && <DashboardTasks />}
        {hydrated && show("brief") && <DashboardBrief />}
        {hydrated && <PeriodControls ctl={ctl} />}

        {/* ── HEADLINE KPIs — icon square, figure, change pill ── */}
        {!hydrated ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="kpi">
                <div className="skeleton h-8 w-8 rounded-[9px]" />
                <div className="skeleton mt-3 h-3 w-20" />
                <div className="skeleton mt-2 h-6 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ── PHONE: hero figure + grouped rows ────────────────────
                Eight equal cards in a 2-up grid meant ~1800px of scrolling
                and no hierarchy. See .m-hero / .m-group in globals.css. */}
            <div className="lg:hidden">
              <div className="space-y-4">
                <Link href="/reports" className="m-hero block">
                  <p className="m-hero-label">Revenue</p>
                  <p className="m-hero-value text-emerald-600 dark:text-emerald-400"><MoneyCounter value={stats.revenueCollected} /></p>
                  <div className="m-hero-foot">
                    {stats.monthDoneCount > 0 && (
                      <span className="m-hero-chip">
                        {stats.monthDoneCount} job{stats.monthDoneCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <span>
                      {stats.monthLabel}
                      {stats.avgValue > 0 ? ` · avg ${gbp(stats.avgValue)}` : ""}
                    </span>
                  </div>
                </Link>

                <div className="grid grid-cols-2 gap-4">
                <Link href="/reports" className="m-hero block !p-4 [&_.m-hero-foot]:!mt-2 [&_.m-hero-foot]:!text-[11px] [&_.m-hero-foot]:!leading-snug">
                  <p className="m-hero-label">Net Profit</p>
                  <p className={`m-hero-value !mt-1 !text-[1.6rem] ${stats.netProfit < 0 ? "!text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}><CostFigure ready={financeReady}><MoneyCounter value={stats.netProfit} /></CostFigure></p>
                  <div className="m-hero-foot"><span>Revenue minus engineer cost</span></div>
                </Link>

                <Link href="/reports" className="m-hero block !p-4 [&_.m-hero-foot]:!mt-2 [&_.m-hero-foot]:!text-[11px] [&_.m-hero-foot]:!leading-snug">
                  <p className="m-hero-label">True Profit</p>
                  <p className={`m-hero-value !mt-1 !text-[1.6rem] ${stats.trueProfit < 0 ? "!text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}><CostFigure ready={financeReady}><MoneyCounter value={stats.trueProfit} /></CostFigure></p>
                  <div className="m-hero-foot">
                    <span>After engineer cost and expenses</span>
                  </div>
                  {/* Without this, a month whose invoices haven't cleared
                      reads as a loss: the income side waits for the cash
                      while the engineer's fee is deducted the day the work
                      is done. Says so, with the consistent figure. */}
                  {Math.abs(stats.bases.earned.profit - stats.trueProfit) >= 0.01 && (
                    <div className="m-hero-foot">
                      <span className={stats.bases.earned.profit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}>
                        {gbp(stats.bases.earned.profit)} counting work done, not cash in
                      </span>
                    </div>
                  )}
                </Link>

                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Link href="/reports" className="m-hero block !p-4">
                    <p className="m-hero-label !text-[11px]">Company Exp.</p>
                    <p className="m-hero-value !text-3xl !mt-1 !text-rose-500"><CostFigure ready={financeReady}><MoneyCounter value={stats.companyExpenses} /></CostFigure></p>
                  </Link>
                  <Link href="/reports" className="m-hero block !p-4">
                    <p className="m-hero-label !text-[11px]">Engineer Cost</p>
                    <p className="m-hero-value !text-3xl !mt-1 !text-rose-500"><CostFigure ready={financeReady}><MoneyCounter value={stats.engineerCost} /></CostFigure></p>
                  </Link>
                </div>
              </div>

              <p className="m-group-title mt-8">Money</p>
              <div className="m-group">
                <MRow icon={FiCreditCard} label="Company Account" sub="Cumulative profit since day one"
                  value={<CostFigure ready={financeReady}><MoneyCounter value={stats.companyAccount} /></CostFigure>} alert={stats.companyAccount < 0} href="/reports" />
                <MRow icon={FiAlertCircle} label="Outstanding Invoices"
                  sub={stats.overdueCount ? `${stats.overdueCount} overdue — chase these` : "Nothing overdue"}
                  value={<MoneyCounter value={stats.outstanding} />} alert={stats.overdueCount > 0} href="/reports" />
                <MRow icon={FiTrendingUp} label="Pipeline value" sub="All open stages"
                  value={<MoneyCounter value={stats.pipelineValue} />} href="/jobs" />
              </div>

              <p className="m-group-title">Work</p>
              <div className="m-group">
                <MRow icon={FiLayers} label="Active jobs" sub="Quote → invoiced"
                  value={stats.active} href="/jobs" />
                <MRow icon={FiInbox} label="Open quotes" sub="Awaiting approval"
                  value={stats.quotes} href="/jobs?status=quote" />
                <MRow icon={FiClock} label="Today's schedule"
                  sub={stats.today ? "Booked in for today" : "Nothing booked in"}
                  value={stats.today} href="/dispatch" />
                <MRow icon={FiBell} label="Renewals due"
                  sub={stats.urgentProspects > 0 ? "Chase before they lapse" : "Nothing due"}
                  pill={stats.urgentProspects > 0 ? "14 days" : null}
                  value={stats.urgentProspects} alert={stats.urgentProspects > 0} href="/prospects" />
              </div>
            </div>

            <div className="hidden lg:block max-w-[1400px]">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-navy-500">Money</p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi
                  icon={FiCheckCircle}
                  label="Revenue"
                  value={<MoneyCounter value={stats.revenueCollected} />}
                  note={stats.revenueNote}
                  link="/reports"
                />
                <Kpi
                  icon={FiPieChart}
                  label="Net Profit"
                  value={<CostFigure ready={financeReady}><MoneyCounter value={stats.netProfit} /></CostFigure>}
                  valueClassName={`${stats.netProfit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"} !text-4xl`}
                  note="Revenue minus engineer cost"
                  link="/reports"
                  className="lg:col-span-2"
                />
                <Kpi
                  icon={FiCreditCard}
                  label="Company Account"
                  value={<CostFigure ready={financeReady}><MoneyCounter value={stats.companyAccount} /></CostFigure>}
                  valueClassName={stats.companyAccount < 0 ? "text-rose-500" : ""}
                  note="Cumulative profit since day one"
                  link="/reports"
                />
                <Kpi
                  icon={FiAlertCircle}
                  label="Outstanding Invoices"
                  value={<MoneyCounter value={stats.outstanding} />}
                  pill={stats.overdueCount ? `${stats.overdueCount} overdue` : null}
                  pillTone="down"
                  note={stats.overdueCount ? "Chase these" : "Nothing overdue"}
                  link="/reports"
                />
                {/* Cash-out figures — bold red, same signal as mobile's
                    Company Exp. / Engineer Pay pair. */}
                <Kpi
                  icon={FiBarChart2}
                  label="Company Expenses"
                  value={<CostFigure ready={financeReady}><MoneyCounter value={stats.companyExpenses} /></CostFigure>}
                  valueClassName="text-rose-500"
                  note={stats.monthLabel}
                  link="/reports"
                />
                <Kpi
                  icon={FiUsers}
                  label="Engineer Cost"
                  value={<CostFigure ready={financeReady}><MoneyCounter value={stats.engineerCost} /></CostFigure>}
                  valueClassName="text-rose-500"
                  note={stats.engineerCostNote}
                  link="/reports"
                />
                {/* The bottom line, after BOTH cost cards above it. */}
                <Kpi
                  icon={FiTrendingUp}
                  label="True Profit"
                  value={<CostFigure ready={financeReady}><MoneyCounter value={stats.trueProfit} /></CostFigure>}
                  valueClassName={`${stats.trueProfit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"} !text-4xl`}
                  note={
                    Math.abs(stats.bases.earned.profit - stats.trueProfit) >= 0.01
                      ? `After engineer cost and expenses · ${gbp(stats.bases.earned.profit)} counting work done, not cash in`
                      : "After engineer cost and expenses"
                  }
                  link="/reports"
                  className="lg:col-span-2"
                />
                <Kpi
                  icon={FiLayers}
                  label="Active jobs"
                  value={stats.active}
                  note="Quote → invoiced"
                  link="/jobs"
                />
                <Kpi
                  icon={FiTarget}
                  label="Jobs done"
                  value={stats.monthDoneCount}
                  note={`${stats.monthLabel} · avg ${gbp(stats.avgValue)} per job`}
                  link="/jobs"
                />
              </div>
            </div>

            <div className="hidden lg:block max-w-[1400px]">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-navy-500">Work</p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi icon={FiInbox}    label="Open quotes"      value={stats.quotes} note="Awaiting approval" link="/jobs?status=quote" />
                <Kpi icon={FiClock}    label="Today's schedule" value={stats.today}  note="Jobs scheduled"    link="/dispatch" />
                <Kpi icon={FiTrendingUp} label="Pipeline value" value={<MoneyCounter value={stats.pipelineValue} />} note="All open stages" link="/jobs" />
                <Kpi
                  icon={FiBell}
                  label="Renewals due"
                  value={stats.urgentProspects}
                  pill={stats.urgentProspects > 0 ? "fortnight" : null}
                  pillTone="down"
                  note="Next 14 days"
                  link="/prospects"
                />
              </div>
            </div>
          </>
        )}

        {/* ── REVENUE + TODAY — the reference's main row: a wide chart with
            a narrow live list beside it, rather than two full-width bands
            stacked. Keeps the fold useful instead of spending all of it on
            one graph. */}
        {hydrated && show("revenue") && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><RevenueChart jobs={jobs} days={30} /></div>
            <div className="panel flex flex-col">
              <div className="panel-head panel-head-ruled">
                <div className="min-w-0">
                  <span className="panel-title">Today&rsquo;s schedule</span>
                  <p className="panel-sub">{todayJobs.length} job{todayJobs.length !== 1 ? "s" : ""} booked in</p>
                </div>
              </div>
              {todayJobs.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
                  <FiCalendar className="h-5 w-5 text-navy-500" />
                  <p className="text-sm text-navy-500">Nothing scheduled today</p>
                </div>
              ) : (
                <div className="py-1">
                  {todayJobs.slice(0, 5).map((job) => {
                    const client = clientMap[job.clientId];
                    const eng = engineerMap[job.engineerId];
                    return (
                      <Link key={job.id} href={`/jobs/${job.id}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-navy-50">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-100 text-[11px] font-semibold text-navy-700">
                          {(client?.name || "?").slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy-900">{client?.name || "—"}</p>
                          <p className="truncate text-xs text-navy-500">
                            {job.id}{eng && eng.id !== "unassigned" ? ` · ${eng.name}` : " · no engineer"}
                            {eng && eng.id !== "unassigned" && !job.engineerConfirmed && !(job.visits || []).length && <span className="font-semibold text-amber-700"> · not confirmed</span>}
                            {!job.accessConfirmedAt && <span className="text-navy-400"> · access not confirmed</span>}
                          </p>
                        </div>
                        <span className={`pill ${STATUS_PILL[job.status] || "pill-neutral"}`}>
                          {STATUS_LABEL[job.status] || job.status}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HOW THE BUSINESS IS RUNNING — rates and ratios, not totals.
            90-day window so each rate has enough jobs behind it to mean
            something. Anything with too little data shows a dash rather
            than a misleading 0%. */}
        {hydrated && show("performance") && (
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[13px] font-semibold tracking-tight text-navy-900">Performance</h2>
              <span className="text-[11px] text-navy-500">Last 90 days</span>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                icon={FiTarget}
                label="Quote win rate"
                value={kpis.winRate == null ? "—" : kpis.winRate}
                unit={kpis.winRate == null ? null : "%"}
                pill={kpis.quotesOpen ? `${kpis.quotesOpen} open` : null}
                pillTone="flat"
                note={kpis.quotesDecided ? `${kpis.quotesDecided} quotes decided` : "No decided quotes yet"}
              />
              <Kpi
                icon={FiActivity}
                label="Repeat business"
                value={kpis.repeatRate == null ? "—" : kpis.repeatRate}
                unit={kpis.repeatRate == null ? null : "%"}
                note={kpis.repeatJobs ? `${kpis.repeatJobs} jobs from returning clients` : "No returning clients yet"}
              />
              <Kpi
                icon={FiUser}
                label="Revenue per engineer"
                value={kpis.revenuePerEngineer == null ? "—" : gbp(kpis.revenuePerEngineer)}
                note={kpis.activeEngineers ? `${kpis.activeEngineers} engineer${kpis.activeEngineers !== 1 ? "s" : ""} working` : "No engineers active"}
              />
              <Kpi
                icon={FiClock}
                label="Booked → paid"
                value={kpis.avgDaysBookedToPaid == null ? "—" : kpis.avgDaysBookedToPaid}
                unit={kpis.avgDaysBookedToPaid == null ? null : "days"}
                pill={kpis.avgDaysBookedToPaid != null && kpis.avgDaysBookedToPaid > 30 ? "slow" : null}
                pillTone="down"
                note="Average full cycle to cash"
              />
            </div>
          </div>
        )}

        {/* ── JOB PIPELINE — a single composition bar plus a dot legend.
            Share-of-total is what this data actually is, and one segmented
            bar shows it in a glance where five separate rows made you read
            and compare. Segments are proportional to VALUE, not count, so a
            stage full of small jobs can't visually outweigh a big one. */}
        {hydrated && show("pipeline") && (() => {
          const segs = PIPELINE.map((s) => ({ ...s, ...(stats.pipeline[s.key] || { count: 0, value: 0 }) }));
          const totalValue = segs.reduce((a, s) => a + s.value, 0);
          const totalCount = segs.reduce((a, s) => a + s.count, 0);
          return (
            <div className="panel">
              <div className="panel-head">
                <div className="min-w-0">
                  <span className="panel-title">Job pipeline</span>
                  <p className="panel-sub">{totalCount} open · {gbp(totalValue)} in flight</p>
                </div>
              </div>
              <div className="p-4">
                <div className="max-w-[900px]">
                  <div className="segbar">
                    {totalValue > 0
                      ? segs.filter((s) => s.value > 0).map((s) => (
                          <span
                            key={s.key}
                            className={s.dot}
                            style={{ width: `${(s.value / totalValue) * 100}%` }}
                            title={`${s.label}: ${s.count} job${s.count !== 1 ? "s" : ""} · ${gbp(s.value)}`}
                          />
                        ))
                      : <span className="w-full bg-navy-100" />}
                  </div>
                  <div className="segbar-legend">
                    {segs.map((s) => (
                      <Link key={s.key} href={`/jobs?status=${s.key}`} className="min-w-0 transition-opacity hover:opacity-70">
                        <span className="segbar-key">
                          <i className={s.dot} />
                          <span className="truncate">{s.label}</span>
                        </span>
                        <p className="tnum mt-1 text-[13px] font-semibold text-navy-900">{gbp(s.value)}</p>
                        <p className="tnum text-[11px] text-navy-500">{s.count} job{s.count !== 1 ? "s" : ""}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── ACTIVITY + AT RISK + 7-DAY ── */}
        {show("ops") && <OpsBoard />}
        {show("activity") && <DailyActivityPanel />}

        {/* ── MAIN GRID: recent jobs + right rail ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" hidden={!show("recent")}>

          {/* Recent jobs — dense list */}
          <div className="lg:col-span-2">
            <div className="panel">
              <div className="panel-head panel-head-ruled">
                <div className="min-w-0">
                  <span className="panel-title">Recent jobs</span>
                  <p className="panel-sub">Latest activity across the pipeline</p>
                </div>
                <Link href="/jobs" className="shrink-0 text-[13px] text-navy-500 hover:text-navy-900">View all</Link>
              </div>
              {recent.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <FiBriefcase className="h-5 w-5 text-navy-400" />
                  <p className="text-sm text-navy-500">No jobs yet</p>
                  <button className="btn-primary" onClick={() => setModalOpen(true)}>
                    <FiPlus /> Create first job
                  </button>
                </div>
              ) : (
                <div className="scroll-area overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-navy-100">
                      <th className="px-4 py-2.5 text-left text-[11px] font-medium text-navy-500">Client</th>
                      <th className="hidden px-3 py-2.5 text-left text-[11px] font-medium text-navy-500 sm:table-cell">Services</th>
                      <th className="hidden px-3 py-2.5 text-left text-[11px] font-medium text-navy-500 md:table-cell">Engineer</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-medium text-navy-500">Status</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-medium text-navy-500">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {recent.map((job) => {
                      const client = clientMap[job.clientId];
                      const eng    = engineerMap[job.engineerId];
                      return (
                        <tr key={job.id} className="cursor-pointer transition-colors hover:bg-navy-50"
                          onClick={() => router.push(`/jobs/${job.id}`)}>
                          <td className="px-4 py-2.5">
                            <p className="max-w-[160px] truncate font-medium text-navy-900">
                              {client?.name || "Unknown"}
                            </p>
                            <p className="text-[11px] text-navy-500">{job.id}</p>
                          </td>
                          <td className="hidden px-3 py-2.5 sm:table-cell">
                            <span className="text-xs text-navy-600">
                              {(job.services || []).join(", ") || "—"}
                            </span>
                          </td>
                          <td className="hidden px-3 py-2.5 md:table-cell">
                            <span className="text-xs text-navy-500">
                              {eng && eng.id !== "unassigned" ? eng.name : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`pill ${STATUS_PILL[job.status] || "pill-neutral"}`}>
                              {STATUS_LABEL[job.status] || job.status}
                            </span>
                          </td>
                          <td className="tnum px-4 py-2.5 text-right font-medium text-navy-900">
                            {job.price ? gbp(job.price) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>

          {/* Right rail */}
          <div className="space-y-6">

            {/* Today's schedule now lives beside the revenue chart at the
                top of the page — it's live, actionable information and was
                buried down here below the fold. */}

            {/* Renewal pipeline — urgency shown by one tinted figure, not a
                whole coloured card. */}
            <div className="panel">
              <div className="panel-head">
                <div className="min-w-0">
                  <span className="panel-title">Renewal pipeline</span>
                  <p className="panel-sub">Certificates coming up for renewal</p>
                </div>
                <Link href="/prospects" className="shrink-0 text-[13px] text-navy-500 hover:text-navy-900">Call list</Link>
              </div>
              <div className="panel-body">
                <p className="metric-label">Due within 60 days</p>
                <p className={`metric-value ${stats.urgentProspects > 0 ? "delta-down" : ""}`}>
                  {prospectsReady ? stats.renewals : <span className="inline-block h-6 w-10 animate-pulse rounded bg-current align-middle opacity-10" />}
                </p>
                {prospectsReady && (
                  <p className={`metric-sub ${stats.urgentProspects > 0 ? "delta-down" : ""}`}>
                    {stats.urgentProspects > 0
                      ? `${stats.urgentProspects} due this fortnight — call now`
                      : "Nothing urgent this fortnight"}
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── SECONDARY — housekeeping, not headline numbers ──
            "Needs your decision" and the service-coverage grid used to sit
            mid-page at full size, pushing revenue and pipeline below the
            fold. They're worth having but they're not what you open the
            dashboard to see, so they now live at the bottom, folded away
            behind a summary you can expand. */}
        {hydrated && (
          <details className="panel group">
            <summary className="panel-head cursor-pointer list-none marker:hidden">
              <span className="panel-title">Coverage &amp; housekeeping</span>
              <span className="text-xs text-navy-500 group-open:hidden">Show</span>
              <span className="hidden text-xs text-navy-500 group-open:inline">Hide</span>
            </summary>
            <div className="space-y-6 p-4">
              {user?.role === "admin" && <NeedsDecisionPanel />}
              <CoverageMap />
            </div>
          </details>
        )}
      </div>

      <JobModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

/* ── Local components ──────────────────────────────────────────── */

function SectionHead({ title, link, extra }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold tracking-tight text-navy-900">{title}</h2>
      <div className="flex items-center gap-3">
        {extra && <span className="text-xs text-navy-500">{extra}</span>}
        {link && (
          <Link href={link} className="text-xs text-navy-500 hover:text-navy-900">View all</Link>
        )}
      </div>
    </div>
  );
}

// Headline stat card: icon square, label, figure, optional change pill and a
// caption. `pill` is for a real change/qualifier only — a card with nothing
// to compare against simply omits it rather than showing a hollow "0%".
// One row of the phone dashboard's grouped list: glyph, label + caption,
// figure, chevron. Deliberately the same shape as an iOS settings row —
// scannable top to bottom, with the numbers aligned down the right edge.
function MRow({ icon: Icon, label, sub, value, href, alert = false, pill }) {
  return (
    <Link href={href} className={`m-row ${alert ? "m-row-alert" : ""}`}>
      <span className="m-row-ico"><Icon className="h-[15px] w-[15px]" strokeWidth={1.9} /></span>
      <span className="m-row-main">
        <span className="m-row-label">
          {label}
          {pill && <span className="m-row-pill">{pill}</span>}
        </span>
        <span className="m-row-sub">{sub}</span>
      </span>
      <span className="m-row-val">{value}</span>
      <FiChevronRight className="m-row-chev h-4 w-4" />
    </Link>
  );
}

function Kpi({ icon: Icon, label, value, unit, pill, pillTone = "flat", caption, note, link, valueClassName, className = "" }) {
  const body = (
    <>
      {Icon && <span className="kpi-icon"><Icon className="h-[18px] w-[18px]" strokeWidth={1.9} /></span>}
      <p className="kpi-label">{label}</p>
      <div className="kpi-row">
        <span className={`kpi-value ${valueClassName || ""}`}>{value}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
        {pill && <span className={`kpi-pill kpi-pill-${pillTone}`}>{pill}</span>}
        {caption && <span className="kpi-caption">{caption}</span>}
      </div>
      {note && <p className="kpi-note">{note}</p>}
    </>
  );
  return link
    ? <Link href={link} className={`kpi block ${className}`}>{body}</Link>
    : <div className={`kpi ${className}`}>{body}</div>;
}

// One figure inside the banded overview panel: quiet sentence-case label,
// the number, then a muted caption. No icon, no chip, no colour block —
// tone only ever tints the caption, and only when something is actually wrong.
function Cell({ label, value, sub, delta, tone, link }) {
  // The cell itself must stay the DIRECT child of .metric-row — the
  // interior hairlines are drawn with nth-child rules, and wrapping it in
  // a <Link> would push it a level down and silently drop every divider.
  const body = (
    <>
      <p className="metric-label">{label}</p>
      <div className="metric-figure">
        <span className="metric-value">{value}</span>
        {delta && <span className={`delta ${tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "delta-flat"}`}>{delta}</span>}
      </div>
      {sub && <p className="metric-sub">{sub}</p>}
    </>
  );
  return link ? (
    <Link href={link} className="metric-cell block transition-colors hover:bg-navy-50">{body}</Link>
  ) : (
    <div className="metric-cell">{body}</div>
  );
}
