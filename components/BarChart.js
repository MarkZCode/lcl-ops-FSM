"use client";

import { gbp } from "@/lib/format";

// Simple, dependency-free SVG bar chart for the reports trend.
// `data` = [{ label, count, revenue }]. `metric` = "revenue" | "count".
export default function BarChart({ data = [], metric = "revenue", height = 200 }) {
  if (!data.length) {
    return (
      <div className="grid h-48 place-items-center text-sm text-navy-400">
        No data for this period.
      </div>
    );
  }

  const values = data.map((d) => d[metric] || 0);
  const max = Math.max(...values, 1);
  const barGap = 6;
  const count = data.length;
  const barWidth = count > 14 ? 22 : count > 7 ? 28 : null;
  const chartMinWidth = barWidth ? count * barWidth + (count - 1) * barGap : null;

  return (
    <div className="scroll-area w-full overflow-x-auto">
      <div className="w-full" style={{ minWidth: chartMinWidth || "100%" }}>
      <div
        className="flex items-end gap-[6px]"
        style={{ height }}
      >
        {data.map((d, i) => {
          const v = d[metric] || 0;
          const h = Math.max((v / max) * (height - 28), v > 0 ? 4 : 0);
          return (
            <div
              key={i}
              className={`group relative flex flex-col items-center justify-end ${barWidth ? "shrink-0" : "flex-1"}`}
              style={{ minWidth: barWidth || 0, width: barWidth || undefined }}
            >
              {/* Tooltip */}
              <div className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-soft transition group-hover:opacity-100">
                {metric === "revenue" ? gbp(d.revenue) : `${d.count} jobs`}
              </div>
              <div
                className="w-full rounded-t bg-brand-500 transition-all group-hover:bg-brand-600"
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      {/* Labels */}
      <div className="mt-2 flex gap-[6px]">
        {data.map((d, i) => (
          <div
            key={i}
            className={`truncate text-center text-[10px] text-navy-400 ${barWidth ? "shrink-0" : "flex-1"}`}
            style={{ minWidth: barWidth || 0, width: barWidth || undefined }}
            title={d.label}
          >
            {d.label}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
