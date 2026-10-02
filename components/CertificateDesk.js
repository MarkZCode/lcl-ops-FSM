"use client";

// The certificate's own checklist: has the document arrived, has someone
// actually checked it, has it gone to the client, and is anything on it
// being corrected. Nothing is "ready" until it has been received AND
// checked — the app never works that out for itself from a file existing.
import { useState } from "react";
import { FiCheckSquare, FiSquare, FiAlertTriangle, FiCheckCircle, FiClock, FiPlus } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { fmtDate, getJobLines, isAddonCode } from "@/lib/format";

const CHECKS = [
  ["property", "The property address on it is this job's address"],
  ["name", "The name on the certificate is right"],
  ["date", "The inspection date is right"],
  ["engineer", "The engineer's details and registration are on it"],
  ["service", "It is the certificate this job was for"],
  ["payment", "Payment has been checked for this job"],
];
const isPdf = (f) => f?.type === "application/pdf" || f?.contentType === "application/pdf" || /\.pdf$/i.test(f?.name || "");

export default function CertificateDesk({ job }) {
  const { updateJob, logActivity } = useStore();
  const { user } = useAuth();
  const [what, setWhat] = useState("");
  const who = user?.name || user?.username || "";
  if (!job || !getJobLines(job).some((l) => !isAddonCode(l.code))) return null;
  if (!["completed", "invoiced", "paid"].includes(job.status)) return null;

  const pdfs = (job.attachments || []).filter(isPdf);
  const checks = job.certChecks || {};
  const allTicked = CHECKS.every(([k]) => checks[k]);
  const sent = job.certificateSentAt || (job.activity || []).find((a) => a.template === "certificate")?.at;
  const amendments = job.amendments || [];
  const open = amendments.filter((a) => !a.resolvedAt);

  const state = !pdfs.length
    ? { label: "Completed — document pending", tone: "amber", Icon: FiClock }
    : open.length
      ? { label: "Being corrected", tone: "rose", Icon: FiAlertTriangle }
      : !job.certCheckedAt
        ? { label: "Received — not checked yet", tone: "amber", Icon: FiAlertTriangle }
        : !sent
          ? { label: "Checked — ready to send", tone: "brand", Icon: FiCheckCircle }
          : { label: `Sent ${fmtDate(sent)}`, tone: "brand", Icon: FiCheckCircle };
  const toneCls = { amber: "bg-amber-100 text-amber-800", rose: "bg-rose-100 text-rose-700", brand: "bg-brand-50 text-brand-700" }[state.tone];

  const tick = (key) => {
    const next = { ...checks, [key]: !checks[key] };
    const done = CHECKS.every(([k]) => next[k]);
    const patch = { certChecks: next };
    if (done && !job.certCheckedAt) {
      patch.certCheckedAt = new Date().toISOString();
      patch.certCheckedBy = who;
      logActivity(job.id, { type: "status", title: "Certificate checked — ready to send", by: who });
    }
    if (!done && job.certCheckedAt) { patch.certCheckedAt = null; patch.certCheckedBy = ""; }
    updateJob(job.id, patch);
  };

  const addAmendment = () => {
    const text = what.trim();
    if (text.length < 3) return;
    // A document being corrected is no longer "checked" — it has to be
    // looked at again when the new one arrives.
    updateJob(job.id, {
      amendments: [...amendments, { id: "am-" + Date.now().toString(36), what: text, requestedAt: new Date().toISOString(), by: who }],
      certCheckedAt: null, certCheckedBy: "", certChecks: {},
    });
    logActivity(job.id, { type: "status", title: "Certificate correction requested", detail: text, by: who });
    setWhat("");
  };
  const resolve = (id) => {
    updateJob(job.id, { amendments: amendments.map((a) => (a.id === id ? { ...a, resolvedAt: new Date().toISOString(), resolvedBy: who } : a)) });
    logActivity(job.id, { type: "status", title: "Certificate correction completed", detail: amendments.find((a) => a.id === id)?.what || "", by: who });
  };

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-label text-sm">Certificate</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${toneCls}`}><state.Icon /> {state.label}</span>
      </div>

      {!pdfs.length ? (
        <p className="text-sm text-navy-600">The work is done but no certificate or report has been uploaded yet. Upload it below once the engineer sends it.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-navy-500">Open the document and check each of these against it before it goes to the client.</p>
          <ul className="space-y-1.5">
            {CHECKS.map(([key, label]) => (
              <li key={key}>
                <button type="button" onClick={() => tick(key)} className="flex w-full items-center gap-2 text-left text-sm text-navy-700 hover:text-navy-900">
                  {checks[key] ? <FiCheckSquare className="shrink-0 text-brand-600" /> : <FiSquare className="shrink-0 text-navy-300" />}
                  {label}
                </button>
              </li>
            ))}
          </ul>
          {allTicked && job.certCheckedAt && (
            <p className="mt-2 text-xs text-navy-500">Checked {fmtDate(job.certCheckedAt)}{job.certCheckedBy ? ` by ${job.certCheckedBy}` : ""}.</p>
          )}
        </>
      )}

      <div className="mt-4 border-t border-navy-100 pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500">Corrections</p>
        {amendments.length === 0 && <p className="text-xs text-navy-400">None. If a name, date or detail is wrong, record it here — the engineer corrects the document, never the office.</p>}
        <ul className="space-y-1.5">
          {amendments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-100 px-2.5 py-1.5 text-xs">
              <span className="min-w-0">
                <span className={`block ${a.resolvedAt ? "text-navy-500 line-through" : "font-semibold text-navy-800"}`}>{a.what}</span>
                <span className="text-navy-400">Asked {fmtDate(a.requestedAt)}{a.by ? ` · ${a.by}` : ""}{a.resolvedAt ? ` · corrected ${fmtDate(a.resolvedAt)}` : ""}</span>
              </span>
              {!a.resolvedAt && <button type="button" className="shrink-0 font-semibold text-brand-600" onClick={() => resolve(a.id)}>Corrected document received</button>}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input className="input h-9 flex-1 text-xs" placeholder="What needs correcting (e.g. name should read…)" value={what} onChange={(e) => setWhat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAmendment()} />
          <button type="button" className="btn-outline py-1.5 text-xs" onClick={addAmendment}><FiPlus /> Add</button>
        </div>
      </div>
    </section>
  );
}
