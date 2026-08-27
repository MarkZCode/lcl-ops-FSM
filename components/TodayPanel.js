"use client";

// TodayPanel — top 6 priority items across all 4 demand modules, ranked by
// composite score. Built for the daily-operator (agent role) — clicking a row
// opens the relevant module pre-focused on the item.

import { useMemo } from "react";
import Link from "next/link";
import { FiArrowRight, FiHome, FiTarget, FiZap, FiTool, FiCheckCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { todayQueue } from "@/lib/today";

const TYPE_META = {
  agent:    { label: "Letting agent", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200", icon: FiHome },
  prospect: { label: "Prospect",      color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",         icon: FiTarget },
  recruit:  { label: "Recruit",       color: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",     icon: FiTool },
  lead:     { label: "Cold lead",     color: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",         icon: FiZap },
};

export default function TodayPanel() {
  const { prospects, agents, coldLeads } = useStore();
  // Engineer recruits live in their own table (Phase 3) — pass [] for now.
  const queue = useMemo(
    () => todayQueue({ prospects, agents, leads: coldLeads, recruits: [] }, 6),
    [prospects, agents, coldLeads]
  );

  return (
    <section className="rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
      <header className="flex items-center justify-between border-b border-navy-100 px-4 py-3 dark:border-white/10">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy-700 dark:text-slate-200">Today — Top 6</h2>
          <p className="text-xs text-navy-500 dark:text-slate-400">Ranked across Agents · Prospects · Recruits · Cold Leads</p>
        </div>
        <Link href="/agents" className="hidden text-xs font-semibold text-brand-600 hover:text-brand-700 sm:inline">Open queues <FiArrowRight className="inline" /></Link>
      </header>

      {queue.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <FiCheckCircle className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
          <p className="text-sm text-navy-500 dark:text-slate-400">Nothing urgent — outreach pipelines are quiet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-navy-100 dark:divide-white/5">
          {queue.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta?.icon;
            return (
              <li key={item.id}>
                <Link href={item.href}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-navy-50 dark:hover:bg-white/5">
                  <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta?.color || ""}`}>
                    {Icon && <Icon className="h-3 w-3" />}
                    {meta?.label || item.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-navy-900 dark:text-white">{item.title}</div>
                    <div className="truncate text-xs text-navy-500 dark:text-slate-400">{item.subtitle}</div>
                  </div>
                  <span className="hidden shrink-0 text-[10px] font-medium text-navy-400 dark:text-slate-500 sm:inline">score {Math.round(item.score)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
