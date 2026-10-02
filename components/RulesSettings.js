"use client";

// Settings → Rules. The deadlines, thresholds and fees the app works to.
// Changing one here changes it everywhere: the task clocks, what counts as
// urgent, the default fees, the dispatch capacity warning.
import { useStore } from "@/lib/store";
import { DEFAULT_RULES, SLA_LABELS } from "@/lib/rules";

function Num({ label, hint, value, onSave, prefix, suffix, min = 0, max, step = 1 }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-navy-500">{prefix}</span>}
        <input
          type="number" min={min} max={max} step={step}
          className="input w-28"
          defaultValue={value}
          key={value}
          onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n !== Number(value)) onSave(n); }}
        />
        {suffix && <span className="text-sm text-navy-500">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] text-navy-400">{hint}</span>}
    </label>
  );
}

export default function RulesSettings() {
  const { rules, saveRules } = useStore();
  return (
    <section>
      <h2 className="mb-3 section-label text-sm">Rules</h2>
      <div className="card space-y-5 p-5">
        <p className="text-xs text-navy-500">The numbers the app works to. A change here applies everywhere straight away, and to task deadlines from the next task created.</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Num label="Always urgent above" prefix="£" value={rules.highValue} onSave={(n) => saveRules({ highValue: n })} hint="A job worth this much is always an urgent task." />
          <Num label="Office opens" value={rules.officeOpens} min={0} max={23} suffix=":00" onSave={(n) => saveRules({ officeOpens: n })} hint="Task clocks only run in office hours (UK time)." />
          <Num label="Office closes" value={rules.officeCloses} min={1} max={24} suffix=":00" onSave={(n) => saveRules({ officeCloses: n })} />
          <Num label="No-access fee" prefix="£" value={rules.noAccessFee} onSave={(n) => saveRules({ noAccessFee: n })} hint="Default when a job is ticked as carrying the condition." />
          <Num label="Remedial margin" suffix="%" value={rules.remedialMargin} onSave={(n) => saveRules({ remedialMargin: n })} hint="Added to the engineer's cost on remedial work." />
          <Num label="Weekly revenue target" prefix="£" value={rules.weeklyTarget} step={50} onSave={(n) => saveRules({ weeklyTarget: n })} hint="Shown on the dashboard. 0 hides it." />
          <Num label="Jobs per engineer per day" value={rules.engineerDailyJobs} min={1} onSave={(n) => saveRules({ engineerDailyJobs: n })} hint="More than this is flagged on dispatch." />
          <Num label="Outreach WhatsApps per day" value={rules.outreachWaCap} min={1} onSave={(n) => saveRules({ outreachWaCap: n })} hint="Per device, before the app asks you to stop." />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500">Time allowed before a task is late (minutes of office time)</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {Object.keys(DEFAULT_RULES.sla).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm text-navy-700">
                <span className="min-w-0 truncate">{SLA_LABELS[k] || k}</span>
                <input
                  type="number" min="5" step="5"
                  className="input h-8 w-24 py-0 text-sm"
                  defaultValue={rules.sla[k]}
                  key={rules.sla[k]}
                  onBlur={(e) => { const n = Number(e.target.value); if (n >= 5 && n !== Number(rules.sla[k])) saveRules({ sla: { [k]: n } }); }}
                />
              </label>
            ))}
          </div>
        </div>

        <button type="button" className="text-xs font-semibold text-navy-500 underline" onClick={() => window.confirm("Put every rule back to its default?") && saveRules({ ...DEFAULT_RULES })}>
          Reset to defaults
        </button>
      </div>
    </section>
  );
}
