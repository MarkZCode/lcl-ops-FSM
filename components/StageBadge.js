// StageBadge — single source of truth for outreach pipeline stage pills.
// Used by Prospects, Letting Agents, Cold Leads, and Engineer Recruits.
// Job-status pills (quote/scheduled/in_progress/...) keep using StatusBadge.

const STAGE_META = {
  // shared funnel stages
  new:           { label: "New",         dot: "bg-slate-400",   chip: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300" },
  contacted:     { label: "Contacted",   dot: "bg-blue-500",    chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200" },
  engaged:       { label: "Engaged",     dot: "bg-amber-500",   chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  interested:    { label: "Interested",  dot: "bg-amber-500",   chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  trial_job:     { label: "Trial job",   dot: "bg-purple-500",  chip: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200" },
  booked:        { label: "Booked",      dot: "bg-brand-500",   chip: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200" },
  active:        { label: "Active",      dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" },
  won:           { label: "Won",         dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" },
  dormant:       { label: "Dormant",     dot: "bg-slate-400",   chip: "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400" },
  lost_dormant:  { label: "Dormant",     dot: "bg-slate-400",   chip: "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400" },
  dnc:           { label: "Do Not Call", dot: "bg-rose-500",    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" },
  // engineer recruit stages
  sourced:           { label: "Sourced",          dot: "bg-slate-400",  chip: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300" },
  agreement_sent:    { label: "Agreement sent",   dot: "bg-blue-500",   chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200" },
  agreement_signed:  { label: "Agreement signed", dot: "bg-amber-500",  chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  rate_card_set:     { label: "Rate set",         dot: "bg-amber-500",  chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  meeting_scheduled: { label: "Meeting booked",   dot: "bg-purple-500", chip: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200" },
  onboarded:         { label: "Onboarded",        dot: "bg-emerald-500",chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" },
};

export function stageMeta(stage) {
  return STAGE_META[stage] || { label: stage || "—", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400" };
}

export default function StageBadge({ stage, size = "md" }) {
  const meta = stageMeta(stage);
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${meta.chip} ${pad}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
