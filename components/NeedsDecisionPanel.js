"use client";

// NeedsDecisionPanel — admin/founder dashboard panel (handoff §4.1B).
// Surfaces things only the founder can act on:
//   • Engineer recruits at agreement_signed (need meeting + rate card)
//   • Big agents at engaged (proposal review)
//   • Jobs stuck >7 days in one status
//   • Coverage alerts (0 active engineers for a core service line)

import { useMemo } from "react";
import Link from "next/link";
import { FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { needsDecision } from "@/lib/today";

const TYPE_TONE = {
  recruit:  "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  agent:    "border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-500/40 dark:bg-purple-500/10 dark:text-purple-200",
  job:      "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200",
  coverage: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
};

export default function NeedsDecisionPanel() {
  const { agents, jobs, engineers, recruits } = useStore();
  const items = useMemo(
    () => needsDecision({ agents, recruits, jobs, engineers }),
    [agents, jobs, engineers, recruits]
  );

  return (
    <section className="rounded-2xl bg-white shadow-sm dark:border-white/10 dark:bg-navy-800 dark:border">
      <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-white/10">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy-700 dark:text-slate-200">Needs your decision</h2>
          <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">Items only the founder can move forward</p>
        </div>
        {items.length > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">{items.length}</span>
        )}
      </header>

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <FiCheckCircle className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
          <p className="text-sm text-navy-500 dark:text-slate-400">All clear — nothing waiting on you.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={it.href}
                className="flex items-start gap-4 px-6 py-4 transition hover:bg-slate-50 dark:hover:bg-white/5">
                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${TYPE_TONE[it.type] || ""}`}>
                  <FiAlertCircle className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-navy-900 dark:text-white">{it.title}</div>
                  <div className="truncate mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{it.reason}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
