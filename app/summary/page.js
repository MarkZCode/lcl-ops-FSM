"use client";

// THE SUMMARY — one screen that lays the whole period out end to end.
//
// The Dashboard answers "how are we doing right now" and Reports answers
// "show me one aspect in depth". Neither lets you sit down and read the
// month like a set of accounts, which is what this is for: every figure
// for the selected period, laid out in labelled blocks, in the order you
// would actually reason about them — what came in, what went out, what we
// kept, where the work came from, and what fell over.
//
// EVERY NUMBER HERE IS COMPUTED BY THE SAME FUNCTIONS THE REST OF THE APP
// USES (computeStats / computeEngineerPay / expensesForRange /
// computePipeline). Nothing on this page re-derives finance maths of its
// own — if a figure here disagreed with Reports, one of them would be
// lying, and there would be no way to tell which. The CSV export writes
// these same values straight out, so the downloaded sheet and the screen
// can never disagree either.

import { useMemo, useState } from "react";
import { FiDownload, FiPieChart } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { gbp, getJobLines, lineTotal, isAddonCode } from "@/lib/format";
import { certLabel } from "@/lib/jobCard";
import {
  computeStats, computeEngineerPay, expensesForRange, computePipeline, jobInRange, profitBases,
} from "@/lib/stats";
import { parkingSummary, congestionSummary } from "@/lib/finance";
import { usePeriodRange, REPORTS_STORAGE_KEY } from "@/lib/usePeriodRange";
import PeriodControls from "@/components/PeriodControls";
import PageHeader from "@/components/PageHeader";
import RequirePermission from "@/components/RequirePermission";
import { MoneyCounter } from "@/components/AnimatedCounter";

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const money = (n) => gbp(Math.round((Number(n) || 0) * 100) / 100);

