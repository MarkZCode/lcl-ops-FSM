"use client";

// The rows the notification bell and the Notifications page share, so both
// read the same way: a tinted icon that says what kind of thing it is, the
// thing itself in one bold line, who or what it is about underneath, and
// when — with a dot while it is still unread.
import Link from "next/link";
import { LuUserRoundCheck, LuMessageSquareText, LuAlarmClock, LuClock3, LuListChecks } from "react-icons/lu";
import { daysUntilDue, taskDeepLink } from "@/lib/tasks";

const TONES = {
  team:  { icon: LuUserRoundCheck,    chip: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" },
  reply: { icon: LuMessageSquareText, chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" },
  late:  { icon: LuAlarmClock,        chip: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" },
  today: { icon: LuClock3,            chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" },
  task:  { icon: LuListChecks,        chip: "bg-navy-100 text-navy-600 dark:bg-white/10 dark:text-slate-300" },
};

// "now", "12m", "3h", "Tue", "4 Oct"
export function relTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  if (ms < 6 * 86400_000) return new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// The first line of a reply that actually says something — not "Hi Lisa",
// not the quoted "On Wed … wrote:" header.
const GREETING_ONLY = /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening))\b[\s,.!-]*[a-z'’-]*[\s,.!-]*$/i;
const QUOTED_HEADER = /^(on\s.+wrote:?$|on\s.+<|-{2,}\s*original message|from:\s|subject:\s)/i;
export function replyPreview(detail) {
  const lines = String(detail || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => l.length > 2 && !GREETING_ONLY.test(l) && !QUOTED_HEADER.test(l) && !l.startsWith(">")) || lines[0] || "";
}

export function NotifyGroup({ title, count, children }) {
  return (
    <section className="py-1">
      <h3 className="flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-navy-400 dark:text-slate-500">
        {title}
        {count > 0 && <span className="rounded-full bg-navy-100 px-1.5 text-[10px] font-bold leading-4 text-navy-600 dark:bg-white/10 dark:text-slate-300">{count}</span>}
      </h3>
      <div>{children}</div>
    </section>
  );
}

export function NotifyRow({ href, tone = "task", title, meta, when, whenTone = "", unread, onClick }) {
  const t = TONES[tone] || TONES.task;
  const Icon = t.icon;
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex items-start gap-3 px-4 py-3 transition hover:bg-navy-50 active:bg-navy-100 dark:hover:bg-white/5 dark:active:bg-white/10"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.chip}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[13.5px] leading-5 text-navy-900 dark:text-white ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
          <span className={`shrink-0 text-[11px] font-medium ${whenTone || "text-navy-400 dark:text-slate-500"}`}>{when}</span>
        </span>
        {meta && <span className="mt-0.5 block text-xs leading-[1.35] text-navy-500 line-clamp-2 dark:text-slate-400">{meta}</span>}
      </span>
      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-brand-500" : "bg-transparent"}`} aria-hidden />
    </Link>
  );
}

// A task as a notification row.
export function TaskNotifyRow({ task, userId, unread, onClick }) {
  const d = daysUntilDue(task);
  const byPerson = task.createdBy?.id && task.createdBy.id !== "system" && task.createdBy.id !== userId;
  const tone = byPerson ? "team" : d != null && d < 0 ? "late" : d === 0 ? "today" : "task";
  const when = d == null ? relTime(task.createdAt) : d < 0 ? `${Math.abs(d)}d late` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`;
  const meta = [byPerson ? `From ${String(task.createdBy.name || "a colleague").split("@")[0]}` : "", task.linkedTo?.label || "", byPerson ? String(task.notes || "").split("\n")[0] : ""].filter(Boolean).join(" · ");
  return (
    <NotifyRow
      href={taskDeepLink(task)} onClick={onClick} tone={tone} unread={unread}
      title={task.title} meta={meta} when={when}
      whenTone={d != null && d < 0 ? "text-rose-600 dark:text-rose-400" : d === 0 ? "text-amber-600 dark:text-amber-400" : ""}
    />
  );
}
