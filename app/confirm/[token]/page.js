// Public page an engineer opens from the job offer to confirm they'll take
// it. Shows only what the offer already told them.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LogoMark from "@/components/LogoMark";

export default function ConfirmPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = () =>
    fetch(`/api/confirm/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });

  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const confirm = async (key) => {
    setBusy(key);
    setError("");
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong — please message the office.");
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-navy-50 text-sm text-navy-500">Loading…</div>;
  if (!data) return (
    <div className="grid min-h-screen place-items-center bg-navy-50 p-6 text-center">
      <div>
        <p className="text-lg font-bold text-navy-900">Link not found</p>
        <p className="mt-1 text-sm text-navy-500">This job link is no longer active. Message the office if you think that&rsquo;s wrong.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-50 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-3 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-navy-100 dark:!bg-white">
            <LogoMark className="h-7 w-7" variant="light" />
          </span>
          <div>
            <p className="font-bold text-navy-900">Landlord Compliance London</p>
            <p className="text-xs text-navy-500">Job offer · {data.id}{data.area ? ` · ${data.area}` : ""}</p>
          </div>
        </div>
        {!data.open && <div className="card p-4 text-sm text-navy-600">This job is already closed.</div>}
        {data.scopes.length === 0 && <div className="card p-4 text-sm text-navy-600">Nothing on this job is waiting for a confirmation.</div>}
        {data.scopes.map((s) => (
          <div key={s.key} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{s.engineer}</p>
            <p className="mt-1 text-base font-bold text-navy-900">{s.services}</p>
            <p className="mt-0.5 text-sm text-navy-600">{s.when || "Date to be agreed"}</p>
            {s.confirmed ? (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">Confirmed — thank you. The full job card will follow.</p>
            ) : data.open ? (
              <button type="button" className="btn-primary mt-3 w-full justify-center" disabled={busy === s.key} onClick={() => confirm(s.key)}>
                {busy === s.key ? "Saving…" : "Yes, I can take this job"}
              </button>
            ) : null}
          </div>
        ))}
        {error && <p className="text-center text-sm font-semibold text-rose-600">{error}</p>}
        <p className="pb-8 text-center text-xs text-navy-400">Can&rsquo;t do it? Message the office so it can be reassigned.</p>
      </div>
    </div>
  );
}
