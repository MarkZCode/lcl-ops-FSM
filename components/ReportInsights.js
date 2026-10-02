"use client";

// Reports → Insights: where enquiries come from and how many turn into
// work, who converts their quotes, what each service really makes, how fast
// new enquiries get a first reply, and why work is lost.
import { useMemo } from "react";
import { gbp } from "@/lib/format";
import { insights } from "@/lib/insights";
import { waitLabel } from "@/lib/quoteChecks";
import { downloadCsv } from "@/lib/jobsView";

// Any table on this page can be taken away as a spreadsheet.
function exportTable(title, head, rows) {
  const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadCsv(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, csv);
}

function Table({ title, note, head, rows, empty }) {
  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-5 py-3">
        <div>
          <h2 className="panel-title">{title}</h2>
          {note && <p className="mt-0.5 text-xs text-navy-500">{note}</p>}
        </div>
        {rows.length > 0 && <button type="button" className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => exportTable(title, head, rows)}>Export</button>}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-navy-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-navy-400">
                {head.map((h, i) => <th key={h} className={`px-5 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, i) => <td key={i} className={`px-5 py-2 ${i > 0 ? "tnum text-right text-navy-700" : "font-medium text-navy-900"}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const COMPARE = [
  ["Revenue", "revenue", true], ["Collected", "collected", true], ["Outstanding", "outstanding", true],
  ["Jobs in the period", "total", false], ["Completed", "completed", false], ["Average job", "avgValue", true],
  ["Profit after engineer pay", "netProfitAfterPay", true],
];

export default function ReportInsights({ jobs, engineerById, label, clients = [], engineers = [], allJobs, stats, prevStats, comparable = false, prospects = [] }) {
  const d = useMemo(() => insights(jobs, engineerById, { clients, engineers, allJobs, prospects }), [jobs, engineerById, clients, engineers, allJobs, prospects]);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="metric-label">First reply to a new enquiry</p>
          <p className="metric-value mt-1.5 text-xl">{d.response.avgMs != null ? waitLabel(d.response.avgMs) : "—"}</p>
          <p className="mt-1 text-xs text-navy-500">{d.response.count ? `Average over ${d.response.count} website and email enquiries` : "No answered enquiries in this period"}</p>
        </div>
        <div className="card p-4">
          <p className="metric-label">Enquiries · {label}</p>
          <p className="metric-value mt-1.5 text-xl">{d.sources.reduce((a, r) => a + r.enquiries, 0)}</p>
          <p className="mt-1 text-xs text-navy-500">{d.sources.reduce((a, r) => a + r.won, 0)} turned into work</p>
        </div>
        <div className="card p-4">
          <p className="metric-label">Lost</p>
          <p className="metric-value mt-1.5 text-xl">{d.lost.reduce((a, r) => a + r.count, 0)}</p>
          <p className="mt-1 text-xs text-navy-500">{d.lost[0] ? `Most common: ${d.lost[0].reason}` : "Nothing lost in this period"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="metric-label">Coming up</p>
          <p className="metric-value mt-1.5 text-xl">{gbp(d.forecast.bookedValue)}</p>
          <p className="mt-1 text-xs text-navy-500">{d.forecast.bookedCount} accepted or booked · another {gbp(d.forecast.quotedValue)} quoted, not accepted</p>
        </div>
        <div className="card p-4">
          <p className="metric-label">Repeat clients · {label}</p>
          <p className="metric-value mt-1.5 text-xl">{d.repeat.total ? `${d.repeat.rate}%` : "—"}</p>
          <p className="mt-1 text-xs text-navy-500">{d.repeat.repeatJobs} of {d.repeat.total} jobs · {gbp(d.repeat.repeatValue)}</p>
        </div>
        <div className="card p-4">
          <p className="metric-label">Cancelled and no-access · {label}</p>
          <p className="metric-value mt-1.5 text-xl">{gbp(d.losses.cancelledValue)}</p>
          <p className="mt-1 text-xs text-navy-500">{d.losses.cancelledCount} cancelled · {d.losses.noAccessVisits} no-access visit{d.losses.noAccessVisits === 1 ? "" : "s"}</p>
        </div>
      </div>

      {stats && prevStats && comparable && (
        <Table
          title="This period against the one before"
          note={`${label} beside the period of the same length immediately before it.`}
          head={["", label, "Period before", "Change"]}
          rows={COMPARE.map(([name, key, money]) => {
            const a = Number(stats[key]) || 0, b = Number(prevStats[key]) || 0;
            const diff = a - b;
            const pc = b ? `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round((diff / Math.abs(b)) * 100))}%` : a ? "new" : "—";
            return [name, money ? gbp(a) : a, money ? gbp(b) : b, `${diff >= 0 ? "+" : "−"}${money ? gbp(Math.abs(diff)) : Math.abs(diff)} (${pc})`];
          })}
          empty=""
        />
      )}

      <Table
        title="Money owed, by age"
        note={`Every unpaid invoice, whatever period is selected. ${gbp(d.debt.total)} owed in all.`}
        head={["How long", "Invoices", "Owed"]}
        rows={d.debt.buckets.filter((b) => b.count).map((b) => [b.key, b.count, gbp(b.total)])}
        empty="Nothing is owed."
      />
      {d.debt.rows.length > 0 && (
        <Table
          title="Unpaid invoices, oldest first"
          head={["Job", "Client", "Invoice", "Days", "Owed"]}
          rows={d.debt.rows.slice(0, 40).map((r) => [r.id, r.client, r.invoice || "—", r.days, gbp(r.owed)])}
          empty=""
        />
      )}
      <Table
        title="Renewals due in the next 90 days"
        note={`${d.forecast.renewalCount} certificate${d.forecast.renewalCount === 1 ? "" : "s"} · ${gbp(d.forecast.renewalValue)} if each is renewed at last time's price.`}
        head={["Job", "Expires", "Last price"]}
        rows={d.forecast.renewals.map((j) => [j.id, new Date(j.certExpiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), gbp(j.price)])}
        empty="No certificates fall due in the next 90 days."
      />

      <Table
        title="Where the work comes from"
        note="Every job raised in the period, by how it arrived, and how many became booked work."
        head={["Source", "Enquiries", "Won", "Lost", "Win rate", "Value won"]}
        rows={d.sources.map((r) => [r.source, r.enquiries, r.won, r.lost, `${r.rate}%`, gbp(r.value)])}
        empty="No jobs in this period."
      />
      <Table
        title="Enquiries by service"
        head={["Service", "Enquiries", "Won", "Win rate", "Value won"]}
        rows={d.services.map((r) => [r.key, r.enquiries, r.won, `${r.rate}%`, gbp(r.value)])}
        empty="No jobs in this period."
      />
      <Table
        title="Enquiries by area"
        note="By postcode district — the top twenty."
        head={["Area", "Enquiries", "Won", "Win rate", "Value won"]}
        rows={d.areas.map((r) => [r.key, r.enquiries, r.won, `${r.rate}%`, gbp(r.value)])}
        empty="No jobs in this period."
      />
      <Table
        title="Engineers"
        note="Offers are counted from the day offer tracking was switched on."
        head={["Engineer", "Jobs done", "Offers accepted", "Declined", "Pulled out", "No-access visits", "Avg days to finish"]}
        rows={d.engineers.map((r) => [r.name, r.done, r.accepted, r.declined, r.cancelled, r.noAccess, r.avgDays ?? "—"])}
        empty="No engineer activity in this period."
      />
      <Table
        title="Quotes by person"
        note="Who sent the quote, and how many of theirs were accepted."
        head={["Sent by", "Quotes sent", "Won", "Win rate", "Value won"]}
        rows={d.people.map((r) => [r.name, r.sent, r.won, `${r.rate}%`, gbp(r.value)])}
        empty="No quotes were sent in this period."
      />
      <Table
        title="Margin by service"
        note="Finished work only. Cost is what the engineer is paid for it; parking and congestion are left out."
        head={["Service", "Done", "Revenue", "Engineer cost", "Margin", "Margin %"]}
        rows={d.margins.map((r) => [r.service + (r.unpriced ? ` (${r.unpriced} with no engineer rate)` : ""), r.count, gbp(r.revenue), gbp(r.cost), gbp(r.margin), `${r.marginPct}%`])}
        empty="No finished work in this period."
      />
      <Table
        title="When people pick up"
        note={d.callTimes.best ? `Best answered: ${d.callTimes.best.label} (${d.callTimes.best.rate}% of calls). From ${d.callTimes.total} logged calls.` : `${d.callTimes.total} call${d.callTimes.total === 1 ? "" : "s"} logged with an outcome so far — it needs at least five in two different time slots before it can say which is best. Use “Log a call” on jobs and the outcome buttons on prospects.`}
        head={["Time of day", "Calls", "Answered", "Answer rate"]}
        rows={d.callTimes.slots.filter((s) => s.calls).map((s) => [s.label, s.calls, s.answered, `${s.rate}%`])}
        empty="No calls with an outcome have been logged yet."
      />
      <Table
        title="Why work was lost"
        head={["Reason", "Jobs"]}
        rows={d.lost.map((r) => [r.reason, r.count])}
        empty="Nothing cancelled in this period."
      />
    </div>
  );
}
