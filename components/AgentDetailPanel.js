"use client";

// AgentDetailPanel — slide-over for a single letting agent (§4.3).
// Layout: header (agency + stage) → contact bar → portfolio summary →
// agreement + trial-job status → timeline → primary action per stage.

import { useState } from "react";
import {
  FiCheckCircle, FiTrash2, FiEdit2, FiHome, FiBriefcase,
  FiFileText, FiAlertCircle,
} from "react-icons/fi";
import DetailSlideOver from "./DetailSlideOver";
import StageBadge from "./StageBadge";
import OutreachToolbar from "./OutreachToolbar";
import { annualValue, portfolioBand, getAgentHistory } from "@/lib/agents";
import { buildEmail } from "@/lib/templates";
import { useStore } from "@/lib/store";
import { useConfirm } from "@/components/ConfirmProvider";

const PRIMARY = {
  new:        { label: "Log first contact",     next: "contacted" },
  contacted:  { label: "Mark engaged",          next: "engaged" },
  engaged:    { label: "Book trial job",        next: "trial_job" },
  trial_job:  { label: "Promote to Active",     next: "active", requireAgreement: true },
  active:     { label: null },
  dormant:    { label: "Re-engage",             next: "contacted" },
};

export default function AgentDetailPanel({ agent, onClose, onUpdate, onLog, onRemove, onEdit, onUnpromote, templates, fromName }) {
  const ask = useConfirm();
  const [note, setNote] = useState("");
  const { prospects } = useStore();

  if (!agent) return <DetailSlideOver open={false} onClose={onClose} />;
  const a = agent;
  const value = annualValue(a);
  const band = portfolioBand(a);
  const history = getAgentHistory(a, prospects);
  // "Revert promote" applies when this Managed record came from a Prospect/Lead
  // (originId set) OR was an upgraded Raw-CSV row. Don't show on native raw rows.
  const canRevert = !!a.originId || a.agentTier === "managed";

  const introEmail = buildEmail(templates, "agent_intro", {
    client_name: a.contact_name || a.agency_name,
    company: fromName || "Landlord Compliance London",
  });

  const log = (channel, stage) => {
    onLog(a.id, { channel, note: note || undefined, direction: "out" }, stage);
    setNote("");
  };

  const primary = PRIMARY[a.stage] || PRIMARY.new;
  const doPrimary = () => {
    if (primary.requireAgreement && !a.agreement_signed) {
      alert("Sign the trade agreement before promoting to Active.");
      return;
    }
    if (primary.next) onUpdate(a.id, { stage: primary.next });
  };

  return (
    <DetailSlideOver
      open={!!agent}
      onClose={onClose}
      title={a.agency_name}
      subtitle={a.contact_name ? `${a.contact_name}${a.decision_maker_role ? ` · ${a.decision_maker_role}` : ""}` : a.address}
      actions={<StageBadge stage={a.stage} />}
      footer={
        <div className="flex items-center gap-2">
          {primary.label && (
            <button className="btn-primary flex items-center gap-2" onClick={doPrimary}>
              <FiCheckCircle /> {primary.label}
            </button>
          )}
          <button className="btn-secondary" onClick={() => onEdit?.(a)}><FiEdit2 /> Edit</button>
          {canRevert && onUnpromote && (
            <button className="btn-secondary text-amber-700 dark:text-amber-300"
              title={a.originId
                ? "Remove from Managed — the original prospect/lead reappears under its source tab."
                : "Move this agent back to the Raw CSV tab."}
              onClick={async () => {
                if (!await ask(a.originId
                  ? `Revert Promote — remove ${a.agency_name} from Managed? The source ${a.source} record stays intact.`
                  : `Move ${a.agency_name} back to the Raw CSV tab?`)) return;
                onUnpromote(a.id);
                onClose?.();
              }}>
              {a.originId ? "Revert Promote" : "Move to Raw CSV"}
            </button>
          )}
          <button className="btn-secondary ml-auto text-rose-600" onClick={async () => { if (await ask(`Remove ${a.agency_name}?`)) onRemove?.(a.id); }}>
            <FiTrash2 /> Remove
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Portfolio" value={a.portfolio_size || a.properties?.length || 0} sub={band?.label} />
          <Stat label="Annual £ est." value={`£${value.toLocaleString()}`} accent />
          <Stat label="Agreement" value={a.agreement_signed ? "Signed" : "Pending"} accent={a.agreement_signed} danger={!a.agreement_signed} />
        </div>

        {/* Contact + Outreach */}
        <section className="rounded-xl bg-navy-50 p-4 dark:bg-white/5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Phone" value={a.phone} />
            <Field label="Email" value={a.email} />
            <Field label="Office" value={a.address} span />
            <Field label="Area focus" value={(a.area_focus || []).join(", ")} span />
          </div>
          <div className="mt-3">
            <OutreachToolbar
              contact={{ phone: a.phone, email: a.email, name: a.contact_name || a.agency_name }}
              emailSubject={introEmail.subject}
              emailBody={introEmail.body}
              hideAiCall
            />
          </div>
        </section>

        {/* Trial-job status */}
        {a.trial_job_id ? (
          <section className="rounded-xl border border-purple-300 bg-purple-50 p-3 text-sm dark:border-purple-500/40 dark:bg-purple-500/10">
            <div className="flex items-center gap-2 font-semibold text-purple-800 dark:text-purple-200">
              <FiBriefcase /> Trial job: <a href={`/jobs/${a.trial_job_id}`} className="underline">{a.trial_job_id}</a>
            </div>
          </section>
        ) : a.stage === "trial_job" ? (
          <section className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <FiAlertCircle className="mt-0.5 shrink-0" />
            <span>Trial-job stage but no job linked. Convert one of their properties into a job and save the job ID on this record.</span>
          </section>
        ) : null}

        {/* Historic jobs from Prospects — recurring portfolio relationships
            often span years. We pull these out so the operator can see how
            valuable this agency has been and rank/approach accordingly. */}
        {history.jobs > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">
              Job history (from Prospects)
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Total jobs" value={history.jobs} />
              <Stat label="Total billed" value={`£${history.totalBilled.toLocaleString()}`} accent />
              <Stat label="Properties seen" value={history.propertyCount} />
              <Stat label="Last job"
                value={history.lastJobDate ? history.lastJobDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"} />
            </div>
            {Object.keys(history.byYear).length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Jobs per year</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(history.byYear).sort(([a], [b]) => +b - +a).map(([y, n]) => (
                    <span key={y} className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-navy-900">
                      <span className="font-semibold text-navy-700 dark:text-slate-200">{y}</span>
                      <span className="rounded bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Properties */}
        {a.properties?.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Properties ({a.properties.length})</h4>
            <ul className="divide-y divide-navy-100 rounded-xl border border-navy-100 dark:divide-white/5 dark:border-white/10">
              {a.properties.map((p, i) => (
                <li key={p.id || i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.address || "—"}</div>
                    {p.services?.length > 0 && <div className="truncate text-xs text-navy-500">{p.services.join(" · ")}</div>}
                  </div>
                  {p.lastJobAt && <span className="shrink-0 text-xs text-navy-400">{new Date(p.lastJobAt).toLocaleDateString("en-GB")}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notes input */}
        <section>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Log a note</label>
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Spoke to Sarah — keen on a trial, 12 props in Camden" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="btn-secondary text-xs" onClick={() => log("note")}>Save note</button>
            <button className="btn-secondary text-xs" onClick={() => log("note", "engaged")}>Note + engaged</button>
            <button className="btn-secondary text-xs" onClick={() => log("note", "trial_job")}>Note + trial</button>
            <button className="btn-secondary text-xs text-rose-600" onClick={() => log("note", "dormant")}>Note + dormant</button>
          </div>
        </section>

        {/* Agreement toggle */}
        <section className="flex items-center justify-between rounded-xl border border-navy-200 p-3 dark:border-white/10">
          <div className="flex items-center gap-2 text-sm">
            <FiFileText className={a.agreement_signed ? "text-emerald-600" : "text-amber-600"} />
            <span className="font-semibold">Trade agreement</span>
            <span className="text-navy-500">{a.agreement_signed ? "Signed" : "Not signed"}</span>
          </div>
          <button
            className="btn-secondary text-xs"
            onClick={() => onUpdate(a.id, { agreement_signed: !a.agreement_signed })}
          >
            {a.agreement_signed ? "Mark unsigned" : "Mark signed"}
          </button>
        </section>

        {/* Timeline */}
        {(a.timeline || []).length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Timeline</h4>
            <ul className="space-y-1.5">
              {a.timeline.map((e, i) => (
                <li key={i} className="rounded-lg border border-navy-100 p-2 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between text-[11px] text-navy-500 dark:text-slate-400">
                    <span className="font-semibold capitalize text-navy-700 dark:text-slate-200">{e.channel} · {e.direction}</span>
                    <span>{new Date(e.ts).toLocaleString("en-GB")}</span>
                  </div>
                  {e.note && <p className="mt-0.5 text-navy-700 dark:text-slate-300">{e.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DetailSlideOver>
  );
}

function Field({ label, value, span }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</div>
      <div className="text-sm font-medium text-navy-900 dark:text-slate-100">{value || "—"}</div>
    </div>
  );
}

function Stat({ label, value, sub, accent, danger }) {
  return (
    <div className={`rounded-xl border p-3 ${
      danger ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
      : accent ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
      : "border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900"
    }`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-navy-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] text-navy-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}
