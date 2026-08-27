"use client";

// DialerView — one-contact-at-a-time call queue for /leads (handoff §4.4).
//
// The agent works through today's eligible stack in order. Each lead shows
// the phone number HUGE so it's easy to dial on a separate handset; tapping
// the number on mobile triggers the native dialler. After the call ends, the
// agent picks one outcome — that updates the lead and auto-advances.
//
// Outcomes:
//   No Answer       → attempt_count++, last_attempt_at=now, stays in stack
//                     (auto-marked lost_dormant after 3 no-answers)
//   Not Interested  → stage=lost_dormant, advance
//   Interested      → stage=engaged, advance (surfaces in tomorrow's Today panel)
//   Skip for now    → sends to bottom of today's stack (in-session only)

import { useMemo, useState } from "react";
import {
  FiPhone, FiPhoneCall, FiX, FiCheck, FiSlash, FiSkipForward,
  FiCheckCircle, FiAlertTriangle, FiHome, FiMail,
} from "react-icons/fi";
import StageBadge from "./StageBadge";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";
import { nextInDailyStack, attemptCount, ATTEMPT_LIMIT, segmentMeta } from "@/lib/cold-leads";

export default function DialerView({ leads, onLog, onUpdate, onEmail }) {
  const [skipped, setSkipped] = useState(() => new Set());
  const [aiCalling, setAiCalling] = useState(false);

  const queue = useMemo(() => nextInDailyStack(leads, { skippedIds: skipped }), [leads, skipped]);
  const lead = queue[0];
  const sm = lead ? segmentMeta(lead.segment) : null;
  const attempts = lead ? attemptCount(lead) : 0;
  const remainingAttempts = ATTEMPT_LIMIT - attempts;

  const advance = (lead, patch, logNote) => {
    const now = new Date().toISOString();
    const incremental = patch?.bumpAttempt
      ? { attempt_count: (lead.attempt_count || attempts) + 1, last_attempt_at: now }
      : { last_attempt_at: now };
    const stagePatch = patch?.stage ? { stage: patch.stage } : {};
    onUpdate?.(lead.id, { ...incremental, ...stagePatch });
    if (logNote) onLog?.(lead.id, { channel: "call", note: logNote });

    // Auto-mark lost_dormant after 3rd no-answer (one extra log entry is fine).
    if (patch?.bumpAttempt) {
      const newCount = (lead.attempt_count || attempts) + 1;
      if (newCount >= ATTEMPT_LIMIT && lead.stage !== "lost_dormant") {
        setTimeout(() => onUpdate?.(lead.id, { stage: "lost_dormant" }), 0);
      }
    }
  };

  const onNoAnswer    = () => { advance(lead, { bumpAttempt: true }, "No answer"); toast.success("Logged: no answer"); };
  const onNotInterested = () => { advance(lead, { stage: "lost_dormant" }, "Not interested"); toast.success("Marked not interested"); };
  const onInterested  = () => { advance(lead, { stage: "engaged" }, "Interested — follow up"); toast.success("Moved to engaged"); };
  const onSkip        = () => { setSkipped((p) => { const n = new Set(p); n.add(lead.id); return n; }); };
  const onBooked      = () => { advance(lead, { stage: "booked" }, "Booked"); toast.success("Marked booked"); };
  const onDnc         = () => { advance(lead, { stage: "dnc" }, "DNC requested"); toast.success("Marked DNC"); };

  const startAiCall = async () => {
    if (!lead) return;
    setAiCalling(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch("/api/vapi/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ coldLeadId: lead.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.notConfigured) toast.error("AI calling isn't set up — add Vapi keys.");
      else if (!res.ok || result.error) toast.error(result.error || "Couldn't start AI call.");
      else toast.success("AI call started");
    } catch { toast.error("Couldn't start AI call."); }
    finally { setAiCalling(false); }
  };

  if (!lead) {
    return (
      <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 p-12 text-center dark:border-emerald-500/40 dark:bg-emerald-950/30">
        <FiCheckCircle className="mx-auto mb-3 h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-200">Today&rsquo;s stack is clear</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-emerald-700 dark:text-emerald-300">
          Every eligible lead has been dialled today, skipped this session, or hit the {ATTEMPT_LIMIT}-attempt cap. Switch to <strong>List</strong> to clean up dead-ends, or come back tomorrow.
        </p>
        {skipped.size > 0 && (
          <button className="btn-secondary mt-4 inline-flex items-center gap-2" onClick={() => setSkipped(new Set())}>
            <FiSkipForward /> Bring back {skipped.size} skipped
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stack counter */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-navy-600 dark:text-slate-400">
          <strong className="text-navy-900 dark:text-white">{queue.length}</strong> left in today&rsquo;s stack
          {skipped.size > 0 && <span className="ml-2 text-navy-400">· {skipped.size} skipped</span>}
        </span>
        <StageBadge stage={lead.stage} />
      </div>

      {/* Lead card */}
      <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-navy-900 sm:p-8">
        {/* Contact header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold text-navy-900 dark:text-white">{lead.name}</h2>
            {lead.address && <p className="mt-1 text-sm text-navy-500 dark:text-slate-400">{lead.address}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {sm && (
                <span className="rounded-full bg-navy-100 px-2 py-0.5 font-bold text-navy-700 dark:bg-white/10 dark:text-slate-300">
                  {sm.label}
                </span>
              )}
              {lead.source && <span className="text-navy-400 dark:text-slate-500">via {lead.source}</span>}
            </div>
          </div>
          <button onClick={onSkip} className="btn-ghost text-xs" title="Skip for now (goes to bottom of today's stack)">
            <FiSkipForward className="h-3.5 w-3.5" /> Skip
          </button>
        </div>

        {/* Phone — huge */}
        <a href={`tel:${lead.phone}`} className="block rounded-xl bg-navy-50 p-6 text-center transition hover:bg-navy-100 dark:bg-white/5 dark:hover:bg-white/10">
          <FiPhone className="mx-auto mb-2 h-5 w-5 text-brand-600 dark:text-brand-400" />
          <div className="text-3xl font-bold tracking-wide text-navy-900 dark:text-white sm:text-4xl">{lead.phone}</div>
          <div className="mt-1 text-xs uppercase tracking-wider text-navy-500 dark:text-slate-400">Tap to dial</div>
        </a>

        {/* Outcome buttons — appears below the phone */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <OutcomeBtn icon={FiX} label="No answer" tone="neutral" onClick={onNoAnswer}
            hint={remainingAttempts > 0 ? `${remainingAttempts - 1} attempt${remainingAttempts - 1 === 1 ? "" : "s"} left after this` : null} />
          <OutcomeBtn icon={FiSlash} label="Not interested" tone="rose" onClick={onNotInterested} />
          <OutcomeBtn icon={FiCheck} label="Interested" tone="emerald" onClick={onInterested} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
          <OutcomeBtn icon={FiCheckCircle} label="Booked a job" tone="brand" onClick={onBooked} />
          <OutcomeBtn icon={FiAlertTriangle} label="Do not call again" tone="rose-outline" onClick={onDnc} />
        </div>

        {/* Secondary actions */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-navy-100 pt-4 dark:border-white/10">
          {lead.phone && (
            <button onClick={startAiCall} disabled={aiCalling} className="btn-secondary text-xs">
              <FiPhoneCall className="h-3.5 w-3.5" /> {aiCalling ? "Calling…" : "AI call instead"}
            </button>
          )}
          {lead.email && (
            <button onClick={() => onEmail?.(lead)} className="btn-secondary text-xs">
              <FiMail className="h-3.5 w-3.5" /> Email
            </button>
          )}
          {attempts > 0 && (
            <span className="ml-auto text-xs text-navy-500 dark:text-slate-400">
              Attempt {attempts + 1} of {ATTEMPT_LIMIT}
            </span>
          )}
        </div>

        {/* History (compact) */}
        {(lead.contactLog || []).length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">
              Previous notes ({lead.contactLog.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {lead.contactLog.slice(0, 5).map((e, i) => (
                <li key={i} className="rounded border border-navy-100 p-2 text-xs dark:border-white/10">
                  <span className="font-semibold capitalize">{e.channel}</span>
                  <span className="ml-2 text-navy-400">{new Date(e.at).toLocaleString("en-GB")}</span>
                  {e.note && <div className="mt-0.5 text-navy-600 dark:text-slate-300">{e.note}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function OutcomeBtn({ icon: Icon, label, tone, onClick, hint }) {
  const tones = {
    neutral: "bg-white border-navy-200 hover:border-navy-400 text-navy-800 dark:bg-navy-900 dark:border-white/10 dark:hover:border-white/30 dark:text-slate-200",
    rose: "bg-rose-600 hover:bg-rose-700 text-white border-rose-600",
    emerald: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
    brand: "bg-brand-600 hover:bg-brand-700 text-white border-brand-600",
    "rose-outline": "bg-white border-rose-300 hover:bg-rose-50 text-rose-700 dark:bg-navy-900 dark:border-rose-500/40 dark:hover:bg-rose-500/10 dark:text-rose-300",
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${tones[tone] || tones.neutral}`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
      {hint && <span className="text-[10px] font-medium opacity-80">{hint}</span>}
    </button>
  );
}
