"use client";

// Team, at a glance: one card per person with what they are carrying, and
// under it that person's list in the order to do it. Tap a person to see
// theirs; yours is shown first.
import { useMemo, useState } from "react";
import { LuCheck, LuChevronRight } from "react-icons/lu";
import { daysUntilDue, priorityMeta } from "@/lib/tasks";

const initials = (n) => String(n || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const isOpen = (t) => t && t.status !== "done" && t.source !== "prospect_renewal";
const short = (n) => String(n || "").split("@")[0];
// Late = its exact time has passed, or its day has.
const isLate = (t) => (t.dueAt ? new Date(t.dueAt).getTime() < Date.now() : (daysUntilDue(t) ?? 1) < 0);

function sections(list, personId) {
  const fromTeam = [], late = [], today = [], later = [];
  for (const t of list) {
    const d = daysUntilDue(t);
    const byPerson = t.createdBy?.id && t.createdBy.id !== "system" && t.createdBy.id !== personId;
    if (byPerson) fromTeam.push(t);
    else if (isLate(t)) late.push(t);
    else if (d === 0) today.push(t);
    else later.push(t);
  }
  const pri = { urgent: 0, normal: 1, low: 2 };
  const byPri = (a, b) => (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1) || new Date(a.dueAt || a.dueDate || 8.64e15) - new Date(b.dueAt || b.dueDate || 8.64e15);
  return [
    ["Asked by the team", fromTeam.sort(byPri)],
    ["Late", late.sort(byPri)],
    ["Today", today.sort(byPri)],
    ["Coming up", later.sort(byPri)],
  ].filter(([, rows]) => rows.length);
}

export default function TeamOverview({ tasks, team, userId, isAdmin = false, onOpen, onDone, onTakeOver, loading }) {
  const [person, setPerson] = useState(userId || "");
  const open = useMemo(() => tasks.filter(isOpen), [tasks]);
  const people = useMemo(() => {
    const me = team.find((p) => p.id === userId);
    const rest = team.filter((p) => p.id !== userId);
    const rows = [...(me ? [{ ...me, you: true }] : []), ...rest].map((p) => {
      const mine = open.filter((t) => t.assigneeId === p.id);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
      const doneToday = tasks.filter((t) => t.status === "done" && t.assigneeId === p.id && !t.dismissed && t.completedBy?.id && t.completedBy.id !== "system"
        && t.completedAt && new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(t.completedAt)) === today).length;
      const away = p.awayUntil && p.awayUntil >= today;
      return { ...p, open: mine.length, late: mine.filter(isLate).length, doneToday, away };
    });
    const unassigned = open.filter((t) => !t.assigneeId).length;
    if (unassigned && isAdmin) rows.push({ id: "__none", name: "Unassigned", role: "", open: unassigned, late: 0 });
    return rows;
  }, [team, open, userId, tasks]);

  const current = people.find((p) => p.id === (person || userId)) || people[0];
  const list = current ? open.filter((t) => (current.id === "__none" ? !t.assigneeId : t.assigneeId === current.id)) : [];
  const groups = sections(list, current?.id);

  return (
    <div className="space-y-5">
      {/* People */}
      <div className="scroll-area -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {people.map((p) => {
          const active = current?.id === p.id;
          return (
            <button
              key={p.id} type="button" onClick={() => setPerson(p.id)}
              className={`flex min-w-[10.5rem] shrink-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${active ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900" : "border-navy-200 bg-white text-navy-800 hover:border-navy-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${active ? "bg-white/15 text-white dark:bg-navy-900/10 dark:text-navy-900" : "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"}`}>{initials(p.name)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{p.you ? "You" : short(p.name)}</span>
                <span className={`block text-xs ${active ? "opacity-80" : "text-navy-500 dark:text-slate-400"}`}>
                  {p.away ? <span className={active ? "" : "font-semibold text-amber-600"}>Away · </span> : ""}
                  {p.open} open{p.late ? <span className={active ? "" : "font-semibold text-rose-600 dark:text-rose-400"}> · {p.late} late</span> : ""}
                  {p.doneToday ? <span className={active ? "" : "text-brand-600"}> · {p.doneToday} done today</span> : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* That person's list */}
      {loading ? (
        <div className="card p-8 text-center text-sm text-navy-400">Loading tasks…</div>
      ) : !groups.length ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-base font-semibold text-navy-900 dark:text-white">Nothing open</p>
          <p className="mt-1 text-sm text-navy-500 dark:text-slate-400">{current?.you ? "New work appears here as soon as it's given to you." : `${short(current?.name)} has no open tasks.`}</p>
        </div>
      ) : (
        groups.map(([title, rows]) => (
          <section key={title}>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-400 dark:text-slate-500">
              <span className={title === "Late" ? "text-rose-600 dark:text-rose-400" : ""}>{title}</span>
              <span className="rounded-full bg-navy-100 px-1.5 text-[10px] font-bold leading-4 text-navy-600 dark:bg-white/10 dark:text-slate-300">{rows.length}</span>
            </h3>
            <ul className="card divide-y divide-navy-100 overflow-hidden p-0 dark:divide-white/10">
              {rows.map((t) => {
                const d = daysUntilDue(t);
                const late = isLate(t);
                const when = d == null ? "" : d < 0 ? `${Math.abs(d)}d late` : d === 0 ? (late ? "Late" : "Today") : d === 1 ? "Tomorrow" : `In ${d} days`;
                const byPerson = t.createdBy?.id && t.createdBy.id !== "system" && t.createdBy.id !== current.id;
                const meta = [byPerson ? `From ${short(t.createdBy.name)}` : "", t.linkedTo?.label || "", String(t.notes || "").split("\n")[0]].filter(Boolean).join(" · ");
                return (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <button type="button" onClick={() => onDone(t)} title="Mark done" aria-label={`Mark "${t.title}" done`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-navy-200 text-transparent transition hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600 dark:border-white/20">
                      <LuCheck className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-navy-900 dark:text-white">{t.title}</span>
                          {t.flaggedAt && <span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Left too long</span>}
                          {t.priority === "urgent" && !t.flaggedAt && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityMeta("urgent").chip}`}>Urgent</span>}
                        </span>
                        {meta && <span className="mt-0.5 block truncate text-xs text-navy-500 dark:text-slate-400">{meta}</span>}
                      </span>
                      {when && <span className={`shrink-0 text-xs font-semibold ${late ? "text-rose-600 dark:text-rose-400" : d === 0 ? "text-amber-600 dark:text-amber-400" : "text-navy-400"}`}>{when}</span>}
                      <LuChevronRight className="h-4 w-4 shrink-0 text-navy-300" />
                    </button>
                    {isAdmin && onTakeOver && !current.you && (
                      <button type="button" onClick={() => onTakeOver(t)} className="shrink-0 rounded-full border border-navy-200 px-2.5 py-1 text-xs font-semibold text-navy-600 hover:border-navy-400 dark:border-white/15 dark:text-slate-300">
                        Take over
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
