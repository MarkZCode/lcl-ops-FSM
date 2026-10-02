"use client";

// Everything about one engineer on one screen: what they've done, how
// dependable they've been, where they actually work, their paperwork, and
// how their rates have changed.
import { useMemo } from "react";
import Link from "next/link";
import Modal from "./Modal";
import { useStore } from "@/lib/store";
import { gbp, fmtDate, jobTags } from "@/lib/format";
import { jobFinancials } from "@/lib/finance";
import { jobEngineerIds } from "@/lib/visits";
import { engineerDocIssues, docTypeLabel, docStatus } from "@/lib/engineerDocs";
import { reliability, workedAreas, rateSummary } from "@/lib/engineerProfile";

export default function EngineerProfile({ engineer, onClose, onEdit }) {
  const { jobs, clients, engineers } = useStore();
  const d = useMemo(() => {
    if (!engineer) return null;
    const mine = jobs.filter((j) => jobEngineerIds(j).includes(engineer.id));
    const done = mine.filter((j) => ["completed", "invoiced", "paid"].includes(j.status));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const pay = (list) => list.reduce((s, j) => s + (jobFinancials(j, engineer).payable || 0), 0);
    return {
      upcoming: mine.filter((j) => j.scheduledAt && new Date(j.scheduledAt) > new Date() && !["cancelled", "completed", "invoiced", "paid"].includes(j.status)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 5),
      recent: done.sort((a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt)).slice(0, 6),
      doneCount: done.length,
      earnedMonth: pay(done.filter((j) => j.scheduledAt && new Date(j.scheduledAt) >= monthStart)),
      earnedAll: pay(done),
      rel: reliability(engineer, jobs),
      areas: workedAreas(engineer, jobs, clients).slice(0, 12),
      issues: engineerDocIssues(engineer),
    };
  }, [engineer, jobs, clients]);
  if (!engineer || !d) return null;
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "";
  const backup = engineers.find((e) => e.id === engineer.backupId);
  const Stat = ({ label, value, sub }) => (
    <div className="rounded-lg border border-navy-100 p-3">
      <p className="metric-label">{label}</p>
      <p className="mt-1 text-lg font-bold text-navy-900">{value}</p>
      {sub && <p className="text-[11px] text-navy-400">{sub}</p>}
    </div>
  );
  const JobRow = ({ j }) => (
    <li>
      <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-1.5 text-sm hover:text-brand-600">
        <span className="min-w-0 truncate"><strong className="text-navy-900">{j.id}</strong> <span className="text-navy-600">· {clientName(j.clientId)} · {jobTags(j).map((t) => t.label).join(", ")}</span></span>
        <span className="shrink-0 text-xs text-navy-500">{j.scheduledAt ? fmtDate(j.scheduledAt) : ""}</span>
      </Link>
    </li>
  );

  return (
    <Modal open={!!engineer} onClose={onClose} wide title={engineer.name} footer={
      <>
        <button className="btn-outline" onClick={onClose}>Close</button>
        <button className="btn-primary" onClick={() => { onClose(); onEdit?.(engineer); }}>Edit details</button>
      </>
    }>
      <div className="space-y-5 text-sm">
        <p className="flex flex-wrap gap-1.5">
          {engineer.availability === "unavailable" && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Not available{engineer.availabilityNote ? ` — ${engineer.availabilityNote}` : ""}</span>}
          {engineer.trade && <span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-semibold text-navy-700">{engineer.trade}</span>}
          {(engineer.qualifications || []).map((q) => <span key={q} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{q}</span>)}
          {backup && <span className="rounded-full bg-navy-100 px-2.5 py-1 text-xs font-semibold text-navy-700">Backup: {backup.name}</span>}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Jobs done" value={d.doneCount} />
          <Stat label="Earned this month" value={gbp(d.earnedMonth)} sub={`${gbp(d.earnedAll)} all time`} />
          <Stat label="Reliability" value={d.rel.score == null ? "—" : `${d.rel.score}%`} sub={d.rel.asked ? `${d.rel.accepted} accepted · ${d.rel.declined} declined · ${d.rel.cancelled} pulled out` : "No tracked offers yet"} />
          <Stat label="No-access visits" value={d.rel.noAccess} sub={rateSummary(engineer)} />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Coming up</p>
            {d.upcoming.length ? <ul className="divide-y divide-navy-100">{d.upcoming.map((j) => <JobRow key={j.id} j={j} />)}</ul> : <p className="text-xs text-navy-400">Nothing booked.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Recent work</p>
            {d.recent.length ? <ul className="divide-y divide-navy-100">{d.recent.map((j) => <JobRow key={j.id} j={j} />)}</ul> : <p className="text-xs text-navy-400">No finished jobs yet.</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Where they&apos;ve actually worked</p>
            {d.areas.length ? (
              <p className="flex flex-wrap gap-1.5">{d.areas.map((a) => <span key={a.district} className="rounded bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-700">{a.district} <span className="font-normal text-navy-500">×{a.n}</span></span>)}</p>
            ) : <p className="text-xs text-navy-400">No completed jobs with a postcode yet.{engineer.areas ? ` Says they cover: ${engineer.areas}.` : ""}</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Paperwork</p>
            {(engineer.documents || []).length === 0 && !d.issues.length && <p className="text-xs text-navy-400">Nothing on file.</p>}
            <ul className="space-y-1 text-xs">
              {(engineer.documents || []).map((doc) => {
                const st = docStatus(doc);
                return <li key={doc.id} className="flex justify-between gap-2"><span className="truncate text-navy-700">{docTypeLabel(doc.type)}</span><span className={st === "expired" ? "font-semibold text-rose-600" : st === "expiring" ? "font-semibold text-amber-700" : "text-navy-500"}>{doc.expiresAt ? `${st === "expired" ? "expired" : "expires"} ${fmtDate(doc.expiresAt)}` : "no expiry"}</span></li>;
              })}
              {d.issues.filter((i) => i.kind === "missing").map((i) => <li key={i.type} className="font-semibold text-rose-600">{i.label} — not on file</li>)}
            </ul>
            <p className="mt-1.5 text-[11px] text-navy-400">Agreement: {engineer.agreementStatus === "signed" ? "signed" : engineer.agreementStatus === "sent" ? "sent, not signed" : "not sent"} · T&amp;Cs {engineer.tcsSigned ? "signed" : "not signed"}</p>
          </div>
        </div>

        {(engineer.rateHistory || []).length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Rate history</p>
            <ul className="space-y-1 text-xs text-navy-700">
              {[...engineer.rateHistory].reverse().slice(0, 8).map((h, i) => <li key={i}>{fmtDate(h.at)} — {h.summary}{h.by ? ` · ${h.by}` : ""}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
