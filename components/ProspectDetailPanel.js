"use client";

// ProspectDetailPanel — slide-over for a single prospect.
// Layout: Contact header → portfolio / property summary → cert history
//  → ActivityThread (timeline) → funnel stage with ONE primary action.
//
// Replaces the previous wide Modal `CallerCard` for renewal calling. The
// pricing-uplift + AI Call still live here but framed around the staged
// "one primary action per stage" pattern from §4.2.

import { bestCallTimes } from "@/lib/insights";
import { useStore } from "@/lib/store";
import { Component, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FiCheckCircle, FiTrash2, FiCalendar, FiHome, FiPhoneCall,
  FiAlertCircle, FiClock, FiCheckSquare, FiChevronRight,
} from "react-icons/fi";
import DetailSlideOver from "./DetailSlideOver";
import StageBadge from "./StageBadge";
import OutreachToolbar from "./OutreachToolbar";

// Local error boundary so a bad row never blows up the whole page (the
// "system error" + lost-data symptom reported by ops). The panel closes
// itself when an exception fires; the rest of the app keeps working.
class PanelBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) {
    console.error("[ProspectDetailPanel]", err);
    setTimeout(() => this.props.onClose?.(), 50);
  }
  render() {
    if (this.state.err) {
      return (
        <DetailSlideOver open onClose={() => { this.setState({ err: null }); this.props.onClose?.(); }} title="Couldn&rsquo;t open">
          <div className="p-4 text-sm text-rose-700">
            This prospect record has missing data and couldn&rsquo;t be rendered. The error is logged.
            <br /><br />
            {String(this.state.err?.message || this.state.err)}
          </div>
        </DetailSlideOver>
      );
    }
    return this.props.children;
  }
}
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";
import {
  STAGES, callerCard, nextRenewalDue, serviceLabel, buildProspectWaMessage,
} from "@/lib/prospects";
import { buildEmail } from "@/lib/templates";
import { useConfirm } from "@/components/ConfirmProvider";

// WhatsApp intro message tailored for letting/estate agent leads.
// Positions LCL as a backup compliance option rather than a replacement.
function agentWaMessage(rawName) {
  const tokens = (rawName || "").trim().split(/\s+/).filter(Boolean);
  const isTitle = (t) => /^(mr|mrs|ms|miss|mx|dr|prof|sir|rev)\.?$/i.test(t);
  const first = tokens.find((t) => !isTitle(t) && t.replace(/\./g, "").length > 1);
  const greet = first ? `Hi ${first}` : "Hello";
  return (
    `${greet}, this is Lisa from Landlord Compliance London.\n\n` +
    `I'm reaching out because we work with letting and estate agents across London as a backup compliance contractor — Gas Safety, EICR, EPC, FRA.\n\n` +
    `We're not looking to replace whoever you already use — just to be a fast, reliable option for urgent jobs, overflow work, or when your usual contractor isn't available.\n\n` +
    `Worth keeping our number saved? Happy to send you our trade pricing and a quick overview of what we cover.`
  );
}

// Primary action per stage — one prominent button that drives the funnel.
// "interested" and "booked" auto-create a job (quote / scheduled) via onConvert.
const PRIMARY_ACTION = {
  new:          { label: "Mark contacted",    nextStage: "contacted" },
  contacted:    { label: "Mark interested → Create quote", convert: true, status: "quote" },
  interested:   { label: "View quote",        link: true },
  booked:       { label: "View job",          link: true },
  dormant:      { label: "Re-engage",         nextStage: "contacted" },
  lost_dormant: { label: "Re-engage",         nextStage: "contacted" },
  dnc:          { label: null },
};

export default function ProspectDetailPanel(props) {
  return (
    <PanelBoundary onClose={props.onClose}>
      <ProspectDetailPanelInner {...props} />
    </PanelBoundary>
  );
}

