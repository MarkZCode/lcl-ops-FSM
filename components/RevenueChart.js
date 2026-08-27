"use client";

import { useMemo, useRef, useState } from "react";
import { gbp } from "@/lib/format";

// Collected revenue over the last N days, drawn as a thin monochrome
// area chart. Deliberately dependency-free inline SVG: the whole design
// system is flat + near-monochrome, and every charting library ships its
// own opinionated colours, gridlines and tooltips that would fight it.
//
// The line takes the primary text colour and the fill is a fade of the
// same, so it reads as part of the surface rather than as a coloured
// widget sitting on top of one.
export default function RevenueChart({ jobs, days = 30 }) {
  // Index of the day under the cursor, or null. Drives the crosshair, the
  // dot and the readout — a chart you can't interrogate is just a picture.
  const [hover, setHover] = useState(null);
  const plotRef = useRef(null);

  const { points, total, max, startLabel, endLabel, hasData, dayLabels } = useMemo(() => {
    const dayMs = 86_400_000;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const start = new Date(today.getTime() - (days - 1) * dayMs);
    start.setHours(0, 0, 0, 0);

    const buckets = new Array(days).fill(0);
    for (const j of jobs || []) {
      if (j?.status !== "paid") continue;
      const when = j.paidAt || j.completedAt || j.scheduledAt;
      if (!when) continue;
      const t = new Date(when).getTime();
      if (isNaN(t) || t < start.getTime() || t > today.getTime()) continue;
      const idx = Math.floor((t - start.getTime()) / dayMs);
      if (idx >= 0 && idx < days) buckets[idx] += Number(j.price) || 0;
    }

    const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return {
      points: buckets,
      total: buckets.reduce((a, b) => a + b, 0),
      max: Math.max(...buckets, 1),
      startLabel: fmt(start),
      endLabel: fmt(today),
      hasData: buckets.some((v) => v > 0),
      // Pre-computed so the hover readout doesn't build a Date on every
      // mousemove.
      dayLabels: buckets.map((_, i) =>
        new Date(start.getTime() + i * dayMs).toLocaleDateString("en-GB", {
          weekday: "short", day: "numeric", month: "short",
        })
      ),
    };
  }, [jobs, days]);

  // Viewbox units — the SVG scales to whatever width the panel gives it.
  const W = 600;
  const H = 150;
  const PAD_T = 8;
  const usableH = H - PAD_T;

  const coords = points.map((v, i) => {
    const x = points.length === 1 ? W : (i / (points.length - 1)) * W;
    const y = PAD_T + usableH - (v / max) * usableH;
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  // Four evenly-spaced y-axis ticks, rounded to something readable.
  const ticks = [0, 0.5, 1].map((f) => ({ f, value: max * f }));

  // Header stats — a chart that only shows a shape makes you squint to answer
  // "what's the best day / typical day / is it going up". Spell them out.
  const best = points.indexOf(Math.max(...points));
  const earning = points.filter((v) => v > 0);
  const avgEarningDay = earning.length ? total / earning.length : 0;
  const half = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, half).reduce((a, b) => a + b, 0);
  const secondHalf = points.slice(half).reduce((a, b) => a + b, 0);
  const growth = firstHalf > 0
    ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
    : (secondHalf > 0 ? null : 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="min-w-0">
          <span className="panel-title">Collected revenue</span>
          <p className="text-[11px] text-navy-500">Last {days} days</p>
        </div>
        {/* Best day / typical earning day / second-half vs first-half trend —
            the three questions the shape of the line implies but can't
            actually answer on its own. */}
        <div className="flex shrink-0 items-start gap-4 sm:gap-6">
          <HeadStat label="Best day" value={hasData ? gbp(points[best]) : "—"} />
          <HeadStat label="Avg / active day" value={hasData ? gbp(avgEarningDay) : "—"} />
          <HeadStat
            label="Trend"
            value={growth == null ? "new" : `${growth > 0 ? "+" : ""}${growth}%`}
            tone={growth == null ? "up" : growth > 0 ? "up" : growth < 0 ? "down" : undefined}
          />
        </div>
      </div>
      <div className="px-4 pb-3 pt-3.5">
        {/* The headline doubles as the readout: hovering a day swaps the
            period total for that day's figure and names the date, so the
            number you're pointing at is always spelled out. */}
        <div className="metric-figure" style={{ marginTop: 0 }}>
          <span className="metric-value" style={{ fontSize: "1.35rem" }}>
            {gbp(hover != null ? points[hover] : total)}
          </span>
          <span className="delta delta-flat">
            {hover != null ? dayLabels[hover] : `${days}-day total`}
          </span>
        </div>

        <div className="relative mt-3">
          {/* y-axis labels sit outside the plot so the plot stays clean */}
          <div className="pointer-events-none absolute inset-y-0 left-0 flex w-10 flex-col justify-between">
            {[...ticks].reverse().map((t) => (
              <span key={t.f} className="tnum text-[9.5px] leading-none text-navy-500">
                {gbp(Math.round(t.value))}
              </span>
            ))}
          </div>

          <div className="ml-11">
          {/* This wrapper hugs the SVG exactly — the marker dot is positioned
              in % of it, so it must not also contain the date labels below or
              the dot would sit too high. */}
          <div
            className="relative"
            ref={plotRef}
            onPointerMove={(e) => {
              const r = plotRef.current?.getBoundingClientRect();
              if (!r || !r.width) return;
              const frac = (e.clientX - r.left) / r.width;
              const i = Math.round(frac * (points.length - 1));
              setHover(Math.max(0, Math.min(points.length - 1, i)));
            }}
            onPointerLeave={() => setHover(null)}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-[130px] w-full touch-none sm:h-[150px]"
              role="img"
              aria-label={`Collected revenue over the last ${days} days, total ${gbp(total)}`}
            >
              <defs>
                <linearGradient id="lcl-rev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="currentColor" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Horizontal rules — hairline, same token as every border */}
              {ticks.map((t) => (
                <line
                  key={t.f}
                  x1="0" x2={W}
                  y1={PAD_T + usableH - t.f * usableH}
                  y2={PAD_T + usableH - t.f * usableH}
                  stroke="var(--hairline)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {hasData && (
                <>
                  <path d={area} fill="url(#lcl-rev-fill)" className="text-navy-900" />
                  <path
                    d={line}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="text-navy-900"
                  />
                </>
              )}
              {/* Crosshair + marker for the hovered day. Drawn last so it
                  sits above the area fill. The circle uses a non-scaling
                  stroke and a fixed r — preserveAspectRatio="none" stretches
                  the viewBox horizontally, so anything round has to be drawn
                  in screen units or it renders as an ellipse. */}
              {hover != null && hasData && (
                <>
                  <line
                    x1={coords[hover][0]} x2={coords[hover][0]}
                    y1={PAD_T} y2={H}
                    stroke="var(--hairline-strong)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
            {/* The marker dot is HTML, not an SVG <circle>: this chart uses
                preserveAspectRatio="none" so the viewBox stretches
                horizontally, which would squash any circle into an ellipse.
                A positioned div stays round at every width. */}
            {hover != null && hasData && (
              <span
                className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy-900 ring-2"
                style={{
                  left: `${(coords[hover][0] / W) * 100}%`,
                  top: `${(coords[hover][1] / H) * 100}%`,
                  // @ts-ignore — CSS var for the ring colour
                  "--tw-ring-color": "var(--surface-card)",
                }}
              />
            )}
          </div>
            <div className="mt-1.5 flex justify-between text-[9.5px] text-navy-500">
              <span>{startLabel}</span>
              <span>{endLabel}</span>
            </div>
          </div>

          {!hasData && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="text-[11px] text-navy-500">No payments recorded in this period</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A small labelled figure in the panel header. Right-aligned so several sit
// in a tidy row without needing fixed widths.
function HeadStat({ label, value, tone }) {
  return (
    <div className="text-right">
      <p className="text-[10px] leading-none text-navy-500">{label}</p>
      <p className={`tnum mt-1 text-[13px] font-semibold leading-none ${
        tone === "up" ? "delta-up" : tone === "down" ? "delta-down" : "text-navy-900"
      }`}>
        {value}
      </p>
    </div>
  );
}
