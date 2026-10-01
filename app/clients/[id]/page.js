"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiArrowLeft,
  FiEdit2,
  FiTrash2,
  FiPhone,
  FiMail,
  FiHome,
  FiPlus,
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
} from "react-icons/fi";
import { useStore } from "@/lib/store";
import { gbp, fmtDateTime, serviceShort, fmtDate } from "@/lib/format";
import { getRenewals, renewalTone } from "@/lib/renewals";
import { clientTimeline } from "@/lib/clients";
import { jobBalance, jobReceived } from "@/lib/payments";
import { jobPayable } from "@/lib/format";
import { RENEWAL_MONTHS } from "@/lib/constants";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { jobStage } from "@/lib/stages";
import ClientModal from "@/components/ClientModal";
import JobModal from "@/components/JobModal";
import Modal from "@/components/Modal";
import TaskCompletionBanner from "@/components/team/TaskCompletionBanner";

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { clients, jobs, removeClient, hydrated } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const client = clients.find((c) => c.id === id);

  const [view, setView] = useState("jobs"); // "jobs" | "portfolio" | "timeline"

  const clientJobs = useMemo(() => {
    if (!client) return [];
    return jobs
      .filter((j) => j.clientId === client.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [client, jobs]);

  // Build portfolio: for each property, find its most recent cert per service type.
  const portfolio = useMemo(() => {
    if (!client) return [];
    return (client.properties || []).map((prop) => {
      const propJobs = clientJobs.filter((j) => j.propertyId === prop.id && ["completed","invoiced","paid"].includes(j.status));
      const certMap = {};
      propJobs.forEach((j) => {
        (j.services || []).forEach((code) => {
          if (!certMap[code] || new Date(j.scheduledAt) > new Date(certMap[code].scheduledAt)) {
            certMap[code] = j;
          }
        });
      });
      return { prop, certMap };
    });
  }, [client, clientJobs]);

  const timeline = useMemo(() => (view === "timeline" ? clientTimeline(clientJobs) : []), [view, clientJobs]);

  // The certificate grid as a spreadsheet — one row per property and
  // certificate, for a landlord or agent who wants it for their own records.
  const exportPortfolio = () => {
    const codes = ["GAS", "EICR", "EPC", "FRA", "ALARM", "EMLIGHT"];
    const rows = [["Property", "Postcode", "Certificate", "Status", "Expires", "Job"]];
    for (const { prop, certMap } of portfolio) {
      for (const code of codes) {
        const j = certMap[code];
        const days = j?.certExpiry ? Math.ceil((new Date(j.certExpiry) - new Date()) / 86400000) : null;
        rows.push([
          prop.label || "", prop.postcode || "", serviceShort(code),
          !j ? "No certificate on file" : days == null ? "On file" : days < 0 ? "Expired" : days <= 60 ? "Expiring" : "Valid",
          j?.certExpiry ? fmtDate(j.certExpiry) : "", j?.id || "",
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${client.name.replace(/[^a-z0-9]+/gi, "_")}_certificates.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Everything this client currently owes, as one PDF.
  const owing = clientJobs.filter((j) => j.status === "invoiced" && jobBalance(j) > 0);
  const downloadStatement = async () => {
    const { generateStatementPDF } = await import("@/lib/generateStatement");
    generateStatementPDF({
      clientName: client.billingName || client.name,
      clientAddr: client.billingAddress || client.company || "",
      rows: owing
        .sort((a, b) => new Date(a.invoicedAt || 0) - new Date(b.invoicedAt || 0))
        .map((j) => ({
          ref: j.invoiceNumber ? `INV ${j.invoiceNumber}` : j.id,
          date: j.invoicedAt ? fmtDate(j.invoicedAt) : "",
          description: `${(j.services || []).map(serviceShort).join(", ")}${client.properties.find((p) => p.id === j.propertyId)?.postcode ? ` — ${client.properties.find((p) => p.id === j.propertyId).postcode}` : ""}`,
          total: jobPayable(j),
          paid: jobReceived(j),
          balance: jobBalance(j),
        })),
    });
  };

  if (!client) {
    return (
      <div className="p-8">
        <Link href="/clients" className="btn-outline mb-6 w-fit">
          <FiArrowLeft /> Back to clients
        </Link>
        <div className="card p-10 text-center text-navy-500">
          {hydrated ? "Client not found." : "Loading…"}
        </div>
      </div>
    );
  }

  const totalValue = clientJobs.reduce((sum, j) => sum + (j.price || 0), 0);

  const handleDelete = () => {
    removeClient(client.id);
    router.push("/clients");
  };

  return (
    <>
      <TaskCompletionBanner />
      <div className="border-b border-navy-100 bg-white px-5 py-4 sm:px-8">
        <Link
          href="/clients"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800"
        >
          <FiArrowLeft /> Back to clients
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">{client.name}</h1>
            {client.company && (
              <p className="text-sm text-navy-500">{client.company}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {owing.length > 0 && (
              <button className="btn-outline" onClick={downloadStatement} title="One PDF of every unpaid invoice">
                Statement · {gbp(owing.reduce((a, j) => a + jobBalance(j), 0))} owed
              </button>
            )}
            <button className="btn-outline" onClick={() => setEditOpen(true)}>
              <FiEdit2 /> Edit
            </button>
            <button
              className="btn-outline text-rose-600 hover:bg-rose-50"
              onClick={() => setConfirmDel(true)}
            >
              <FiTrash2 /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-8 lg:grid-cols-3">
        {/* Left: contact + properties */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Contact
            </h2>
            <div className="space-y-2.5 text-sm">
              <a
                href={`tel:${client.phone}`}
                className="flex items-center gap-2 text-navy-700 hover:text-brand-600"
              >
                <FiPhone className="text-navy-400" /> {client.phone || "—"}
              </a>
              <a
                href={`mailto:${client.email}`}
                className="flex items-center gap-2 break-all text-navy-700 hover:text-brand-600"
              >
                <FiMail className="text-navy-400" /> {client.email || "—"}
              </a>
              <p className="flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-full bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-600">{client.type}</span>
                {client.preferredContact && <span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Prefers {client.preferredContact}</span>}
                {Number(client.discountPercent) > 0 && <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{client.discountPercent}% portfolio discount</span>}
              </p>
              {(client.billingName || client.billingEmail) && (
                <p className="text-xs text-navy-500">Invoices to: <strong className="text-navy-700">{[client.billingName, client.billingEmail].filter(Boolean).join(" · ")}</strong></p>
              )}
            </div>
            {client.notes && (
              <p className="mt-3 border-t border-navy-100 pt-3 text-sm text-navy-600">
                {client.notes}
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 section-label text-sm">
              Properties ({client.properties.length})
            </h2>
            <ul className="space-y-2">
              {client.properties.length === 0 && (
                <li className="text-sm text-navy-400">No properties on file.</li>
              )}
              {client.properties.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-lg bg-navy-50 p-2.5 text-sm"
                >
                  <FiHome className="mt-0.5 shrink-0 text-navy-400" />
                  <div>
                    <p className="font-medium text-navy-800">{p.label}</p>
                    <p className="text-xs text-navy-500">
                      {p.postcode}
                      {p.area ? ` · ${p.area}` : ""}
                      {p.beds ? ` · ${p.beds} bed` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-navy-500">Lifetime value</span>
              <span className="text-lg font-bold text-navy-900">
                {gbp(totalValue)}
              </span>
            </div>
          </section>
        </div>

        {/* Right: jobs / portfolio */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg border border-navy-200 bg-white p-0.5">
              {["jobs","portfolio","timeline"].map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${view===v?"bg-navy-800 text-white":"text-navy-500 hover:bg-navy-50"}`}
                >{v}</button>
              ))}
            </div>
            <span className="flex gap-2">
              {view === "portfolio" && portfolio.length > 0 && (
                <button className="btn-outline" onClick={exportPortfolio}>Export</button>
              )}
              <button className="btn-outline" onClick={() => setJobOpen(true)}>
                <FiPlus /> New job
              </button>
            </span>
          </div>

          {view === "timeline" ? (
            timeline.length === 0 ? (
              <div className="card p-10 text-center text-sm text-navy-500">Nothing recorded for this client yet.</div>
            ) : (
              <ol className="card divide-y divide-navy-100">
                {timeline.slice(0, 300).map((e) => (
                  <li key={e.id} className="flex gap-3 p-3 text-sm">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.direction === "in" ? "bg-blue-500" : e.type === "payment" ? "bg-emerald-500" : e.type === "file" ? "bg-purple-500" : "bg-navy-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-900">{e.title || (e.direction === "in" ? "Message from client" : "Note")}</p>
                      {e.detail && <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-navy-600">{e.detail}</p>}
                      <p className="mt-0.5 text-[11px] text-navy-400">
                        {fmtDateTime(e.at)} · <Link href={`/jobs/${e.jobId}`} className="font-semibold text-brand-600 hover:underline">{e.jobId}</Link>{e.by ? ` · ${e.by}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )
          ) : view === "portfolio" ? (
            portfolio.length === 0 ? (
              <div className="card p-10 text-center text-sm text-navy-500">No properties on file.</div>
            ) : (
              <div className="space-y-4">
                {portfolio.map(({ prop, certMap }) => (
                  <div key={prop.id} className="card p-4">
                    <div className="mb-3 flex items-start gap-2">
                      <FiHome className="mt-0.5 text-navy-400" />
                      <div>
                        <p className="font-semibold text-navy-900">{prop.label}</p>
                        <p className="text-xs text-navy-500">{prop.postcode}{prop.beds ? ` · ${prop.beds} bed` : ""}</p>
                      </div>
                    </div>
                    {Object.keys(RENEWAL_MONTHS).filter((code) => ["GAS","EICR","EPC","FRA","ALARM","EMLIGHT"].includes(code)).map((code) => {
                      const job = certMap[code];
                      const now = new Date();
                      let expiry = job?.certExpiry ? new Date(job.certExpiry) : null;
                      const days = expiry ? Math.ceil((expiry - now) / 86400000) : null;
                      const tone = days !== null ? renewalTone(days) : null;
                      return (
                        <div key={code} className="flex items-center justify-between py-1.5 border-t border-navy-50 text-sm">
                          <span className="text-navy-600">{serviceShort(code)}</span>
                          {job ? (
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone?.color || "bg-navy-100 text-navy-600"}`}>
                                {tone?.label || fmtDate(expiry)}
                              </span>
                              <Link href={`/jobs/${job.id}`} className="text-xs text-brand-600 hover:underline">{job.id}</Link>
                            </div>
                          ) : (
                            <span className="text-[11px] text-navy-400">No cert on file</span>
                          )}
                        </div>
                      );
                    })}
                    <button className="btn-outline mt-3 w-full py-1.5 text-xs" onClick={() => setJobOpen(true)}>
                      <FiPlus /> Book renewal for this property
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            clientJobs.length === 0 ? (
              <div className="card p-10 text-center text-sm text-navy-500">No jobs for this client yet.</div>
            ) : (
              <div className="card divide-y divide-navy-100">
                {clientJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="flex items-center justify-between gap-3 p-4 transition hover:bg-navy-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy-900">{job.id}</p>
                      <p className="truncate text-xs text-navy-500">
                        {job.services.map(serviceShort).join(", ")} · {fmtDateTime(job.scheduledAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={jobStage(job)} size="sm" />
                      <span className="text-sm font-semibold text-navy-900">{gbp(job.price)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <ClientModal open={editOpen} onClose={() => setEditOpen(false)} client={client} />
      <JobModal
        open={jobOpen}
        onClose={() => setJobOpen(false)}
        defaultClientId={client.id}
      />

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Delete client?"
        footer={
          <>
            <button className="btn-outline" onClick={() => setConfirmDel(false)}>
              Cancel
            </button>
            <button
              className="btn bg-rose-600 text-white hover:bg-rose-700"
              onClick={handleDelete}
            >
              Delete client
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">
          This will permanently remove <strong>{client.name}</strong> and their{" "}
          {clientJobs.length} job{clientJobs.length !== 1 ? "s" : ""}. This cannot be
          undone.
        </p>
      </Modal>
    </>
  );
}
