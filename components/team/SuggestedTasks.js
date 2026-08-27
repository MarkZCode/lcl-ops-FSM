"use client";

// FSM-driven suggestion strip on the Board view. Fetches suggestions from
// /api/tasks/suggestions and lets the user one-click promote each into a
// real assigned task (opens the NewTaskModal prefilled). Suggestions the
// user already turned into a linked task automatically stop appearing —
// the server filters against the tasks table.

import { useEffect, useState } from "react";
import { FiZap, FiPlus, FiChevronRight, FiChevronDown, FiRefreshCw } from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { SOURCE_LABELS } from "@/lib/tasks";

async function authedFetch(url) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

const KIND_TONE = {
  prospect_renewal: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300",
  reply:            "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300",
  quote_followup:   "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300",
  job_unassigned:   "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-300",
};

export default function SuggestedTasks({ onPromote }) {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/tasks/suggestions");
      const j = await res.json();
      setItems(j.suggestions || []);
      setTotal(j.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  // Admin-only strip — agents don't see the raw FSM triage queue, only the
  // tasks that have already been assigned to them.
  if (!isAdmin) return null;
  if (!loading && items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
          <FiZap className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-900 dark:text-white">Suggested from your FSM</p>
          <p className="text-xs text-navy-500 dark:text-slate-400">
            {loading ? "Scanning prospects, jobs, replies…" : `${items.length} suggestion${items.length === 1 ? "" : "s"}${total > items.length ? ` (${total} total)` : ""} · one-click to assign`}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); load(); }}
          className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-white dark:hover:bg-white/10"
          title="Refresh"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        {expanded ? <FiChevronDown className="h-4 w-4 text-navy-400" /> : <FiChevronRight className="h-4 w-4 text-navy-400" />}
      </button>

      {expanded && items.length > 0 && (
        <div className="border-t border-brand-200/60 dark:border-brand-500/20">
          <ul className="divide-y divide-brand-200/40 dark:divide-brand-500/15">
            {items.map((s, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${KIND_TONE[s.kind] || "bg-navy-50 border-navy-200 text-navy-700"}`}>
                  {SOURCE_LABELS[s.kind] || s.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{s.title}</p>
                  <p className="truncate text-xs text-navy-500 dark:text-slate-400">{s.subtitle}</p>
                </div>
                <button
                  onClick={() => onPromote(s)}
                  className="shrink-0 rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 dark:bg-white/15 dark:hover:bg-white/25"
                >
                  <FiPlus className="mr-1 inline h-3 w-3" /> Assign
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
