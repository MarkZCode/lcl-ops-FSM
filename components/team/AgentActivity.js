"use client";

// Agent activity scorecards + drill-down — extracted verbatim from the old
// /team page so the new tabbed workspace can reuse it as its "Activity" tab.
// Displays per-agent call/email counts across every outreach section
// (Prospects, Leads, Agents, Recruits) with a slide-over showing the
// individual contacts each agent touched.

import { useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiPhone, FiMail, FiUsers, FiZap, FiClock,
  FiMessageCircle, FiChevronRight, FiUser, FiCheckSquare,
} from "react-icons/fi";
import DetailSlideOver from "@/components/DetailSlideOver";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { buildAgentActivity, teamTotals, timeAgo, ACTIVITY_SECTIONS } from "@/lib/activity";

function buildAgentContacts(agentKey, agentName, { prospects = [], coldLeads = [], agents = [], recruits = [] }) {
  const matches = (by) => {
    if (!by) return false;
    if (typeof by === "string") return by === agentKey || by === agentName;
    return by.id === agentKey || by.name === agentName;
  };

  const extract = (items, getLog, getLabel, getSub, section) =>
    items
      .map((item) => {
        const entries = (getLog(item) || []).filter((e) => e && e.direction !== "in" && matches(e.by));
        if (!entries.length) return null;
        const sorted = [...entries].sort((a, b) => new Date(b.at || b.ts || 0) - new Date(a.at || a.ts || 0));
        return {
          id: item.id,
          label: getLabel(item),
          sub: getSub(item),
          section,
          entries: sorted,
          lastAt: sorted[0]?.at || sorted[0]?.ts,
          calls: sorted.filter((e) => /call|phone|tel/.test((e.channel || "").toLowerCase())).length,
          emails: sorted.filter((e) => /email|mail/.test((e.channel || "").toLowerCase())).length,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));

  return [
    ...extract(prospects, (p) => p.contactLog, (p) => p.nameOnCert || p.ownerName || "—", (p) => p.address || "", "prospects"),
    ...extract(coldLeads, (l) => l.contactLog, (l) => l.name || l.company || "—", (l) => l.segment || "", "leads"),
    ...extract(agents,    (a) => a.timeline,   (a) => a.name || "—",               (a) => a.company || "", "agents"),
    ...extract(recruits,  (r) => r.timeline,   (r) => r.name || "—",               (r) => r.trade || r.segment || "", "recruits"),
  ].sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
}

export default function AgentActivity() {
  const { prospects, coldLeads, agents, recruits } = useStore();
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [scope, setScope] = useState("week");
  const [agentDetail, setAgentDetail] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token || "";
        const [uRes, tRes] = await Promise.all([
          fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
          supabase.from("tasks").select("id,data"),
        ]);
        if (!live) return;
        if (uRes.ok) {
          const j = await uRes.json();
          setUsers(j.users || []);
        }
        setTasks((tRes.data || []).map((r) => r.data));
      } catch { /* ignore */ }
    })();
    return () => { live = false; };
  }, []);

  // Task completion metrics per agent — mirrors the same time-window
  // buckets (today / this-week / all-time) as the call+email scorecards,
  // computed from the tasks table.
  const taskStatsByUser = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7);
    const out = new Map();
    const bump = (id, bucket, key) => {
      if (!id) return;
      if (!out.has(id)) out.set(id, { openMine: 0, doneToday: 0, doneWeek: 0, doneAll: 0, overdueMine: 0 });
      out.get(id)[bucket] = (out.get(id)[bucket] || 0) + 1;
    };
    for (const t of tasks) {
      if (!t) continue;
      // Completed by whoever actually marked it done (not the assignee, in case they differ).
      if (t.status === "done" && t.completedBy?.id) {
        bump(t.completedBy.id, "doneAll");
        const at = t.completedAt ? new Date(t.completedAt).getTime() : 0;
        if (at >= startOfWeek.getTime()) bump(t.completedBy.id, "doneWeek");
        if (at >= startOfToday.getTime()) bump(t.completedBy.id, "doneToday");
      }
      if (t.status !== "done" && t.assigneeId) {
        bump(t.assigneeId, "openMine");
        if (t.dueDate && new Date(t.dueDate + "T23:59:59") < new Date()) {
          bump(t.assigneeId, "overdueMine");
        }
      }
    }
    return out;
  }, [tasks]);

  const seedActors = useMemo(() => users.filter((u) => u.role === "agent"), [users]);
  const rows = useMemo(
    () => buildAgentActivity({ prospects, coldLeads, agents, recruits }, { seedActors }).filter((r) => r.role === "agent"),
    [prospects, coldLeads, agents, recruits, seedActors]
  );
  const totals = useMemo(() => teamTotals(rows), [rows]);
  const pick = (stat) =>
    scope === "today" ? stat.today : scope === "week" ? stat.week : { calls: stat.calls, emails: stat.emails };
  const drillContacts = useMemo(() => {
    if (!agentDetail) return [];
    return buildAgentContacts(agentDetail.key, agentDetail.name, { prospects, coldLeads, agents, recruits });
  }, [agentDetail, prospects, coldLeads, agents, recruits]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={FiUsers} label="Agents tracked" value={totals.agents}
          sub={totals.activeToday ? `${totals.activeToday} active today` : "None active today"} tone="navy" />
        <SummaryCard icon={FiZap} label="Active today" value={totals.activeToday} sub="Logged ≥1 action" tone="brand" />
        <SummaryCard icon={FiPhone} label="Calls today" value={totals.callsToday} sub={`${totals.calls} all‑time`} tone="blue" />
        <SummaryCard icon={FiMail} label="Emails today" value={totals.emailsToday} sub={`${totals.emails} all‑time`} tone="violet" />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-navy-900 dark:text-white">Agent scorecards</h2>
          <p className="text-xs text-navy-400 dark:text-slate-500 mt-0.5">Tap a card to see exactly what each agent is working on.</p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-navy-200 dark:border-white/10">
          {[["today", "Today"], ["week", "This week"], ["all", "All time"]].map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                scope === k
                  ? "bg-navy-900 text-white dark:bg-white/15 dark:text-white"
                  : "bg-white text-navy-500 hover:bg-navy-50 dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/5"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 dark:border-white/10 p-14 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-navy-100 text-navy-400 dark:bg-white/5 dark:text-slate-500">
            <FiActivity className="h-6 w-6" />
          </div>
          <p className="font-semibold text-navy-700 dark:text-slate-200">No activity logged yet</p>
          <p className="mt-1 text-sm text-navy-400 dark:text-slate-500 max-w-sm mx-auto">
            Calls and emails logged in Prospects, Leads, Agents and Recruits will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <AgentCard
              key={r.key}
              row={r}
              period={pick(r)}
              taskStats={taskStatsByUser.get(r.key)}
              taskScope={scope}
              onClick={() => setAgentDetail(r)}
            />
          ))}
        </div>
      )}

      <AgentDrillOver row={agentDetail} contacts={drillContacts} onClose={() => setAgentDetail(null)} />
    </div>
  );
}

