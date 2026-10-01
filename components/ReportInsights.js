"use client";

// Reports → Insights: where enquiries come from and how many turn into
// work, who converts their quotes, what each service really makes, how fast
// new enquiries get a first reply, and why work is lost.
import { useMemo } from "react";
import { gbp } from "@/lib/format";
import { insights } from "@/lib/insights";
import { waitLabel } from "@/lib/quoteChecks";

function Table({ title, note, head, rows, empty }) {
  return (
    <section className="card overflow-hidden p-0">
      <div className="border-b border-navy-100 px-5 py-3">
        <h2 className="panel-title">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-navy-500">{note}</p>}
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

export default function ReportInsights({ jobs, engineerById, label }) {
  const d = useMemo(() => insights(jobs, engineerById), [jobs, engineerById]);
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

      <Table
        title="Where the work comes from"
        note="Every job raised in the period, by how it arrived, and how many became booked work."
        head={["Source", "Enquiries", "Won", "Lost", "Win rate", "Value won"]}
        rows={d.sources.map((r) => [r.source, r.enquiries, r.won, r.lost, `${r.rate}%`, gbp(r.value)])}
        empty="No jobs in this period."
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
        title="Why work was lost"
        head={["Reason", "Jobs"]}
        rows={d.lost.map((r) => [r.reason, r.count])}
        empty="Nothing cancelled in this period."
      />
    </div>
  );
}