function ProspectDetailPanelInner({
  prospect, onClose, onLog, onUpdate, onRemove, onConvert, onToggleAgent,
  templates, fromName, medianByService, onEmail,
}) {
  const ask = useConfirm();
  // CRITICAL: every hook must be called every render. No early returns above
  // a hook call or React fires error #310 ("rendered fewer hooks than expected")
  // which is exactly what was crashing the panel.
  const [note, setNote] = useState("");
  const [uplift, setUplift] = useState(0);
  const [aiCalling, setAiCalling] = useState(false);
  const { clients: allClients, jobs: allJobs, prospects: allProspects } = useStore();

  const p = prospect || {};
  const svcs = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];
  const estAmt = p.invoiceAmount == null
    ? (svcs.map((s) => medianByService?.[s]).find(Boolean) ?? null)
    : null;
  const c = prospect ? callerCard(p, uplift, estAmt) : {};

  const due = prospect ? nextRenewalDue(p) : null;
  const daysLeft = due ? Math.ceil((due - new Date()) / 86400000) : null;

  // urgency banner classes
  const urgency = useMemo(() => {
    if (daysLeft == null) return { tone: "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300", text: "Renewal date unknown" };
    if (daysLeft < 0)   return { tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200", text: `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"}` };
    if (daysLeft <= 7)  return { tone: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200", text: `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — act now` };
    if (daysLeft <= 30) return { tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", text: `Due in ${daysLeft} days` };
    if (daysLeft <= 60) return { tone: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200", text: `Due in ${daysLeft} days` };
    return { tone: "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300", text: `Due in ${daysLeft} days` };
  }, [daysLeft]);

  // pre-built email (purpose chosen per primary service)
  const renewPurpose = svcs.includes("GAS") ? "prospect_renewal_gas"
    : svcs.includes("EICR") ? "prospect_renewal_eicr"
    : svcs.includes("EPC") ? "prospect_renewal_epc"
    : svcs.includes("FRA") ? "prospect_renewal_fra"
    : svcs.includes("PAT") ? "prospect_renewal_pat"
    : "prospect_renewal_generic";
  const renewEmail = buildEmail(templates, renewPurpose, {
    client_name: c.name,
    company: fromName || "Landlord Compliance London",
    service: svcs.map(serviceLabel).join(", "),
    lastDone: c.lastDone,
    phone: "07426 409342",
  });

  const log = (channel, stage) => {
    onLog?.(p.id, { channel, note: note || undefined }, stage);
    setNote("");
  };

  const startAiCall = async () => {
    setAiCalling(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch("/api/vapi/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prospectId: p.id, upliftPct: uplift, prospect: p }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.notConfigured) toast.error("AI calling isn't set up — add Vapi keys.");
      else if (!res.ok || result.error) toast.error(result.error || "Couldn't start AI call.");
      else toast.success("AI call started");
    } catch { toast.error("Couldn't start AI call."); }
    finally { setAiCalling(false); }
  };

  const primary = PRIMARY_ACTION[p.stage] || PRIMARY_ACTION.new;

  const doPrimary = async () => {
    if (primary.convert) { onConvert?.(p.id, { status: primary.status || "quote" }); return; }
    if (primary.link) {
      if (p.convertedJobId) { window.location.href = `/jobs/${p.convertedJobId}`; return; }
      // No job yet — create one now (fallback for manually-set stages)
      onConvert?.(p.id, { status: p.stage === "booked" ? "scheduled" : "quote" });
      return;
    }
    if (primary.nextStage) {
      onUpdate?.(p.id, { stage: primary.nextStage });
      toast.success(`Moved to ${primary.nextStage}`);
    }
  };

  // Safe early-return AFTER all hooks have run — keeps hook order stable.
  if (!prospect) return <DetailSlideOver open={false} onClose={onClose} />;

  return (
    <DetailSlideOver
      open={!!prospect}
      onClose={onClose}
      title={c.name || "Prospect"}
      subtitle={c.address}
      actions={<StageBadge stage={p.stage} />}
      footer={
        <div className="flex items-center gap-2">
          {p.convertedJobId ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <FiCheckCircle /> Converted · {p.convertedJobId}
            </span>
          ) : primary.label ? (
            <button className="btn-primary flex items-center gap-2" onClick={doPrimary}>
              <FiCheckCircle /> {primary.label}
            </button>
          ) : null}
          <button className="btn-secondary ml-auto text-rose-600" onClick={async () => { if (await ask("Remove this prospect?")) onRemove?.(p.id); }}>
            <FiTrash2 /> Remove
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Urgency banner */}
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${urgency.tone}`}>
          <FiCalendar className="h-4 w-4 shrink-0" />
          <div className="text-sm font-semibold">{urgency.text}</div>
          {due && <div className="ml-auto text-xs opacity-80">{due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>}
        </div>

        {/* Already a live job for this person? Then outreach stops — they're
            a client mid-job, not a prospect to chase. Matched on email or
            the last ten digits of the phone number. */}
        {(() => {
          const email = String(c.email || "").trim().toLowerCase();
          const phone = String(c.phone || "").replace(/\D/g, "").slice(-10);
          const client = (allClients || []).find((x) => (email && String(x.email || "").toLowerCase() === email) || (phone.length === 10 && String(x.phone || "").replace(/\D/g, "").slice(-10) === phone));
          const open = client ? (allJobs || []).filter((j) => j.clientId === client.id && !["paid", "cancelled"].includes(j.status)) : [];
          if (!open.length) return null;
          return (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              <strong>Don&apos;t chase — {client.name} already has a live job.</strong>{" "}
              {open.slice(0, 3).map((j, i) => <span key={j.id}>{i > 0 && ", "}<Link href={`/jobs/${j.id}`} className="font-semibold underline">{j.id}</Link></span>)}
            </div>
          );
        })()}

        {/* Linked tasks — quick jump into whatever's assigned about this prospect */}
        <LinkedTasksChip prospectId={p.id} />

        {/* Contact + portfolio summary */}
        <section className="rounded-xl bg-navy-50 p-4 dark:bg-white/5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Phone" value={c.phone || "—"} />
            <Field label="Email" value={c.email || "—"} />
            <Field label="Service" value={c.service} span />
            <Field label="Last done" value={c.lastDone} />
            <Field label="Last invoice" value={c.lastInvoice} />
            <Field label="Suggested quote" value={c.suggested} highlight />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <OutreachToolbar
              contact={{ phone: c.phone, email: c.email, name: c.name }}
              emailSubject={renewEmail.subject}
              emailBody={renewEmail.body}
              onEmail={onEmail ? () => onEmail(p) : undefined}
              waMessage={p.isAgent ? agentWaMessage(c.name) : buildProspectWaMessage(p, fromName)}
              onAiCall={startAiCall}
              onChannelClick={(ch) => log(ch === "call" ? "call" : ch)}
            />
            <button
              type="button"
              onClick={() => onToggleAgent?.(p.id, !p.isAgent)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              title={p.isAgent ? "Unmark as letting agent" : "Mark as letting agent"}
            >
              <FiHome className="h-3.5 w-3.5" /> {p.isAgent ? "Letting agent" : "Landlord"}
            </button>
          </div>
          {aiCalling && <p className="mt-2 text-xs text-navy-500"><FiPhoneCall className="inline" /> AI call starting…</p>}
        </section>

        {/* Pricing uplift */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Pricing uplift</span>
            <span className="text-xs text-navy-500">applied to {c.lastInvoice}</span>
          </div>
          <div className="flex gap-1">
            {[0, 5, 10, 15].map((u) => (
              <button key={u} onClick={() => setUplift(u)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  uplift === u
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-200"
                    : "border-navy-200 hover:bg-navy-50 dark:border-white/10 dark:hover:bg-white/5"
                }`}>{u}%</button>
            ))}
          </div>
        </section>

        {/* Cert history */}
        {(p.description || p.jobDate) && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Cert history</h4>
            <div className="rounded-lg border border-navy-100 p-3 text-sm dark:border-white/10">
              <div className="flex items-center gap-2">
                <FiClock className="h-3.5 w-3.5 text-navy-400" />
                <span className="font-semibold">{p.jobDate || "—"}</span>
                <span className="text-navy-500">·</span>
                <span>{svcs.map(serviceLabel).join(", ")}</span>
                {p.invoiceAmount != null && <span className="ml-auto text-navy-600">£{p.invoiceAmount.toFixed(2)}</span>}
              </div>
              {p.description && <p className="mt-1 text-xs text-navy-500 dark:text-slate-400">{p.description}</p>}
            </div>
          </section>
        )}

        {/* Stage transitions (secondary actions) */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Stage</h4>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button key={s.key} onClick={() => {
                // "interested" → create a quote job; "booked" → create a scheduled job.
                if (s.key === "interested" && !p.convertedJobId) {
                  onConvert?.(p.id, { status: "quote" });
                } else if (s.key === "booked" && !p.convertedJobId) {
                  onConvert?.(p.id, { status: "scheduled" });
                } else {
                  onUpdate?.(p.id, { stage: s.key });
                }
              }}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  p.stage === s.key
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-200"
                    : "border-navy-200 text-navy-600 hover:bg-navy-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
                }`}>{s.label}</button>
            ))}
          </div>
        </section>

        {/* Note input */}
        <section>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Log a note</label>
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Left voicemail / wants quote / booked for next week" />
          <div className="mt-2 flex gap-1.5">
            <button className="btn-secondary text-xs" onClick={() => log("note")}>Save note</button>
            <button className="btn-secondary text-xs" onClick={() => log("note", "interested")}>Note + interested</button>
            <button className="btn-secondary text-xs" onClick={() => log("note", "booked")}>Note + booked</button>
            <button className="btn-secondary text-xs text-rose-600" onClick={() => log("note", "dnc")}>DNC</button>
          </div>
        </section>

        {/* What came of it — one tap, so every contact has an outcome on
            record instead of just "call outreach". */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">What happened?</h4>
          {(() => {
            const best = bestCallTimes(allJobs || [], allProspects || []).best;
            return best ? <p className="mb-2 text-xs text-navy-500">People pick up most between <strong className="text-navy-800">{best.label}</strong> ({best.rate}% of logged calls).</p> : null;
          })()}
          <div className="flex flex-wrap gap-1.5">
            {["No answer", "Left a message", "Call back later", "Wants a quote", "Already sorted elsewhere", "Not interested"].map((o) => (
              <button key={o} type="button" onClick={() => onLog?.(p.id, { channel: "outcome", note: note ? `${o} — ${note}` : o })} className="rounded-lg border border-navy-200 px-2.5 py-1 text-xs font-semibold text-navy-700 hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:text-slate-200">{o}</button>
            ))}
          </div>
        </section>

        {/* Activity */}
        {(p.contactLog || []).length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Activity</h4>
            <ul className="space-y-1.5">
              {p.contactLog.map((e, i) => (
                <li key={i} className="rounded-lg border border-navy-100 p-2 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between text-[11px] text-navy-500 dark:text-slate-400">
                    <span className="font-semibold capitalize text-navy-700 dark:text-slate-200">{e.channel}</span>
                    <span>{new Date(e.at).toLocaleString("en-GB")}</span>
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

function Field({ label, value, span, highlight }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</div>
      <div className={`text-sm font-medium ${highlight ? "text-brand-700 dark:text-brand-300" : "text-navy-900 dark:text-slate-100"}`}>{value || "—"}</div>
    </div>
  );
}

// Small chip showing how many open tasks are linked to this prospect. Click
// jumps to the first one on the Team board (usually the auto-generated
// chase task) so the assignee lands straight on the task detail.
function LinkedTasksChip({ prospectId }) {
  const [tasks, setTasks] = useState(null);
  useEffect(() => {
    if (!prospectId) return;
    let live = true;
    (async () => {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.from("tasks").select("id,data").limit(500);
      if (!live) return;
      const open = (data || [])
        .map((r) => r.data)
        .filter((t) => t && t.status !== "done"
          && t.linkedTo?.kind === "prospect"
          && t.linkedTo?.id === prospectId);
      setTasks(open);
    })();
    return () => { live = false; };
  }, [prospectId]);

  if (!tasks || tasks.length === 0) return null;
  const first = tasks[0];
  const label = tasks.length === 1
    ? first.title
    : `${tasks.length} open tasks about this prospect`;
  return (
    <Link
      href={`/team?tab=board&task=${first.id}`}
      className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500 text-white">
        <FiCheckSquare className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Task{tasks.length === 1 ? "" : "s"} on this prospect
        </p>
        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{label}</p>
      </div>
      <FiChevronRight className="h-4 w-4 shrink-0 text-amber-600" />
    </Link>
  );
}