// ── Small presentational pieces ──────────────────────────────────────────
function Section({ title, subtitle, children, right }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-navy-100 px-5 py-3 dark:border-white/10">
        <div>
          <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="text-[11px] text-navy-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Sheet({ columns, rows, total }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-navy-50 text-[10px] uppercase tracking-wide text-navy-500 dark:bg-white/[0.04]">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100 dark:divide-white/10">
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-xs text-navy-400">Nothing in this period.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-navy-50/50 dark:hover:bg-white/[0.03]">
              {r.map((cell, j) => (
                <td key={j} className={`px-4 py-2 ${columns[j].align === "right" ? "tnum text-right" : ""} ${j === 0 ? "font-medium text-navy-800 dark:text-slate-200" : "text-navy-600 dark:text-slate-400"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot className="border-t-2 border-navy-200 bg-navy-50/80 font-bold dark:border-white/20 dark:bg-white/[0.04]">
            <tr>
              {total.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 text-sm ${columns[j].align === "right" ? "tnum text-right" : ""}`}>{cell}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// A labelled proportion bar — used for "where the money goes" and any
// share-of-total breakdown. Deliberately plain CSS: a chart library would
// be another dependency to keep in sync for something this simple.
function ShareBar({ segments }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return <p className="px-5 py-4 text-xs text-navy-400">Nothing to show for this period.</p>;
  return (
    <div className="px-5 py-4">
      <div className="flex h-7 w-full overflow-hidden rounded-lg">
        {segments.map((s, i) => {
          const w = pct(Math.max(0, s.value), total);
          if (w <= 0) return null;
          return (
            <div key={i} className={`flex items-center justify-center ${s.color}`} style={{ width: `${w}%` }} title={`${s.label} — ${money(s.value)} (${w}%)`}>
              {w >= 8 && <span className="text-[10px] font-bold text-white">{w}%</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${s.color}`} />
            <span className="min-w-0 flex-1 truncate text-navy-600 dark:text-slate-400">{s.label}</span>
            <span className="tnum font-semibold text-navy-900 dark:text-slate-100">{money(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Figure({ label, value, note, tone = "" }) {
  return (
    // min-w-0 so the tile can be narrower than its number, and the figure
    // steps down a size on small screens. At eight tiles across a laptop,
    // "£780.28" at text-2xl was wider than its ~90px of usable column and
    // ran out past the edge of the card.
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-navy-500" title={label}>{label}</p>
      <p className={`tnum mt-0.5 break-words text-xl font-black sm:text-2xl ${tone || "text-navy-900 dark:text-slate-100"}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-navy-400">{note}</p>}
    </div>
  );
}

export default function SummaryPage() {
  return <RequirePermission anyOf={["reports"]}><SummaryInner /></RequirePermission>;
}

function SummaryInner() {
  const { jobs, engineers, expenses, engineerPayments, clients } = useStore();
  const [busy, setBusy] = useState(false);
  // The same shared period state Reports and the Dashboard use, so whatever
  // month is selected there is what opens here.
  const ctl = usePeriodRange(REPORTS_STORAGE_KEY, { defaultPeriod: "month" });
  const { range } = ctl;

  const d = useMemo(() => {
    const stats = computeStats(jobs, range, engineers, engineerPayments);
    const pay = computeEngineerPay(jobs, range, engineers, engineerPayments);
    const exp = expensesForRange(expenses, range);
    const periodJobs = jobs.filter((j) => jobInRange(j, range));
    const pipeline = computePipeline(periodJobs);

    // ── The finance spine, identical to the Dashboard's definitions ──
    const revenueAll = stats.revenue;            // all work done, incl. unpaid invoices
    const collected = stats.collected;           // money actually in
    const unpaidInvoiced = stats.outstanding;    // invoiced, not yet paid
    const engineerCost = pay.totalAccrued;       // cost of ALL work done this period
    // Cost of the work on jobs the customer has actually PAID. Profit is
    // struck against collected revenue, so an unpaid invoice is held out of
    // BOTH sides — its revenue and its cost — rather than having its cost
    // deducted from income that was deliberately excluded.
    const engineerCostCollected = pay.totalAccruedCollected;
    const engineerCostUnpaid = Math.round((engineerCost - engineerCostCollected) * 100) / 100;
    const engineerPaid = pay.totalPaid;
    const engineerDue = pay.totalBalance;
    const companyExpenses = exp.total;
    // Full engineer cost, always. The engineer gets paid whether or not the
    // client clears the invoice, so the company genuinely bears that cost —
    // holding it back until payment would flatter the month it happened in
    // and then punish whichever month the invoice finally lands in.
    const netProfit = Math.round((collected - engineerCost) * 100) / 100;
    const trueProfit = Math.round((netProfit - companyExpenses) * 100) / 100;

    // Status spread + cancellation reasons
    const byStatus = {};
    periodJobs.forEach((j) => { byStatus[j.status] = (byStatus[j.status] || 0) + 1; });
    const cancelled = periodJobs.filter((j) => j.status === "cancelled");
    const reasons = {};
    cancelled.forEach((j) => {
      const key = j.cancelReasonLabel || "Not recorded";
      if (!reasons[key]) reasons[key] = { count: 0, value: 0 };
      reasons[key].count += 1;
      reasons[key].value += Number(j.price) || 0;
    });
    const cancelRows = Object.entries(reasons).sort((a, b) => b[1].count - a[1].count);
    const cancelledValue = cancelled.reduce((s, j) => s + (Number(j.price) || 0), 0);

    // Expenses by category
    const expCats = {};
    (expenses || []).forEach((e) => {
      try {
        const dt = new Date(e.date);
        const inWindow = e.recurring || (dt >= range.start && dt <= range.end);
        if (!inWindow) return;
      } catch { return; }
      const k = e.category || "Other";
      expCats[k] = (expCats[k] || 0) + (Number(e.amount) || 0);
    });
    const expRows = Object.entries(expCats).sort((a, b) => b[1] - a[1]);

    // ── Revenue reconciliation ──────────────────────────────────────
    // The P&L counts job PRICES. The engineer table counts the SERVICE
    // LINES each engineer worked. Those are different measures and they do
    // not match: add-on charges (parking, congestion) are on the invoice
    // but are not engineer work, and a discount comes off the job price
    // without changing what the lines are worth. Reported as a bug — both
    // numbers were right, nothing said why they differed. This states it.
    const revJobs = periodJobs.filter((j) => ["completed", "invoiced", "paid"].includes(j.status));
    let lineValue = 0, addonValue = 0, discountValue = 0;
    revJobs.forEach((j) => {
      getJobLines(j).forEach((l) => {
        const t = lineTotal(l);
        if (isAddonCode(l.code)) addonValue += t; else lineValue += t;
      });
      discountValue += Number(j.discount) || 0;
    });
    const recResidual = Math.round((lineValue + addonValue - discountValue - revenueAll) * 100) / 100;

    // ── Parking / congestion ────────────────────────────────────────
    const parking = parkingSummary(revJobs);
    const congestion = congestionSummary(revJobs);

    // ── Per-job register, with the full money breakdown on each row ──
    const costByJob = {}, paidByJob = {}, engByJob = {};
    pay.rows.forEach((r) => (r.jobDetails || []).forEach((d) => {
      costByJob[d.jobId] = (costByJob[d.jobId] || 0) + (Number(d.owed) || 0);
      if (!engByJob[d.jobId]) engByJob[d.jobId] = [];
      if (!engByJob[d.jobId].includes(r.name)) engByJob[d.jobId].push(r.name);
    }));
    (engineerPayments || []).forEach((p) => (p.jobIds || []).forEach((id) => {
      paidByJob[id] = (paidByJob[id] || 0) + (Number(p.amount) || 0) / Math.max(1, (p.jobIds || []).length);
    }));
    // Jobs are grouped by what they MEAN to the accounts, not listed in id
    // order with every status jumbled together. Revenue jobs — the ones the
    // P&L above is actually built from — sit in one block with their own
    // subtotal, so the figures at the top can be traced to the rows that
    // produced them. Open work and cancelled work follow separately.
    const GROUP_OF = (st) =>
      ["completed", "invoiced", "paid"].includes(st) ? "revenue"
        : st === "cancelled" ? "cancelled" : "open";
    const jobRows = periodJobs.slice().map((j) => {
      const price = Number(j.price) || 0;
      const cost = costByJob[j.id] || 0;
      const earns = ["completed", "invoiced", "paid"].includes(j.status);
      return {
        id: j.id,
        client: (clients.find((c) => c.id === j.clientId) || {}).name || "—",
        date: (j.scheduledAt || j.createdAt || "").slice(0, 10),
        status: j.status,
        services: (j.services || []).map((c) => certLabel(c) || c).join(" + ") || "—",
        price, cost,
        paid: paidByJob[j.id] || 0,
        margin: earns ? Math.round((price - cost) * 100) / 100 : 0,
        engineers: (engByJob[j.id] || []).join(", ") || "Unassigned",
        group: GROUP_OF(j.status),
      };
    }).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id))
    );
    const jobGroups = {
      revenue: jobRows.filter((j) => j.group === "revenue"),
      open: jobRows.filter((j) => j.group === "open"),
      cancelled: jobRows.filter((j) => j.group === "cancelled"),
    };

    // ── Work by service, from REVENUE JOBS ONLY ─────────────────────
    //
    // stats.byService counts every job in the period whatever its status,
    // so quotes and cancelled work were being reported as revenue: August
    // showed "Parking Charge £845.04 — 147%" against a month that actually
    // earned £574.97, and the rows summed to £4,486.76. A share of revenue
    // cannot exceed 100%. Built here from completed/invoiced/paid jobs
    // only, so the column sums to revenue and the shares sum to 100%.
    //
    // A job's value is split evenly across its services, and its engineer
    // cost is split the same way, so margin per service is comparable.
    const svcAgg = {};
    revJobs.forEach((j) => {
      const svcs = j.services || [];
      if (!svcs.length) return;
      const priceShare = (Number(j.price) || 0) / svcs.length;
      const costShare = (costByJob[j.id] || 0) / svcs.length;
      svcs.forEach((code) => {
        if (!svcAgg[code]) svcAgg[code] = { code, count: 0, revenue: 0, cost: 0 };
        svcAgg[code].count += 1;
        svcAgg[code].revenue += priceShare;
        svcAgg[code].cost += costShare;
      });
    });
    const serviceRows = Object.values(svcAgg)
      .map((r) => ({ ...r, name: certLabel(r.code) || r.code, margin: r.revenue - r.cost }))
      .sort((a, b) => b.revenue - a.revenue);
    const serviceJobCount = revJobs.length;

    // ── Margins ─────────────────────────────────────────────────────
    const engineerSharePct = pct(engineerCost, collected);      // paid out to engineers
    const grossMarginPct = pct(collected - engineerCost, collected); // kept after engineers
    const trueMarginPct = pct(trueProfit, collected);            // kept after everything

    // ── Every expense line in the period, not just the category totals ──
    //
    // A recurring expense is charged once per CALENDAR MONTH the range
    // covers (that is how expensesForRange totals it), so on a range longer
    // than a month the line has to show amount x months or the list would
    // not add up to the total printed under it.
    const expMonths = Math.max(
      1,
      (range.end.getFullYear() - range.start.getFullYear()) * 12 +
        (range.end.getMonth() - range.start.getMonth()) + 1
    );
    const expItems = (expenses || []).filter((e) => {
      if (e.recurring) return true;
      try { const dt = new Date(e.date); return dt >= range.start && dt <= range.end; } catch { return false; }
    }).map((e) => {
      const unit = Number(e.amount) || 0;
      const months = e.recurring ? expMonths : 1;
      return { ...e, unit, months, effective: Math.round(unit * months * 100) / 100 };
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const expItemsTotal = Math.round(expItems.reduce((s, e) => s + e.effective, 0) * 100) / 100;

    // The same period counted two internally-consistent ways — see
    // profitBases() in lib/stats.js for why the headline figure alone
    // can read as a loss on a month that made money.
    const bases = profitBases(jobs, range, engineers, engineerPayments, expenses);

    return {
      bases,
      stats, pay, periodJobs, pipeline,
      lineValue, addonValue, discountValue, recResidual,
      parking, congestion, jobRows, jobGroups, serviceRows, serviceJobCount,
      engineerSharePct, grossMarginPct, trueMarginPct, expItems, expItemsTotal, expMonths, revJobs,
      revenueAll, collected, unpaidInvoiced,
      engineerCost, engineerCostCollected, engineerCostUnpaid, engineerPaid, engineerDue, companyExpenses,
      netProfit, trueProfit,
      byStatus, cancelRows, cancelledValue, cancelledCount: cancelled.length,
      expRows,
      margin: pct(trueProfit, collected),
      engineerShare: pct(engineerCost, collected),
    };
  }, [jobs, engineers, expenses, engineerPayments, range]);

  // ── CSV: the same blocks, in the same order, with the same figures ──
  const downloadCsv = () => {
    setBusy(true);
    try {
      const esc = (v) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const L = [];
      const blank = () => L.push([]);
      const head = (t) => { L.push([t.toUpperCase()]); };

      L.push(["LANDLORD COMPLIANCE LONDON"]);
      L.push(["Period summary", range.label]);
      L.push(["Generated", new Date().toLocaleString("en-GB")]);
      blank();

      head("Profit & loss");
      L.push(["Line", "Amount (GBP)", "Note"]);
      L.push(["Revenue (all work done)", d.revenueAll.toFixed(2), "Completed, invoiced and paid — includes unpaid invoices"]);
      L.push(["  of which collected", d.collected.toFixed(2), "Money actually received"]);
      L.push(["  of which still unpaid", d.unpaidInvoiced.toFixed(2), "Invoiced, not yet paid"]);
      L.push(["Engineer cost", (-d.engineerCost).toFixed(2), "All work done — paid regardless of whether the client cleared their invoice"]);
      L.push(["Net profit", d.netProfit.toFixed(2), "Collected minus engineer cost"]);
      L.push(["  (memo) of which on unpaid invoices", (-d.engineerCostUnpaid).toFixed(2), "Cost borne on work the client hasn't paid for"]);
      L.push(["Company expenses", (-d.companyExpenses).toFixed(2), ""]);
      L.push(["True profit", d.trueProfit.toFixed(2), "Net profit minus company expenses"]);
      L.push(["True margin (%)", d.margin.toFixed(1), "True profit as a share of collected"]);
      blank();

      head("Counted two ways");
      L.push(["Basis", "Revenue", "Engineer cost", "Expenses", "Profit", "Note"]);
      L.push([
        "Earned", d.bases.earned.revenue.toFixed(2), (-d.bases.earned.engineerCost).toFixed(2),
        (-d.bases.earned.expenses).toFixed(2), d.bases.earned.profit.toFixed(2),
        "All work done this period, and the full engineer cost of that work",
      ]);
      L.push([
        "Cash", d.bases.cash.revenue.toFixed(2), (-d.bases.cash.engineerCost).toFixed(2),
        (-d.bases.cash.expenses).toFixed(2), d.bases.cash.profit.toFixed(2),
        "Only money in and out of the bank in this period",
      ]);
      L.push(["Still coming in from clients", d.bases.awaiting.fromClients.toFixed(2), "", "", "", "Invoiced, not yet paid"]);
      L.push(["Still to pay engineers", d.bases.awaiting.toEngineers.toFixed(2), "", "", "", "Owed for work already done"]);
      L.push(["", "", "", "", "", "True profit above mixes the two bases (cash in, work-done costs) — these do not."]);
      blank();

      head("Engineer pay position");
      L.push(["Line", "Amount (GBP)"]);
      L.push(["Total payable (work done)", d.engineerCost.toFixed(2)]);
      L.push(["Paid to date", d.engineerPaid.toFixed(2)]);
      L.push(["Still outstanding", d.engineerDue.toFixed(2)]);
      blank();

      head("Engineer breakdown");
      L.push(["Engineer", "Jobs", "Their line value", "Cost of work", "VAT", "Parking", "Paid", "Due", "Margin (%)"]);
      d.pay.rows.forEach((r) => L.push([
        r.name, r.jobs, r.revenue.toFixed(2), r.accrued.toFixed(2), r.vat.toFixed(2),
        r.parkingReimbursed.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2),
        r.revenue > 0 ? pct(r.revenue - r.accrued, r.revenue).toFixed(1) : "",
      ]));
      L.push(["TOTAL", d.pay.rows.reduce((s, r) => s + r.jobs, 0), d.lineValue.toFixed(2),
        d.pay.totalAccrued.toFixed(2), d.pay.totalVat.toFixed(2), d.pay.totalParking.toFixed(2),
        d.pay.totalPaid.toFixed(2), d.pay.totalBalance.toFixed(2),
        d.lineValue > 0 ? pct(d.lineValue - d.pay.totalAccrued, d.lineValue).toFixed(1) : ""]);
      blank();

      head("Revenue reconciliation");
      L.push(["Line", "Amount (GBP)", "What it is"]);
      L.push(["Service lines worked", d.lineValue.toFixed(2), "What the engineer table totals"]);
      L.push(["Add-on charges", d.addonValue.toFixed(2), "Parking and congestion — billed, not engineer work"]);
      L.push(["Discounts given", (-d.discountValue).toFixed(2), "Comes off the job price, not the lines"]);
      L.push(["= Revenue (job prices)", d.revenueAll.toFixed(2), d.recResidual === 0 ? "Balances exactly" : `Unexplained ${d.recResidual.toFixed(2)}`]);
      blank();

      head("Parking & congestion");
      L.push(["Line", "Charged", "Reimbursed", "Kept"]);
      L.push(["Parking", d.parking.collected.toFixed(2), d.parking.reimbursed.toFixed(2), d.parking.net.toFixed(2)]);
      L.push(["Congestion", d.congestion.collected.toFixed(2), d.congestion.reimbursed.toFixed(2), d.congestion.net.toFixed(2)]);
      blank();

      head("Expenses — every line");
      L.push(["Date", "Description", "Category", "Recurring", "Unit (GBP)", "Months", "Amount (GBP)"]);
      d.expItems.forEach((e) => L.push([e.date || "", e.name || "", e.category || "Other", e.recurring ? "yes" : "no", e.unit.toFixed(2), e.months, e.effective.toFixed(2)]));
      L.push(["", "", "", "", "", "TOTAL", d.expItemsTotal.toFixed(2)]);
      blank();

      head("Jobs funnel");
      L.push(["Stage", "Jobs"]);
      ["quote", "scheduled", "in_progress", "completed", "invoiced", "paid", "cancelled"]
        .forEach((k) => L.push([k.replace("_", " "), d.byStatus[k] || 0]));
      L.push(["Conversion rate (%)", d.pipeline.conversionRate]);
      L.push(["Close rate (%)", d.pipeline.closeRate]);
      blank();

      head("Work by service (revenue jobs only)");
      L.push(["Service", "Times done", "Revenue", "Engineer cost", "Margin", "Margin (%)", "Share of revenue (%)"]);
      d.serviceRows.forEach((s) => L.push([
        s.name, s.count, s.revenue.toFixed(2), s.cost.toFixed(2), s.margin.toFixed(2),
        s.revenue > 0 ? pct(s.margin, s.revenue).toFixed(1) : "", pct(s.revenue, d.revenueAll).toFixed(1),
      ]));
      L.push(["TOTAL", d.serviceRows.reduce((a, x) => a + x.count, 0), d.revenueAll.toFixed(2),
        d.serviceRows.reduce((a, x) => a + x.cost, 0).toFixed(2),
        d.serviceRows.reduce((a, x) => a + x.margin, 0).toFixed(2), "", "100.0"]);
      blank();

      head("Margins");
      L.push(["Measure", "Value (%)", "Basis"]);
      L.push(["Paid to engineers", d.engineerSharePct.toFixed(1), "Engineer cost as a share of collected"]);
      L.push(["Margin after engineers", d.grossMarginPct.toFixed(1), "What's kept before company expenses"]);
      L.push(["True margin", d.trueMarginPct.toFixed(1), "What's kept after everything"]);
      blank();

      head("Company expenses by category");
      L.push(["Category", "Amount (GBP)", "Share (%)"]);
      d.expRows.forEach(([k, v]) => L.push([k, v.toFixed(2), pct(v, d.companyExpenses).toFixed(1)]));
      L.push(["TOTAL", d.companyExpenses.toFixed(2), "100.0"]);
      blank();

      head("Cancellations");
      L.push(["Reason", "Jobs", "Value lost (GBP)"]);
      d.cancelRows.forEach(([k, v]) => L.push([k, v.count, v.value.toFixed(2)]));
      L.push(["TOTAL", d.cancelledCount, d.cancelledValue.toFixed(2)]);
      blank();

      [["revenue", "REVENUE JOBS (what the P&L is built from)"],
       ["open", "OPEN JOBS (not yet revenue)"],
       ["cancelled", "CANCELLED JOBS (excluded from every figure)"]].forEach(([key, title]) => {
        const g = d.jobGroups[key];
        head(title);
        L.push(["Job", "Client", "Date", "Status", "Services", "Engineer(s)", "Job value", "Engineer cost", "Paid out", "Margin"]);
        g.forEach((j) => L.push([
          j.id, j.client, j.date, j.status, j.services, j.engineers,
          j.price.toFixed(2), j.cost.toFixed(2), j.paid.toFixed(2),
          key === "revenue" ? j.margin.toFixed(2) : "",
        ]));
        L.push(["SUBTOTAL", "", "", "", "", "",
          g.reduce((s2, j) => s2 + j.price, 0).toFixed(2),
          g.reduce((s2, j) => s2 + j.cost, 0).toFixed(2),
          g.reduce((s2, j) => s2 + j.paid, 0).toFixed(2),
          key === "revenue" ? g.reduce((s2, j) => s2 + j.margin, 0).toFixed(2) : ""]);
        blank();
      });
      L.push(["ALL JOBS", "", "", "", "", "",
        d.jobRows.reduce((s, j) => s + j.price, 0).toFixed(2),
        d.jobRows.reduce((s, j) => s + j.cost, 0).toFixed(2),
        d.jobRows.reduce((s, j) => s + j.paid, 0).toFixed(2),
        d.jobRows.reduce((s, j) => s + j.margin, 0).toFixed(2)]);

      const csv = L.map((row) => row.map(esc).join(",")).join("\n");
      // BOM so Excel/Sheets read the £ signs and accents correctly.
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `LCL-summary-${range.label.replace(/[^\w]+/g, "-")}.csv`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } finally { setBusy(false); }
  };

  const statusOrder = ["quote", "scheduled", "in_progress", "completed", "invoiced", "paid", "cancelled"];

  return (
    <>
      <PageHeader
        icon={FiPieChart}
        title="Summary"
        subtitle={`Everything for ${range.label}, laid out end to end`}
        actions={
          <button onClick={downloadCsv} disabled={busy} className="btn-primary shrink-0">
            <FiDownload /> <span className="hidden sm:inline">Download CSV</span><span className="sm:hidden">CSV</span>
          </button>
        }
      />

      <div className="page space-y-5">
        <PeriodControls ctl={ctl} />

        {/* ── 1. The bottom line ── */}
        <Section title="Profit & loss" subtitle="Revenue in, costs out, what's left">
          <div className="grid grid-cols-2 divide-x divide-y divide-navy-100 sm:grid-cols-3 lg:grid-cols-4 dark:divide-white/10">
            <Figure label="Revenue" value={<MoneyCounter value={d.revenueAll} />} note="All work done" />
            <Figure label="Collected" value={<MoneyCounter value={d.collected} />} note="Money received" />
            <Figure label="Unpaid" value={<MoneyCounter value={d.unpaidInvoiced} />} note="Invoiced, not paid" tone={d.unpaidInvoiced > 0 ? "text-amber-600" : ""} />
            <Figure label="Engineer cost" value={<MoneyCounter value={d.engineerCost} />} note={`${d.engineerShare}% of collected`} tone="text-rose-500" />
            <Figure
              label="Net profit"
              value={<MoneyCounter value={d.netProfit} />}
              note={`${d.grossMarginPct}% of collected`}
              tone={d.netProfit < 0 ? "text-rose-500" : "text-emerald-600"}
            />
            <Figure
              label="Margin after engineers"
              value={`${d.grossMarginPct}%`}
              note={`${d.engineerSharePct}% goes to engineers`}
              tone={d.grossMarginPct < 0 ? "text-rose-500" : "text-emerald-600"}
            />
            <Figure label="Expenses" value={<MoneyCounter value={d.companyExpenses} />} tone="text-rose-500" />
            <Figure
              label="True profit"
              value={<MoneyCounter value={d.trueProfit} />}
              note={`${d.margin}% margin`}
              tone={d.trueProfit < 0 ? "text-rose-500" : "text-emerald-600"}
            />
          </div>
          <div className="border-t border-navy-100 dark:border-white/10">
            <Sheet
              columns={[{ label: "Line" }, { label: "Amount", align: "right" }, { label: "What it means" }]}
              rows={[
                ["Revenue (all work done)", money(d.revenueAll), "Completed, invoiced and paid — includes unpaid invoices"],
                ["Collected", money(d.collected), "Money actually received in this period"],
                ["Still unpaid", money(d.unpaidInvoiced), "Invoiced but not yet paid"],
                ["− Engineer cost", money(d.engineerCost), "All work done this period — paid to engineers regardless of whether the client has cleared their invoice"],
                ["= Net profit", money(d.netProfit), "Collected minus engineer cost"],
                ["− Company expenses", money(d.companyExpenses), "Overheads, fees and running costs"],
              ]}
              total={["= TRUE PROFIT", money(d.trueProfit), `${d.margin}% of collected`]}
            />
            {d.engineerCostUnpaid > 0 && (
              <p className="border-t border-navy-100 px-5 py-2.5 text-[11px] text-navy-500 dark:border-white/10">
                Note: {money(d.engineerCostUnpaid)} of that engineer cost is for work on
                {" "}{money(d.unpaidInvoiced)} of invoices the client hasn&apos;t cleared yet. The cost is still
                deducted in full — the engineer was paid either way.
              </p>
            )}
          </div>
        </Section>

        {/* ── 1b. The same month, counted consistently ── */}
        <Section
          title="Counted two ways"
          subtitle="True profit above takes income as cash received but costs as work done — these two don't mix the bases"
        >
          <div className="grid grid-cols-1 divide-y divide-navy-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-white/10">
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Earned — is the work profitable?</p>
              <p className={`tnum mt-1 break-words text-2xl font-black sm:text-3xl ${d.bases.earned.profit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                <MoneyCounter value={d.bases.earned.profit} />
              </p>
              <dl className="mt-3 space-y-1 text-[12px]">
                <div className="flex justify-between"><dt className="text-navy-500">All work done</dt><dd className="tnum font-semibold">{money(d.bases.earned.revenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-500">− Engineer cost (all of it)</dt><dd className="tnum font-semibold text-rose-500">{money(d.bases.earned.engineerCost)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-500">− Expenses</dt><dd className="tnum font-semibold text-rose-500">{money(d.bases.earned.expenses)}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] leading-snug text-navy-400">
                Counts an invoice the moment the work is done, and the engineer&apos;s fee for it at the same time.
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Cash — what actually moved</p>
              <p className={`tnum mt-1 break-words text-2xl font-black sm:text-3xl ${d.bases.cash.profit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                <MoneyCounter value={d.bases.cash.profit} />
              </p>
              <dl className="mt-3 space-y-1 text-[12px]">
                <div className="flex justify-between"><dt className="text-navy-500">Collected</dt><dd className="tnum font-semibold">{money(d.bases.cash.revenue)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-500">− Paid out to engineers</dt><dd className="tnum font-semibold text-rose-500">{money(d.bases.cash.engineerCost)}</dd></div>
                <div className="flex justify-between"><dt className="text-navy-500">− Expenses</dt><dd className="tnum font-semibold text-rose-500">{money(d.bases.cash.expenses)}</dd></div>
              </dl>
              <p className="mt-2 text-[11px] leading-snug text-navy-400">
                Only money in and out of the bank. Ignores what&apos;s invoiced but unpaid, and what engineers are still owed.
              </p>
            </div>
          </div>
          {(d.bases.awaiting.fromClients > 0 || d.bases.awaiting.toEngineers > 0) && (
            <div className="border-t border-navy-100 bg-navy-50/50 px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">Still in flight</p>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
                <span className="text-navy-600 dark:text-slate-300">
                  Coming in from clients <strong className="tnum text-amber-600">{money(d.bases.awaiting.fromClients)}</strong>
                </span>
                <span className="text-navy-600 dark:text-slate-300">
                  Still to pay engineers <strong className="tnum text-rose-500">{money(d.bases.awaiting.toEngineers)}</strong>
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-navy-400">
                This is the gap between the two figures above. It is work already done that hasn&apos;t finished
                turning into money yet — not a loss.
              </p>
            </div>
          )}
        </Section>

        {/* ── 2. Where the money goes ── */}
        <Section title="Where the money goes" subtitle={`Of ${money(d.collected)} collected — what we pay out and what we keep`}>
          <ShareBar
            segments={[
              { label: "Engineers", value: d.engineerCost, color: "bg-amber-500" },
              { label: "Expenses", value: d.companyExpenses, color: "bg-rose-500" },
              { label: "Kept (true profit)", value: Math.max(0, d.trueProfit), color: "bg-emerald-500" },
            ]}
          />
        </Section>

        {/* ── 3. Engineer pay ── */}
        <Section
          title="Engineer pay"
          subtitle="Payable is the cost of work done; Due is what's still owed"
          right={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-navy-500">Payable <strong className="text-navy-900 dark:text-slate-100">{money(d.engineerCost)}</strong></span>
              <span className="text-navy-500">Paid <strong className="text-emerald-700">{money(d.engineerPaid)}</strong></span>
              <span className="text-navy-500">Due <strong className="text-rose-600">{money(d.engineerDue)}</strong></span>
            </div>
          }
        >
          {/* "Cost of work" is r.accrued — what the period's work COST,
              settled or not. The obvious-looking r.labour is only the
              UNSETTLED remainder, so an engineer whose jobs were all paid
              showed £0.00 against five jobs and £1,079.94 of revenue.
              "Due" (r.balance) is the unsettled part, stated separately. */}
          <Sheet
            columns={[
              { label: "Engineer" }, { label: "Jobs", align: "right" },
              { label: "Their line value", align: "right" },
              { label: "Cost of work", align: "right" }, { label: "VAT", align: "right" }, { label: "Parking", align: "right" },
              { label: "Paid", align: "right" }, { label: "Due", align: "right" }, { label: "Margin", align: "right" },
            ]}
            rows={d.pay.rows.map((r) => [
              r.name, r.jobs, money(r.revenue), money(r.accrued),
              r.vat > 0 ? money(r.vat) : "—", r.parkingReimbursed > 0 ? money(r.parkingReimbursed) : "—",
              r.paid > 0 ? money(r.paid) : "—", money(r.balance),
              r.revenue > 0 ? `${pct(r.revenue - r.accrued, r.revenue)}%` : "—",
            ])}
            total={[
              "TOTAL", d.pay.rows.reduce((s, r) => s + r.jobs, 0),
              money(d.lineValue), money(d.pay.totalAccrued),
              money(d.pay.totalVat), money(d.pay.totalParking),
              money(d.pay.totalPaid), money(d.pay.totalBalance),
              d.lineValue > 0 ? `${pct(d.lineValue - d.pay.totalAccrued, d.lineValue)}%` : "—",
            ]}
          />
          <p className="border-t border-navy-100 px-5 py-2.5 text-[11px] text-navy-500 dark:border-white/10">
            &ldquo;Their line value&rdquo; is the value of the service lines each engineer worked, which is
            why it totals {money(d.lineValue)} rather than the {money(d.revenueAll)} of revenue above —
            see the reconciliation below.
          </p>
        </Section>

        {/* ── 4. Funnel ── */}
        <Section
          title="Jobs funnel"
          subtitle={`${d.periodJobs.length} jobs in this period · ${d.pipeline.conversionRate}% converted · ${d.pipeline.closeRate}% closed`}
        >
          <Sheet
            columns={[{ label: "Stage" }, { label: "Jobs", align: "right" }, { label: "Share", align: "right" }]}
            rows={statusOrder.map((k) => [
              k === "in_progress" ? "In progress" : k.charAt(0).toUpperCase() + k.slice(1),
              d.byStatus[k] || 0,
              `${pct(d.byStatus[k] || 0, d.periodJobs.length)}%`,
            ])}
            total={["TOTAL", d.periodJobs.length, "100%"]}
          />
        </Section>

        {/* ── 5. Services ── */}
        <Section
          title="Work by service"
          subtitle={`Revenue jobs only — ${d.serviceJobCount} job${d.serviceJobCount === 1 ? "" : "s"}, split across the services on each`}
        >
          <Sheet
            columns={[
              { label: "Service" }, { label: "Times done", align: "right" },
              { label: "Revenue", align: "right" }, { label: "Engineer cost", align: "right" },
              { label: "Margin", align: "right" }, { label: "Margin %", align: "right" },
              { label: "Share of revenue", align: "right" },
            ]}
            rows={d.serviceRows.map((s) => [
              s.name, s.count, money(s.revenue), money(s.cost), money(s.margin),
              s.revenue > 0 ? `${pct(s.margin, s.revenue)}%` : "—",
              `${pct(s.revenue, d.revenueAll)}%`,
            ])}
            total={[
              "TOTAL", d.serviceRows.reduce((a, x) => a + x.count, 0),
              money(d.revenueAll),
              money(d.serviceRows.reduce((a, x) => a + x.cost, 0)),
              money(d.serviceRows.reduce((a, x) => a + x.margin, 0)),
              d.revenueAll > 0 ? `${pct(d.serviceRows.reduce((a, x) => a + x.margin, 0), d.revenueAll)}%` : "—",
              "100%",
            ]}
          />
          <p className="border-t border-navy-100 px-5 py-2.5 text-[11px] text-navy-500 dark:border-white/10">
            &ldquo;Times done&rdquo; counts a service once per job, so a job covering three services appears in
            three rows — that is why it exceeds the job count. Revenue and cost are split evenly across the
            services on each job, so the column still totals {money(d.revenueAll)} exactly.
          </p>
        </Section>

        {/* ── 6. Expenses ── */}
        <Section title="Company expenses" subtitle="By category, for this period">
          <Sheet
            columns={[{ label: "Category" }, { label: "Amount", align: "right" }, { label: "Share", align: "right" }]}
            rows={d.expRows.map(([k, v]) => [k, money(v), `${pct(v, d.companyExpenses)}%`])}
            total={["TOTAL", money(d.companyExpenses), "100%"]}
          />
        </Section>

        {/* ── Revenue reconciliation ── */}
        <Section
          title="Revenue reconciliation"
          subtitle="Why the P&L revenue and the engineer line totals are different numbers"
        >
          <Sheet
            columns={[{ label: "Line" }, { label: "Amount", align: "right" }, { label: "What it is" }]}
            rows={[
              ["Service lines worked", money(d.lineValue), "What the engineer table totals — the work itself"],
              ["+ Add-on charges", money(d.addonValue), "Parking and congestion — billed, but not engineer work"],
              ["− Discounts given", money(d.discountValue), "Comes off the job price without changing the lines"],
            ]}
            total={["= REVENUE (job prices)", money(d.revenueAll), d.recResidual === 0 ? "Balances exactly" : `Unexplained: ${money(d.recResidual)}`]}
          />
        </Section>

        {/* ── Parking & congestion ── */}
        <Section title="Parking & congestion" subtitle="Charged to the client, reimbursed to the engineer, and what's left">
          <div className="grid grid-cols-2 divide-x divide-y divide-navy-100 sm:grid-cols-3 lg:grid-cols-4 dark:divide-white/10">
            <Figure label="Parking charged" value={<MoneyCounter value={d.parking.collected} />} note="On client invoices" />
            <Figure label="Parking reimbursed" value={<MoneyCounter value={d.parking.reimbursed} />} note="Paid to engineers" tone="text-rose-500" />
            <Figure label="Parking kept" value={<MoneyCounter value={d.parking.net} />} tone={d.parking.net < 0 ? "text-rose-500" : "text-emerald-600"} />
            <Figure label="Congestion charged" value={<MoneyCounter value={d.congestion.collected} />} note="On client invoices" />
            <Figure label="Congestion reimbursed" value={<MoneyCounter value={d.congestion.reimbursed} />} tone="text-rose-500" />
            <Figure label="Congestion kept" value={<MoneyCounter value={d.congestion.net} />} tone={d.congestion.net < 0 ? "text-rose-500" : "text-emerald-600"} />
          </div>
        </Section>

        {/* ── Every expense line ── */}
        <Section title="Expenses — every line" subtitle={`${d.expItems.length} entries${d.expMonths > 1 ? ` across ${d.expMonths} months` : ""} making up ${money(d.expItemsTotal)}`}>
          <Sheet
            columns={[
              { label: "Date" }, { label: "Description" }, { label: "Category" },
              { label: "Unit", align: "right" }, { label: "x", align: "right" }, { label: "Amount", align: "right" },
            ]}
            rows={d.expItems.map((e) => [
              e.date || "—", e.name || "—",
              `${e.category || "Other"}${e.recurring ? " · recurring" : ""}`,
              money(e.unit), e.months > 1 ? `${e.months}` : "1", money(e.effective),
            ])}
            total={["", "", "", "", "TOTAL", money(d.expItemsTotal)]}
          />
          {Math.abs(d.expItemsTotal - d.companyExpenses) > 0.005 && (
            <p className="border-t border-navy-100 px-5 py-2.5 text-[11px] text-amber-700 dark:border-white/10">
              These lines total {money(d.expItemsTotal)}, but the P&amp;L above uses {money(d.companyExpenses)} — a
              difference of {money(d.companyExpenses - d.expItemsTotal)}. Worth checking before relying on either.
            </p>
          )}
        </Section>

        {/* ── Every job, grouped by what it means to the accounts ── */}
        <Section
          title="Every job in this period"
          subtitle={`${d.jobRows.length} jobs — revenue work, open work and cancelled work kept apart`}
          right={
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <span className="text-navy-500">Revenue <strong className="text-navy-900 dark:text-slate-100">{d.jobGroups.revenue.length}</strong></span>
              <span className="text-navy-500">Open <strong className="text-navy-900 dark:text-slate-100">{d.jobGroups.open.length}</strong></span>
              <span className="text-navy-500">Cancelled <strong className="text-navy-900 dark:text-slate-100">{d.jobGroups.cancelled.length}</strong></span>
            </div>
          }
        >
          {[
            { key: "revenue", label: "Revenue jobs", hint: "Completed, invoiced or paid — these are what the P&L above is built from", tone: "text-emerald-700" },
            { key: "open", label: "Open jobs", hint: "Quoted, scheduled or in progress — not yet revenue", tone: "text-blue-700" },
            { key: "cancelled", label: "Cancelled jobs", hint: "Work lost — excluded from every figure above", tone: "text-rose-700" },
          ].map(({ key, label, hint, tone }) => {
            const g = d.jobGroups[key];
            const sum = (fn) => g.reduce((s2, j) => s2 + fn(j), 0);
            return (
              <div key={key} className="border-t border-navy-100 first:border-t-0 dark:border-white/10">
                <div className="bg-navy-50/60 px-5 py-2 dark:bg-white/[0.03]">
                  <p className={`text-xs font-bold ${tone}`}>{label} · {g.length}</p>
                  <p className="text-[11px] text-navy-500">{hint}</p>
                </div>
                <Sheet
                  columns={[
                    { label: "Job" }, { label: "Client" }, { label: "Date" }, { label: "Status" },
                    { label: "Services" }, { label: "Engineer(s)" },
                    { label: "Job value", align: "right" }, { label: "Engineer cost", align: "right" },
                    { label: "Paid out", align: "right" }, { label: "Margin", align: "right" },
                  ]}
                  rows={g.map((j) => [
                    j.id, j.client, j.date,
                    j.status === "in_progress" ? "In progress" : j.status.charAt(0).toUpperCase() + j.status.slice(1),
                    j.services, j.engineers,
                    money(j.price), money(j.cost), j.paid > 0 ? money(j.paid) : "—",
                    key === "revenue" ? money(j.margin) : "—",
                  ])}
                  total={g.length ? [
                    `${label.toUpperCase()} SUBTOTAL`, "", "", "", "", "",
                    money(sum((j) => j.price)), money(sum((j) => j.cost)),
                    money(sum((j) => j.paid)), key === "revenue" ? money(sum((j) => j.margin)) : "—",
                  ] : null}
                />
              </div>
            );
          })}
          <div className="border-t-2 border-navy-200 bg-navy-50/80 px-5 py-3 dark:border-white/20 dark:bg-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
              <span className="text-navy-900 dark:text-slate-100">ALL {d.jobRows.length} JOBS</span>
              <span className="tnum text-navy-900 dark:text-slate-100">
                Value {money(d.jobRows.reduce((s2, j) => s2 + j.price, 0))}
                {" · "}Engineer cost {money(d.jobRows.reduce((s2, j) => s2 + j.cost, 0))}
                {" · "}Margin {money(d.jobRows.reduce((s2, j) => s2 + j.margin, 0))}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-normal text-navy-500">
              Revenue-job value here ({money(d.jobGroups.revenue.reduce((s2, j) => s2 + j.price, 0))}) is the
              same {money(d.revenueAll)} the P&amp;L reports — open and cancelled work is excluded from it.
            </p>
          </div>
        </Section>

        {/* ── 7. Cancellations ── */}
        <Section
          title="Cancellations"
          subtitle={`${d.cancelledCount} cancelled · ${money(d.cancelledValue)} of work lost`}
        >
          <Sheet
            columns={[{ label: "Reason" }, { label: "Jobs", align: "right" }, { label: "Value lost", align: "right" }]}
            rows={d.cancelRows.map(([k, v]) => [k, v.count, money(v.value)])}
            total={["TOTAL", d.cancelledCount, money(d.cancelledValue)]}
          />
        </Section>
      </div>
    </>
  );
}
