"use client";

// Two read-only views for Settings: what each role can do, and who changed
// which setting.
import { useStore } from "@/lib/store";
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/auth";

const ROLES = [["admin", "Administrator"], ["agent", "Agent"], ["engineer", "Engineer"]];

export function RolesGrid() {
  const keys = Object.keys(PERMISSION_LABELS || {});
  if (!keys.length) return null;
  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-semibold text-navy-800">What each role can do</summary>
      <p className="mt-1 text-xs text-navy-500">The starting point for each role. A person&apos;s own access can be widened or narrowed with the Access button beside their name.</p>
      <div className="scroll-area mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-navy-400">
            <tr><th className="py-1.5 font-semibold">Area</th>{ROLES.map(([k, l]) => <th key={k} className="py-1.5 text-center font-semibold">{l}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {keys.map((k) => (
              <tr key={k}>
                <td className="py-1.5 text-navy-800" title={PERMISSION_LABELS[k].desc}>{PERMISSION_LABELS[k].label}</td>
                {ROLES.map(([r]) => <td key={r} className={`py-1.5 text-center ${PERMISSIONS?.[r]?.[k] ? "font-bold text-brand-600" : "text-navy-300"}`}>{PERMISSIONS?.[r]?.[k] ? "Yes" : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function SettingsLog() {
  const { settingsLog } = useStore();
  const log = settingsLog || [];
  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-semibold text-navy-800">Settings changes ({log.length})</summary>
      {log.length === 0 ? (
        <p className="mt-2 text-xs text-navy-400">No changes recorded yet. Changes to rules, bank accounts and auto-notifications are listed here from now on.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-xs">
          {log.slice(0, 60).map((e, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-navy-100 pb-1.5 last:border-0">
              <span className="text-navy-800">{e.what}</span>
              <span className="text-navy-400">{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{e.by ? ` · ${e.by}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
