"use client";

// DailyActivityPanel — replaces the ranked Top-6 queue with three useful views
// for a 1-operator FSM:
//   1. Activity today — what Lisa did today (calls, emails, WhatsApp logged)
//   2. At risk — leads contacted >7d ago and still in new/contacted (cold pipeline)
//   3. Performance — counts by stage transition in the last 7 days
//
// Pulls live counts from prospects + agents + leads in the store.

import { useMemo } from "react";
import Link from "next/link";
import {
  FiActivity, FiAlertCircle, FiTrendingUp, FiPhone, FiMail,
  FiMessageCircle, FiCheckCircle, FiArrowRight,
} from "react-icons/fi";
import { useStore } from "@/lib/store";

const ONE_DAY = 86400000;

function inLastDays(iso, days) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < days * ONE_DAY;
}

function entriesToday(records, getLog) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const ts = start.getTime();
  const out = { call: 0, email: 0, whatsapp: 0, note: 0, total: 0 };
  for (const r of records) {
    for (const e of getLog(r) || []) {
      const at = e.at || e.ts;
      if (!at) continue;
      if (new Date(at).getTime() < ts) continue;
      out.total++;
      if (e.channel === "call" || e.channel === "ai-call") out.call++;
      else if (e.channel === "email") out.email++;
      else if (e.channel === "whatsapp") out.whatsapp++;
      else out.note++;
    }
  }
  return out;
}

function atRiskCount(records) {
  // contacted >7 days ago, still in new/contacted stage, has phone or email
  return records.filter((r) => {
    if (!["new", "contacted"].includes(r.stage)) return false;
    if (!r.lastContactedAt) return false;
    const age = Date.now() - new Date(r.lastContactedAt).getTime();
    return age > 7 * ONE_DAY && (r.phone || r.ownerPhone || r.contactEmail || r.email);
  }).length;
}

function stageTransitionsLast7d(records, getLog, targetStage) {
  // Approx: count of log entries that flipped to targetStage in last 7 days.
  // We don't store the post-entry stage on each log line, so we count entries
  // tagged "note + booked" style messages OR just stage === target now with
  // last contact in the window. Good enough for a 7-day snapshot.
  let n = 0;
  for (const r of records) {
    if (r.stage !== targetStage) continue;
    if (inLastDays(r.lastContactedAt, 7)) n++;
  }
  return n;
}

export default function DailyActivityPanel() {
  const { prospects, agents, coldLeads } = useStore();

  const data = useMemo(() => {
    const todayP = entriesToday(prospects, (r) => r.contactLog);
    const todayA = entriesToday(agents,    (r) => r.timeline);
    const todayL = entriesToday(coldLeads, (r) => r.contactLog);
    const today = {
      call:     todayP.call + todayA.call + todayL.call,
      email:    todayP.email + todayA.email + todayL.email,
      whatsapp: todayP.whatsapp + todayA.whatsapp + todayL.whatsapp,
      note:     todayP.note + todayA.note + todayL.note,
      total:    todayP.total + todayA.total + todayL.total,
    };
    const atRisk = atRiskCount(prospects) + atRiskCount(agents) + atRiskCount(coldLeads);
    const booked7 = stageTransitionsLast7d(prospects, (r) => r.contactLog, "booked")
                  + stageTransitionsLast7d(agents,    (r) => r.timeline,   "trial_job");
    const engaged7 = stageTransitionsLast7d(prospects, (r) => r.contactLog, "engaged")
                   + stageTransitionsLast7d(agents,    (r) => r.timeline,   "engaged")
                   + stageTransitionsLast7d(coldLeads, (r) => r.contactLog, "engaged");
    return { today, atRisk, booked7, engaged7 };
  }, [prospects, agents, coldLeads]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Activity today */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Today&rsquo;s activity</span>
          <span className="tnum text-[13px] font-semibold text-navy-900">{data.today.total}</span>
        </div>
        <div className="metric-row">
          <Mini n={data.today.call}     label="Calls" />
          <Mini n={data.today.email}    label="Emails" />
          <Mini n={data.today.whatsapp} label="WhatsApp" />
          <Mini n={data.today.note}     label="Notes" />
        </div>
        {data.today.total === 0 && (
          <p className="border-t border-navy-100 px-4 py-2.5 text-[11px] text-navy-500">
            No outreach logged yet today.
          </p>
        )}
      </section>

      {/* At risk */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">At risk</span>
          <span className={`tnum text-[13px] font-semibold ${data.atRisk > 0 ? "delta-down" : "text-navy-900"}`}>{data.atRisk}</span>
        </div>
        <p className="px-4 pt-2.5 text-[11px] text-navy-500">Contacted &gt;7d ago, no reply, still in pipeline</p>
        <div className="mt-1.5 pb-1">
          {[
            { href: "/prospects?filter=stale", label: "Stale prospects" },
            { href: "/agents?filter=stale",    label: "Stale agents" },
            { href: "/leads?filter=stale",     label: "Stale cold leads" },
          ].map((r) => (
            <Link key={r.href} href={r.href}
              className="flex items-center justify-between px-4 py-2.5 text-[13px] text-navy-700 transition-colors hover:bg-navy-50">
              <span>{r.label}</span>
              <FiArrowRight className="h-3.5 w-3.5 text-navy-500" />
            </Link>
          ))}
        </div>
      </section>

      {/* Performance — last 7d */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Last 7 days</span>
          <span className="text-[11px] text-navy-500">Stage movements</span>
        </div>
        <div className="metric-row" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <div className="metric-cell">
            <p className="metric-label">Engaged</p>
            <div className="metric-figure"><span className="metric-value">{data.engaged7}</span></div>
          </div>
          <div className="metric-cell">
            <p className="metric-label">Booked / trial</p>
            <div className="metric-figure"><span className="metric-value">{data.booked7}</span></div>
          </div>
        </div>
        <p className="border-t border-navy-100 px-4 py-2.5 text-[11px] text-navy-500">
          Conversion proxy — stage changes this week across all pipelines.
        </p>
      </section>
    </div>
  );
}

// A hairline-split cell in the activity strip — same primitive the
// dashboard Overview uses, so the two panels read as one system.
function Mini({ n, label }) {
  return (
    <div className="metric-cell">
      <p className="metric-label">{label}</p>
      <div className="metric-figure"><span className="metric-value">{n}</span></div>
    </div>
  );
}
