"use client";

// Restore from a backup file — add-back only. Reads the weekly backup
// (.json.gz or .json), shows which jobs, clients and engineers are in the
// file but no longer in the system, and puts those back. Anything that
// still exists is left exactly as it is.
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { removeTombstones } from "@/lib/idb-cache";
import { toast } from "@/lib/toast";

const TABLES = [["jobs", "jobs"], ["clients", "clients"], ["engineers", "engineers"]];

async function readBackup(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  if (gz && typeof DecompressionStream === "undefined") throw new Error("This browser can't open .gz files — unzip it first and choose the .json file.");
  const text = gz ? await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text() : await file.text();
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.jobs) || !Array.isArray(d.clients)) throw new Error("That isn't an LCL Ops backup file.");
  return d;
}

export default function RestoreBackup() {
  const { jobs, clients, engineers } = useStore();
  const [backup, setBackup] = useState(null);
  const [busy, setBusy] = useState(false);

  const missing = useMemo(() => {
    if (!backup) return null;
    const current = { jobs, clients, engineers };
    const out = {};
    for (const [key] of TABLES) {
      const have = new Set((current[key] || []).map((r) => r.id));
      out[key] = (backup[key] || []).filter((r) => r && typeof r.id === "string" && r.id && !have.has(r.id));
    }
    return out;
  }, [backup, jobs, clients, engineers]);
  const total = missing ? TABLES.reduce((n, [k]) => n + missing[k].length, 0) : 0;

  const pick = async (file) => {
    if (!file) return;
    try { setBackup(await readBackup(file)); }
    catch (e) { setBackup(null); toast.error(e instanceof SyntaxError ? "That file couldn't be read as a backup." : String(e.message || e)); }
  };

  const restore = async () => {
    if (!total || !window.confirm(`Put back ${total} record${total === 1 ? "" : "s"} from the backup? Nothing that exists now will be changed.`)) return;
    setBusy(true);
    try {
      const { data: s } = (await supabase?.auth.getSession()) || {};
      const headers = { "Content-Type": "application/json", ...(s?.session?.access_token ? { Authorization: `Bearer ${s.session.access_token}` } : {}) };
      let added = 0;
      // Clients first, so a restored job never points at a client that
      // isn't there yet.
      for (const key of ["clients", "engineers", "jobs"]) {
        const rows = missing[key];
        for (let i = 0; i < rows.length; i += 100) {
          const r = await fetch("/api/admin/restore", { method: "POST", headers, body: JSON.stringify({ table: key, rows: rows.slice(i, i + 100) }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error || `Restore failed (${r.status}).`);
          added += (d.added || []).length;
          await removeTombstones(key, d.added || []);
        }
      }
      toast.success(`${added} record${added === 1 ? "" : "s"} put back. Reloading…`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(String(e.message || e));
      setBusy(false);
    }
  };

  const name = (key, r) => (key === "jobs" ? r.id : r.name || r.id);

  return (
    <section>
      <h2 className="mb-3 section-label text-sm">Restore from a backup</h2>
      <div className="card p-5 text-sm">
        <p className="text-xs text-navy-500">Choose a weekly backup file. Only records that are in the file but missing from the system are put back — nothing that exists now is changed or overwritten.</p>
        <label className="btn-outline mt-3 inline-flex cursor-pointer py-1.5 text-xs">
          Choose backup file
          <input type="file" accept=".gz,.json,application/json,application/gzip" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {backup && missing && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-navy-600">Backup taken {backup.exportedAt ? new Date(backup.exportedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "— date unknown"}.</p>
            {total === 0 ? (
              <p className="text-xs font-semibold text-brand-700">Nothing is missing — everything in this backup is still in the system.</p>
            ) : (
              <>
                <ul className="space-y-1 text-xs text-navy-700">
                  {TABLES.filter(([k]) => missing[k].length).map(([k, label]) => (
                    <li key={k}>
                      <strong>{missing[k].length} {label}</strong> missing: {missing[k].slice(0, 6).map((r) => name(k, r)).join(", ")}{missing[k].length > 6 ? ` and ${missing[k].length - 6} more` : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-navy-400">Files that were stored inside old records are not in the backup, so a restored record may show a file as removed.</p>
                <button type="button" className="btn-primary py-1.5 text-xs" disabled={busy} onClick={restore}>{busy ? "Putting back…" : `Put back ${total} record${total === 1 ? "" : "s"}`}</button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
