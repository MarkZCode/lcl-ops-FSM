"use client";

import { useMemo, useState } from "react";
import Folder from "@/components/Folder";
import Link from "next/link";
import { FiFileText, FiDownload, FiSearch, FiExternalLink } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { gbp, fmtDate } from "@/lib/format";
import { buildInvoicePrefill } from "@/lib/invoiceData";
import { toast } from "@/lib/toast";

// Every invoice the business has raised, in one place.
//
// There was no record of an invoice anywhere before: the number was generated
// at PDF-build time and thrown away, so nothing could list what had been
// billed, to whom, or for how much. Now that the number is allocated ONCE and
// stored on the job (allocateInvoiceNumber in lib/store.js), the archive is
// simply every job carrying one — no second store to keep in sync, and it
// can't drift from the jobs it bills.
export default function InvoiceArchive() {
  const { jobs, clients, clientById } = useStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | paid | unpaid
  const [busyId, setBusyId] = useState(null);

  const rows = useMemo(() => {
    const list = jobs
      .filter((j) => j.invoiceNumber)
      .map((j) => {
        const client = clients.find((c) => c.id === j.clientId);
        return {
          job: j,
          no: String(j.invoiceNumber),
          client: client?.name || "Unknown client",
          amount: Number(j.price) || 0,
          date: j.invoicedAt || j.invoiceNumberAt || j.scheduledAt || j.createdAt,
          paid: j.status === "paid",
        };
      });
    const term = q.trim().toLowerCase();
    return list
      .filter((r) => (filter === "paid" ? r.paid : filter === "unpaid" ? !r.paid : true))
      .filter((r) =>
        !term ||
        r.no.toLowerCase().includes(term) ||
        r.client.toLowerCase().includes(term) ||
        r.job.id.toLowerCase().includes(term)
      )
      // Highest invoice number first — most recent billing at the top.
      .sort((a, b) => (parseInt(b.no, 10) || 0) - (parseInt(a.no, 10) || 0));
  }, [jobs, clients, q, filter]);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);
    const unpaid = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);
    return { paid, unpaid, count: rows.length };
  }, [rows]);

  // Re-issue the PDF from the job as it stands, under its ORIGINAL number.
  const download = async (row) => {
    setBusyId(row.job.id);
    try {
      const client = clients.find((c) => c.id === row.job.clientId);
      const property = client?.properties?.find((p) => p.id === row.job.propertyId);
      const { generateInvoicePDF } = await import("@/lib/generateInvoice");
      generateInvoicePDF({
        docType: "invoice",
        invNo: row.no,
        dateISO: (row.date || new Date().toISOString()).slice(0, 10),
        ...buildInvoicePrefill(row.job, client, property),
        taxOn: false,
      });
    } catch (e) {
      toast.error("Couldn't rebuild that invoice PDF.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="metric-card">
          <p className="metric-label">Invoices raised</p>
          <p className="metric-value mt-1.5 text-xl">{totals.count}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Paid</p>
          <p className="metric-value mt-1.5 text-xl text-emerald-600 dark:text-emerald-400">{gbp(totals.paid)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Awaiting payment</p>
          <p className={`metric-value mt-1.5 text-xl ${totals.unpaid > 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
            {gbp(totals.unpaid)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
          <input
            className="input pl-9"
            placeholder="Search invoice no., client or job…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-navy-200 p-1 dark:border-white/10">
          {[
            { k: "all", l: "All" },
            { k: "paid", l: "Paid" },
            { k: "unpaid", l: "Unpaid" },
          ].map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                filter === f.k ? "bg-navy-800 text-white dark:bg-white/15" : "text-navy-500 hover:text-navy-900"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-navy-400">
          <span aria-hidden className="mb-2 block h-[176px]">
            <Folder color="black" size="sm" />
          </span>
          {jobs.some((j) => j.invoiceNumber)
            ? "No invoices match that search."
            : "No invoices raised yet. Invoicing a job files it here automatically."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="scroll-area overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Invoice</th>
                  <th className="px-4 py-2.5 font-semibold">Client</th>
                  <th className="px-4 py-2.5 font-semibold">Job</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 text-right font-semibold">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {rows.map((r) => (
                  <tr key={r.job.id} className="transition-colors hover:bg-navy-50">
                    <td className="tnum px-4 py-2.5 font-semibold text-navy-900">{r.no}</td>
                    <td className="px-4 py-2.5 text-navy-700">{r.client}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/jobs/${r.job.id}`}
                        className="inline-flex items-center gap-1 text-navy-500 hover:text-brand-600"
                      >
                        {r.job.id} <FiExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="tnum px-4 py-2.5 text-navy-500">{r.date ? fmtDate(r.date) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`pill ${r.paid ? "pill-green" : "pill-amber"}`}>
                        {r.paid ? "Paid" : "Awaiting payment"}
                      </span>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right font-semibold text-navy-900">{gbp(r.amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => download(r)}
                        disabled={busyId === r.job.id}
                        title={`Re-download invoice ${r.no}`}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-40"
                      >
                        <FiDownload className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-500">
        <FiFileText className="mr-1 inline h-3 w-3" />
        Every job that has been invoiced appears here under the number it was
        issued with. Re-downloading rebuilds the PDF from the job as it stands
        today, keeping the original invoice number.
      </p>
    </div>
  );
}
