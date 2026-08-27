// KPICard — richer stat card with optional secondary £ value and traffic-light
// tiering. Used on the Dashboard and Reports. The simpler StatCard stays for
// places that only need a single number.
//
// Tier prop:
//   "neutral" (default), "good", "warn", "danger"  → drives the accent stripe
//
// Tiering helper: tierByRange(value, [warnAt, dangerAt]) — pass thresholds.
// Example: tierByRange(daysUntilRenewal, [30, 7]) → ≤7 danger, ≤30 warn.

const TIER_STRIPE = {
  neutral: "bg-navy-300 dark:bg-white/15",
  good:    "bg-emerald-500",
  warn:    "bg-amber-500",
  danger:  "bg-rose-500",
};

export function tierByRange(value, [warnAt, dangerAt]) {
  if (value == null) return "neutral";
  if (value <= dangerAt) return "danger";
  if (value <= warnAt) return "warn";
  return "neutral";
}

export default function KPICard({
  label,
  value,
  secondary,        // e.g. "£12,450"
  hint,             // small caption under the value
  tier = "neutral",
  icon: Icon,
  href,             // optional — turns the card into a link
  onClick,
}) {
  const inner = (
    <>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${TIER_STRIPE[tier] || TIER_STRIPE.neutral}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold leading-none text-navy-900 dark:text-white">{value ?? "—"}</span>
            {secondary != null && (
              <span className="text-sm font-semibold text-navy-500 dark:text-slate-400">{secondary}</span>
            )}
          </div>
          {hint && <div className="mt-1 text-xs text-navy-500 dark:text-slate-400">{hint}</div>}
        </div>
        {Icon && (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-200">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </>
  );

  const baseCls = "relative block overflow-hidden rounded-xl border border-navy-200 bg-white p-4 transition-colors dark:border-white/10 dark:bg-navy-900";
  const interactive = (href || onClick) ? " hover:border-brand-400 cursor-pointer" : "";

  if (href) return <a href={href} className={baseCls + interactive}>{inner}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={baseCls + interactive + " text-left w-full"}>{inner}</button>;
  return <div className={baseCls}>{inner}</div>;
}
