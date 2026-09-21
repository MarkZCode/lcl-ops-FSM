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
import { gbp } from "@/lib/format";
import { certLabel } from "@/lib/jobCard";
import {
  computeStats, computeEngineerPay, expensesForRange, computePipeline, jobInRange,
} from "@/lib/stats";
import { usePeriodRange, REPORTS_STORAGE_KEY } from "@/lib/usePeriodRange";
import PeriodControls from "@/components/PeriodControls";
import PageHeader from "@/components/PageHeader";
import RequirePermission from "@/components/RequirePermission";

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
    <div className="px-5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">{label}</p>
      <p className={`tnum mt-0.5 text-2xl font-black ${tone || "text-navy-900 dark:text-slate-100"}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-navy-400">{note}</p>}
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
    const engineerCost = pay.totalAccrued;       // cost of the work done this period
    const engineerPaid = pay.totalPaid;
    const engineerDue = pay.totalBalance;
    const companyExpenses = exp.total;
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

    return {
      stats, pay, periodJobs, pipeline,
      revenueAll, collected, unpaidInvoiced,
      engineerCost, engineerPaid, engineerDue, companyExpenses,
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
      L.push(["Engineer cost", (-d.engineerCost).toFixed(2), "Cost of the work done this period"]);
      L.push(["Net profit", d.netProfit.toFixed(2), "Collected minus engineer cost"]);
      L.push(["Company expenses", (-d.companyExpenses).toFixed(2), ""]);
      L.push(["True profit", d.trueProfit.toFixed(2), "Net profit minus company expenses"]);
      L.push(["True margin (%)", d.margin.toFixed(1), "True profit as a share of collected"]);
      blank();

      head("Engineer pay position");
      L.push(["Line", "Amount (GBP)"]);
      L.push(["Total payable (work done)", d.engineerCost.toFixed(2)]);
      L.push(["Paid to date", d.engineerPaid.toFixed(2)]);
      L.push(["Still outstanding", d.engineerDue.toFixed(2)]);
      blank();

      head("Engineer breakdown");
      L.push(["Engineer", "Jobs", "Revenue", "Labour", "VAT", "Parking", "Payable", "Paid", "Due"]);
      d.pay.rows.forEach((r) => L.push([
        r.name, r.jobs, r.revenue.toFixed(2), r.labour.toFixed(2), r.vat.toFixed(2),
        r.parkingReimbursed.toFixed(2), r.owed.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2),
      ]));
      L.push(["TOTAL", d.pay.rows.reduce((s, r) => s + r.jobs, 0),
        d.pay.rows.reduce((s, r) => s + r.revenue, 0).toFixed(2),
        d.pay.totalLabour.toFixed(2), d.pay.totalVat.toFixed(2), d.pay.totalParking.toFixed(2),
        d.pay.totalOwed.toFixed(2), d.pay.totalPaid.toFixed(2), d.pay.totalBalance.toFixed(2)]);
      blank();

      head("Jobs funnel");
      L.push(["Stage", "Jobs"]);
      ["quote", "scheduled", "in_progress", "completed", "invoiced", "paid", "cancelled"]
        .forEach((k) => L.push([k.replace("_", " "), d.byStatus[k] || 0]));
      L.push(["Conversion rate (%)", d.pipeline.conversionRate]);
      L.push(["Close rate (%)", d.pipeline.closeRate]);
      blank();

      head("Work by service");
      L.push(["Service", "Jobs", "Revenue", "Share of revenue (%)"]);
      d.stats.byService.forEach((s) => L.push([s.name, s.count, s.revenue.toFixed(2), pct(s.revenue, d.revenueAll).toFixed(1)]));
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

      head("Job register");
      L.push(["Job", "Client", "Status", "Date", "Services", "Revenue (GBP)"]);
      d.periodJobs.slice().sort((a, b) => (a.id > b.id ? 1 : -1)).forEach((j) => {
        const c = clients.find((x) => x.id === j.clientId);
        L.push([
          j.id, c?.name || "", j.status,
          (j.scheduledAt || j.createdAt || "").slice(0, 10),
          (j.services || []).map((s) => certLabel(s) || s).join(" + "),
          (Number(j.price) || 0).toFixed(2),
        ]);
      });

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
          <div className="grid grid-cols-2 divide-x divide-y divide-navy-100 sm:grid-cols-3 lg:grid-cols-6 dark:divide-white/10">
            <Figure label="Revenue" value={money(d.revenueAll)} note="All work done" />
            <Figure label="Collected" value={money(d.collected)} note="Money received" />
            <Figure label="Unpaid" value={money(d.unpaidInvoiced)} note="Invoiced, not paid" tone={d.unpaidInvoiced > 0 ? "text-amber-600" : ""} />
            <Figure label="Engineer cost" value={money(d.engineerCost)} note={`${d.engineerShare}% of collected`} tone="text-rose-500" />
            <Figure label="Expenses" value={money(d.companyExpenses)} tone="text-rose-500" />
            <Figure
              label="True profit"
              value={money(d.trueProfit)}
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
                ["− Engineer cost", money(d.engineerCost), "Cost of the work done this period, settled or not"],
                ["= Net profit", money(d.netProfit), "Collected minus engineer cost"],
                ["− Company expenses", money(d.companyExpenses), "Overheads, fees and running costs"],
              ]}
              total={["= TRUE PROFIT", money(d.trueProfit), `${d.margin}% of collected`]}
            />
          </div>
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
          <Sheet
            columns={[
              { label: "Engineer" }, { label: "Jobs", align: "right" }, { label: "Revenue", align: "right" },
              { label: "Labour", align: "right" }, { label: "VAT", align: "right" }, { label: "Parking", align: "right" },
              { label: "Payable", align: "right" }, { label: "Paid", align: "right" }, { label: "Due", align: "right" },
            ]}
            rows={d.pay.rows.map((r) => [
              r.name, r.jobs, money(r.revenue), money(r.labour),
              r.vat > 0 ? money(r.vat) : "—", r.parkingReimbursed > 0 ? money(r.parkingReimbursed) : "—",
              money(r.owed), r.paid > 0 ? money(r.paid) : "—", money(r.balance),
            ])}
            total={[
              "TOTAL", d.pay.rows.reduce((s, r) => s + r.jobs, 0),
              money(d.pay.rows.reduce((s, r) => s + r.revenue, 0)),
              money(d.pay.totalLabour), money(d.pay.totalVat), money(d.pay.totalParking),
              money(d.pay.totalOwed), money(d.pay.totalPaid), money(d.pay.totalBalance),
            ]}
          />
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
        <Section title="Work by service" subtitle="Which certificates brought the money in">
          <Sheet
            columns={[{ label: "Service" }, { label: "Jobs", align: "right" }, { label: "Revenue", align: "right" }, { label: "Share", align: "right" }]}
            rows={d.stats.byService.map((s) => [s.name, s.count, money(s.revenue), `${pct(s.revenue, d.revenueAll)}%`])}
            total={["TOTAL", d.stats.byService.reduce((s, x) => s + x.count, 0), money(d.revenueAll), "100%"]}
          />
        </Section>

        {/* ── 6. Expenses ── */}
        <Section title="Company expenses" subtitle="By category, for this period">
          <Sheet
            columns={[{ label: "Category" }, { label: "Amount", align: "right" }, { label: "Share", align: "right" }]}
            rows={d.expRows.map(([k, v]) => [k, money(v), `${pct(v, d.companyExpenses)}%`])}
            total={["TOTAL", money(d.companyExpenses), "100%"]}
          />
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
