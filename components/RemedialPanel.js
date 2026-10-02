"use client";

// Remedial work, as one tracked chain: the engineer's findings recorded
// exactly as written → the engineer's cost → our price → the client's
// approval → the booking → the updated document.
//
// Findings are a record of what a qualified person found. They can be added
// and they can be struck through as entered in error, but an entry is never
// edited and its code is never changed — the office doesn't reclassify a C2.
import { useState } from "react";
import Link from "next/link";
import { FiPlus, FiCheckCircle, FiCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { gbp, fmtDate, getJobLines } from "@/lib/format";

const CODES = [
  { key: "C1", label: "C1 — danger present" },
  { key: "C2", label: "C2 — potentially dangerous" },
  { key: "C3", label: "C3 — improvement recommended" },
  { key: "FI", label: "FI — further investigation" },
  { key: "GAS", label: "Gas — defect / not to current standards" },
  { key: "OTHER", label: "Other finding" },
];
const isPdf = (f) => f?.type === "application/pdf" || /\.pdf$/i.test(f?.name || "");

export default function RemedialPanel({ job, onCreateRemedial }) {
  const { jobs, updateJob, logActivity, rules } = useStore();
  const defaultMargin = Number(rules?.remedialMargin ?? 30);
  const { user, can } = useAuth();
  const [code, setCode] = useState("C2");
  const [text, setText] = useState("");
  const who = user?.name || user?.username || "";
  if (!job) return null;

  const isRemedialJob = job.relationType === "remedial";
  const parent = isRemedialJob ? jobs.find((j) => j.id === job.relatedJobId) : null;
  const source = isRemedialJob ? parent : job;             // the job the findings belong to
  const child = !isRemedialJob ? jobs.find((j) => j.relatedJobId === job.id && j.relationType === "remedial" && j.status !== "cancelled") : null;
  const findings = source?.findings || [];
  if (!isRemedialJob && !["fail", "advisory"].includes(job.outcome) && !findings.length) return null;

  const add = () => {
    const t = text.trim();
    if (t.length < 3 || isRemedialJob) return;
    updateJob(job.id, { findings: [...findings, { id: "fd-" + Date.now().toString(36), code, text: t, at: new Date().toISOString(), by: who }] });
    setText("");
  };
  const strike = (id) => {
    const why = window.prompt("Why is this entry being struck out? (It stays on the record.)");
    if (!why || why.trim().length < 3) return;
    updateJob(job.id, { findings: findings.map((f) => (f.id === id ? { ...f, voidedAt: new Date().toISOString(), voidedBy: who, voidReason: why.trim() } : f)) });
  };

  // The remedial job's money: engineer's cost + our margin = the quote.
  const rem = job.remedial || {};
  const cost = Number(rem.engineerCost) || 0;
  const margin = rem.marginPct === undefined || rem.marginPct === "" ? defaultMargin : Number(rem.marginPct) || 0;
  const suggested = Math.round(cost * (1 + margin / 100) * 100) / 100;
  const setRem = (patch) => updateJob(job.id, { remedial: { ...rem, ...patch } });
  const usePrice = () => {
    const lines = getJobLines(job).filter((l) => l.remedial !== true);
    const line = { id: `ln-CUSTOM-${Date.now().toString(36)}`, code: "CUSTOM", name: "Remedial work", unit: suggested, qty: 1, remedial: true };
    const all = [...lines, line];
    updateJob(job.id, { lineItems: all, price: Math.round(all.reduce((s, l) => s + (Number(l.total ?? l.unit * (l.qty || 1)) || 0), 0) * 100) / 100 });
    logActivity(job.id, { type: "note", title: `Remedial price set to ${gbp(suggested)}`, detail: `Engineer cost ${gbp(cost)} + ${margin}%`, by: who });
  };

  const chainJob = isRemedialJob ? job : child;
  const steps = [
    ["Findings recorded", findings.some((f) => !f.voidedAt)],
    ["Remedial job raised", !!chainJob],
    ["Engineer's cost in", Number(chainJob?.remedial?.engineerCost) > 0],
    ["Quote sent", !!(chainJob && (chainJob.quoteSentAt || (chainJob.activity || []).some((a) => a.template === "quote")))],
    ["Client approved", !!chainJob?.acceptedAt],
    ["Booked", !!chainJob && ["scheduled", "in_progress", "completed", "invoiced", "paid"].includes(chainJob.status)],
    ["Work completed", !!chainJob && ["completed", "invoiced", "paid"].includes(chainJob.status)],
    ["Updated document in", !!chainJob && (chainJob.attachments || []).some(isPdf)],
    ["Sent to client", !!(chainJob && (chainJob.certificateSentAt || chainJob.certifiedAt))],
  ];

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-label text-sm">Remedial work</h2>
        {isRemedialJob && parent && <Link href={`/jobs/${parent.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Findings from {parent.id}</Link>}
        {!isRemedialJob && child && <Link href={`/jobs/${child.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Remedial job {child.id}</Link>}
      </div>

      <ol className="mb-4 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
        {steps.map(([label, done]) => (
          <li key={label} className={`flex items-center gap-1.5 ${done ? "font-semibold text-brand-700" : "text-navy-400"}`}>
            {done ? <FiCheckCircle /> : <FiCircle />} {label}
          </li>
        ))}
      </ol>

      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-navy-500">Engineer&apos;s findings — exactly as reported</p>
      {findings.length === 0 && <p className="text-xs text-navy-400">Nothing recorded yet. Enter each defect with the code the engineer gave it.</p>}
      <ul className="space-y-1.5">
        {findings.map((f) => (
          <li key={f.id} className="flex items-start justify-between gap-2 rounded-lg border border-navy-100 px-2.5 py-1.5 text-xs">
            <span className={f.voidedAt ? "text-navy-400 line-through" : "text-navy-800"}>
              <strong className={`mr-1.5 rounded px-1.5 py-0.5 ${f.code === "C1" ? "bg-rose-100 text-rose-700" : f.code === "C2" ? "bg-amber-100 text-amber-800" : "bg-navy-100 text-navy-700"}`}>{f.code}</strong>
              {f.text}
              <span className="block text-navy-400 no-underline">{fmtDate(f.at)}{f.by ? ` · ${f.by}` : ""}{f.voidedAt ? ` · struck out: ${f.voidReason}` : ""}</span>
            </span>
            {!isRemedialJob && !f.voidedAt && <button type="button" className="shrink-0 text-navy-400 hover:text-rose-600" onClick={() => strike(f.id)}>Strike out</button>}
          </li>
        ))}
      </ul>
      {!isRemedialJob && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[190px,1fr,auto]">
          <select className="input h-9 py-0 text-xs" value={code} onChange={(e) => setCode(e.target.value)}>
            {CODES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input className="input h-9 text-xs" placeholder="The finding, in the engineer's words" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button type="button" className="btn-outline py-1.5 text-xs" onClick={add}><FiPlus /> Add</button>
        </div>
      )}
      {/* When the outcome is marked Failed/Advisory, "Outcome & follow-up"
          above already has this button. */}
      {!isRemedialJob && !child && !["fail", "advisory"].includes(job.outcome) && findings.some((f) => !f.voidedAt) && onCreateRemedial && (
        <button type="button" className="btn-outline mt-3" onClick={() => onCreateRemedial("remedial")}><FiPlus /> Create the remedial job</button>
      )}

      {isRemedialJob && can?.("invoices") && (
        <div className="mt-4 border-t border-navy-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500">Pricing the remedial</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr,1fr,auto]">
            <div>
              <label className="label">Engineer&apos;s cost £</label>
              <input type="number" min="0" step="0.01" className="input" defaultValue={rem.engineerCost ?? ""} onBlur={(e) => Number(e.target.value) !== cost && setRem({ engineerCost: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Our margin %</label>
              <input type="number" min="0" step="1" className="input" defaultValue={rem.marginPct ?? defaultMargin} onBlur={(e) => setRem({ marginPct: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <button type="button" className="btn-primary w-full justify-center" disabled={!(cost > 0)} onClick={usePrice}>Quote {gbp(suggested)}</button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-navy-400">Sets the job&apos;s price from the engineer&apos;s cost plus the margin. The client only ever sees the final figure.</p>
        </div>
      )}
    </section>
  );
}
