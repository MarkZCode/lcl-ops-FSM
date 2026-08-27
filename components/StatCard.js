export default function StatCard({ icon: Icon, label, value, sub, tone = "navy", trend }) {
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
  const isDark = tone === "navy" || tone === "brand" || tone === "green";
  return (
    <div className={`rounded-xl p-5 ${c.wrap}`}>
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
      <p className="mt-3 text-[1.75rem] font-bold leading-none tracking-tight">{value}</p>
      {(sub || trend) && (
        <div className="mt-1.5 flex items-center gap-2">
          {sub && <p className={`text-xs font-medium ${c.sub}`}>{sub}</p>}
          {trend && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                trend.direction === "down" ? "bg-rose-500/20 text-rose-50" : "bg-emerald-500/20 text-emerald-50"
              }`}
            >
              {trend.direction === "down" ? "▼" : "▲"} {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
