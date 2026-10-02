"use client";

// Every engineer's documents on one timeline, soonest expiry first — the
// view that answers "whose paperwork runs out next?".
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import { engineerDocIssues, docTypeLabel } from "@/lib/engineerDocs";

export default function EngineerPaperwork({ onOpen }) {
  const { engineers } = useStore();
  const rows = useMemo(() => {
    const out = [];
    for (const e of engineers) {
      for (const d of e.documents || []) {
        const days = d.expiresAt ? Math.ceil((new Date(d.expiresAt) - new Date()) / 86400000) : null;
        out.push({ key: `${e.id}-${d.id}`, eng: e, label: docTypeLabel(d.type), expiresAt: d.expiresAt, days, missing: false });
      }
      for (const i of engineerDocIssues(e).filter((x) => x.kind === "missing")) out.push({ key: `${e.id}-missing-${i.type}`, eng: e, label: i.label, expiresAt: null, days: -Infinity, missing: true });
    }
    return out.sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
  }, [engineers]);

  if (!rows.length) return <div className="card p-10 text-center text-sm text-navy-500">No engineer documents on file yet. Add them from each engineer&apos;s details.</div>;
  return (
    <div className="card overflow-hidden">
      <div className="scroll-area overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
            <tr><th className="px-4 py-2.5 font-semibold">Engineer</th><th className="px-4 py-2.5 font-semibold">Document</th><th className="px-4 py-2.5 font-semibold">Expires</th><th className="px-4 py-2.5 font-semibold">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map((r) => {
              const tone = r.missing || (r.days != null && r.days < 0) ? "bg-rose-50 text-rose-700" : r.days != null && r.days <= 30 ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-brand-700";
              const text = r.missing ? "Not on file" : r.days == null ? "No expiry" : r.days < 0 ? `Expired ${Math.abs(r.days)} days ago` : r.days === 0 ? "Expires today" : `${r.days} days left`;
              return (
                <tr key={r.key} className="cursor-pointer hover:bg-navy-50" onClick={() => onOpen?.(r.eng)}>
                  <td className="px-4 py-2.5 font-semibold text-navy-900">{r.eng.name}</td>
                  <td className="px-4 py-2.5 text-navy-700">{r.label}</td>
                  <td className="px-4 py-2.5 text-navy-600">{r.expiresAt ? fmtDate(r.expiresAt) : "—"}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{text}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
