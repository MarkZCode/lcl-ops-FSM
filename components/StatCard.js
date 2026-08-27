export default function StatCard({ icon: Icon, label, value, sub, tone = "navy", trend, valueTone, onClick }) {
  const configs = {
    brand: {
      wrap: "bg-brand-600 text-white",
      label: "text-white/70",
      icon: "bg-white/15 text-white",
      sub: "text-white/70",
    },
    navy: {
      wrap: "bg-navy-900 text-white dark:bg-navy-800",
      label: "text-white/65",
      icon: "bg-white/10 text-white",
      sub: "text-white/65",
    },
    light: {
      wrap: "bg-white border border-navy-100 text-navy-900 dark:bg-navy-800 dark:border-white/10",
      label: "text-navy-500 dark:text-slate-400",
      icon: "bg-navy-50 text-navy-700 dark:bg-white/5 dark:text-slate-200",
      sub: "text-navy-500 dark:text-slate-400",
    },
    green: {
      wrap: "bg-emerald-600 text-white",
      label: "text-white/70",
      icon: "bg-white/15 text-white",
      sub: "text-white/70",
    },
  };
  const c = configs[tone] || configs.navy;
  // The trend chip used to be one fixed pair of classes — a 20%-opacity tint
  // behind near-WHITE text (text-emerald-50 / text-rose-50). That only ever
  // worked on the saturated dark cards; on a white "light" card it was white
  // text on a pale tint, which is why every percentage on the light KPI cards
  // was unreadable. Light cards now get full-strength ink on a light tint.
  const onDark = tone !== "light";
  const trendClass = onDark
    ? trend?.direction === "down"
      ? "bg-rose-500/25 text-rose-50"
      : "bg-emerald-500/25 text-emerald-50"
    : trend?.direction === "down"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";

  // Money leaving the business (engineer cost, company expenses) reads as red
  // so an outgoing figure is never mistaken for an incoming one at a glance.
  const valueClass =
    valueTone === "negative"
      ? "text-rose-600 dark:text-rose-400"
      : valueTone === "positive"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`w-full rounded-xl p-5 text-left ${c.wrap} ${onClick ? "transition hover:brightness-[0.98] dark:hover:brightness-125" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${c.label}`}>
          {label}
        </span>
        {Icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${c.icon}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className={`mt-3 text-[1.75rem] font-bold leading-none tracking-tight ${valueClass}`}>{value}</p>
      {(sub || trend) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {sub && <p className={`text-xs font-medium ${c.sub}`}>{sub}</p>}
          {trend && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${trendClass}`}
            >
              {trend.direction === "down" ? "▼" : "▲"} {trend.value}
            </span>
          )}
        </div>
      )}
    </Tag>
  );
}