const SECTION_LABELS = { prospects: "Prospects", leads: "Leads", agents: "Agents", recruits: "Recruits" };
const SECTION_COLORS_MAP = {
  prospects: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300",
  leads: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  agents: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  recruits: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
};

function AgentDrillOver({ row, contacts, onClose }) {
  const [sectionFilter, setSectionFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  useEffect(() => { setSectionFilter("all"); setExpandedId(null); }, [row?.key]);
  const filtered = sectionFilter === "all" ? contacts : contacts.filter((c) => c.section === sectionFilter);
  const sectionCounts = useMemo(() => {
    const c = {};
    for (const ct of contacts) c[ct.section] = (c[ct.section] || 0) + 1;
    return c;
  }, [contacts]);

  return (
    <DetailSlideOver
      open={!!row}
      onClose={onClose}
      title={row?.name || "Agent"}
      subtitle={`${contacts.length} contact${contacts.length !== 1 ? "s" : ""} touched · ${(row?.calls || 0) + (row?.emails || 0)} total actions`}
    >
      {row && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <span className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
              <FiPhone className="h-3 w-3" /> {row.calls} calls
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              <FiMail className="h-3 w-3" /> {row.emails} emails
            </span>
            {row.lastAt && (
              <span className="flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-600 dark:bg-white/5 dark:text-slate-400 ml-auto">
                <FiClock className="h-3 w-3" /> Last: {timeAgo(row.lastAt)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSectionFilter("all")}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                sectionFilter === "all"
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-navy-200 text-navy-500 hover:bg-navy-50 dark:border-white/10 dark:text-slate-400"
              }`}
            >
              All ({contacts.length})
            </button>
            {ACTIVITY_SECTIONS.map((s) => {
              const n = sectionCounts[s.key] || 0;
              if (!n) return null;
              return (
                <button
                  key={s.key}
                  onClick={() => setSectionFilter(s.key)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    sectionFilter === s.key
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                      : "border-navy-200 text-navy-500 hover:bg-navy-50 dark:border-white/10 dark:text-slate-400"
                  }`}
                >
                  {s.label} ({n})
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-navy-400 dark:text-slate-500">No activity in this section</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((ct) => {
                const isExpanded = expandedId === ct.id + ct.section;
                return (
                  <div key={ct.id + ct.section} className="overflow-hidden rounded-xl border border-navy-100 dark:border-white/[0.07]">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ct.id + ct.section)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-navy-50 dark:hover:bg-white/5 transition"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-100 dark:bg-white/10">
                        <FiUser className="h-3.5 w-3.5 text-navy-500 dark:text-slate-400" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{ct.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SECTION_COLORS_MAP[ct.section]}`}>
                            {SECTION_LABELS[ct.section]}
                          </span>
                          {ct.sub && <span className="truncate text-[11px] text-navy-400 dark:text-slate-500">{ct.sub}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-2 text-xs text-navy-500 dark:text-slate-400">
                          {ct.calls > 0 && <span className="flex items-center gap-0.5"><FiPhone className="h-3 w-3" />{ct.calls}</span>}
                          {ct.emails > 0 && <span className="flex items-center gap-0.5"><FiMail className="h-3 w-3" />{ct.emails}</span>}
                        </div>
                        <p className="text-[10px] text-navy-400 dark:text-slate-500 mt-0.5">{timeAgo(ct.lastAt)}</p>
                      </div>
                      <FiChevronRight className={`h-4 w-4 shrink-0 text-navy-300 dark:text-slate-600 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-navy-50 dark:border-white/5 bg-navy-50/50 dark:bg-white/[0.02] px-4 py-3 space-y-2">
                        {ct.entries.map((e, i) => {
                          const isCall = /call|phone|tel/.test((e.channel || "").toLowerCase());
                          const isEmail = /email|mail/.test((e.channel || "").toLowerCase());
                          const ts = e.at || e.ts;
                          return (
                            <div key={i} className="flex items-start gap-2.5">
                              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${
                                isCall ? "bg-blue-100 dark:bg-blue-500/10" : isEmail ? "bg-violet-100 dark:bg-violet-500/10" : "bg-navy-100 dark:bg-white/10"
                              }`}>
                                {isCall ? <FiPhone className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                                  : isEmail ? <FiMail className="h-2.5 w-2.5 text-violet-600 dark:text-violet-400" />
                                  : <FiMessageCircle className="h-2.5 w-2.5 text-navy-500 dark:text-slate-400" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold capitalize text-navy-700 dark:text-slate-200">{e.channel || "note"}</span>
                                  {ts && <span className="text-[10px] text-navy-400 dark:text-slate-500 shrink-0">
                                    {new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </span>}
                                </div>
                                {e.note && <p className="mt-0.5 text-xs text-navy-600 dark:text-slate-400">{e.note}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </DetailSlideOver>
  );
}

const TONES = {
  navy: { chip: "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-200" },
  brand: { chip: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" },
  blue: { chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  violet: { chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" },
};
const SECTION_COLORS = ["bg-brand-500", "bg-blue-500", "bg-violet-500", "bg-amber-500"];

function SummaryCard({ icon: Icon, label, value, sub, tone = "navy" }) {
  const t = TONES[tone];
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between gap-2">
        <span className="metric-label">{label}</span>
        <span className={`metric-chip ${t.chip}`}><Icon className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="metric-value mt-3">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-navy-400 dark:text-slate-500 truncate">{sub}</p>
    </div>
  );
}

function initials(name) {
  return (name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function AgentCard({ row, period, taskStats, taskScope, onClick }) {
  const sectionMax = Math.max(1, ...ACTIVITY_SECTIONS.map((s) => {
    const b = row.bySection[s.key]; return b ? b.calls + b.emails : 0;
  }));
  const totalPeriod = period.calls + period.emails;
  const tDone = taskStats ? (taskScope === "today" ? taskStats.doneToday : taskScope === "week" ? taskStats.doneWeek : taskStats.doneAll) : 0;
  const tOpen = taskStats?.openMine || 0;
  const tOverdue = taskStats?.overdueMine || 0;
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-navy-100 bg-white dark:border-white/[0.07] dark:bg-navy-900 overflow-hidden text-left w-full hover:border-brand-300 dark:hover:border-brand-500/40 transition-colors"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-navy-50 dark:border-white/5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">{initials(row.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy-900 dark:text-white truncate">{row.name}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">Agent</span>
            <span className="flex items-center gap-1 text-[11px] text-navy-400 dark:text-slate-500">
              <FiClock className="h-3 w-3" />{timeAgo(row.lastAt)}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-2xl font-extrabold leading-none text-navy-900 dark:text-white">{totalPeriod}</p>
          <p className="text-[10px] font-medium text-navy-400 dark:text-slate-500">actions</p>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-navy-50 dark:divide-white/5 border-b border-navy-50 dark:border-white/5">
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-navy-400 dark:text-slate-500 mb-1">
            <span className="grid h-4 w-4 place-items-center rounded bg-blue-50 dark:bg-blue-500/10"><FiPhone className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" /></span>Calls
          </div>
          <p className="tnum text-xl font-extrabold text-navy-900 dark:text-white">{period.calls}</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-navy-400 dark:text-slate-500 mb-1">
            <span className="grid h-4 w-4 place-items-center rounded bg-violet-50 dark:bg-violet-500/10"><FiMail className="h-2.5 w-2.5 text-violet-600 dark:text-violet-400" /></span>Emails
          </div>
          <p className="tnum text-xl font-extrabold text-navy-900 dark:text-white">{period.emails}</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-navy-400 dark:text-slate-500 mb-1">
            <span className="grid h-4 w-4 place-items-center rounded bg-brand-50 dark:bg-brand-500/10"><FiCheckSquare className="h-2.5 w-2.5 text-brand-600 dark:text-brand-400" /></span>Tasks done
          </div>
          <p className="tnum text-xl font-extrabold text-navy-900 dark:text-white">{tDone}</p>
          <p className="text-[10px] font-medium text-navy-400 dark:text-slate-500">
            {tOpen} open{tOverdue > 0 && <span className="text-rose-500"> · {tOverdue} overdue</span>}
          </p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {ACTIVITY_SECTIONS.map((s, i) => {
          const b = row.bySection[s.key];
          const c = b?.calls || 0, e = b?.emails || 0, tot = c + e;
          if (!tot && row.total) return null;
          const pct = Math.round((tot / sectionMax) * 100);
          return (
            <div key={s.key}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-600 dark:text-slate-300">{s.label}</span>
                <span className="tnum text-xs text-navy-400 dark:text-slate-500">
                  {c} <span className="text-navy-300 dark:text-slate-600">calls</span> · {e} <span className="text-navy-300 dark:text-slate-600">emails</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-navy-100 dark:bg-white/10">
                <div className={`h-full rounded-full transition-all ${SECTION_COLORS[i % SECTION_COLORS.length]}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-1.5 px-5 pb-3 text-[11px] text-navy-400 dark:text-slate-600">
        <span>View full activity</span><FiChevronRight className="h-3 w-3" />
      </div>
    </button>
  );
}
