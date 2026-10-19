// Public page an engineer opens from the job offer to confirm they'll take
// it. Shows only what the offer already told them.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { invoiceConfig } from "@/lib/invoiceConfig";
import LogoMark from "@/components/LogoMark";

export default function ConfirmPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState({});
  const [sharing, setSharing] = useState("");
  const [note, setNote] = useState("");

  // One call for every on-the-day action.
  const act = async (key, action, extra = {}, okNote = "") => {
    setBusy(key);
    setError("");
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong — please message the office.");
      if (okNote) setNote(okNote);
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  };

  // "On my way": tells the office and the client straight away, then (if
  // the phone allows) shares where it is for as long as the page is open.
  const share = async (key) => {
    setError("");
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, action: "on_way" }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || "Couldn't send that — please message the office."); return; }
      setNote("The office and the client know you're on the way.");
    } catch { setError("No connection — please message the office."); return; }
    if (!navigator.geolocation) return;
    setSharing(key);
    let last = 0;
    navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - last < 45_000) return;
        last = Date.now();
        fetch(`/api/confirm/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, action: "location", lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => { setSharing(""); setNote("The office and the client know you're on the way. (Your location isn't being shared — that's fine.)"); },
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );
  };

  const upload = async (key, file) => {
    if (!file) return;
    if (file.size > 9 * 1024 * 1024) { setError("That file is too large (max 9 MB)."); return; }
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    await act(key, "upload", { base64, filename: file.name, contentType: file.type }, `${file.name} sent to the office.`);
  };
  // Several photos at once — sent one after another.
  const uploadAll = async (key, files) => {
    const list = [...(files || [])];
    for (const f of list) await upload(key, f);
    if (list.length > 1) setNote(`${list.length} files sent to the office.`);
  };

  // A dropped signal is not a dead link — say which it is.
  const [loadFailed, setLoadFailed] = useState(false);
  const load = () =>
    fetch(`/api/confirm/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) { setData(null); setLoadFailed(false); setLoading(false); return; }
        if (!r.ok) throw new Error("load");
        setData(await r.json()); setLoadFailed(false); setLoading(false);
      })
      .catch(() => { setLoadFailed(true); setLoading(false); });

  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const decline = async (key, confirmed) => {
    const ok = window.confirm(
      confirmed
        ? "You've already confirmed this job. Are you sure you can't do it now? The office will be notified."
        : "Are you sure you can't take this job? The office will be notified so another engineer can be found."
    );
    if (!ok) return;
    setBusy(key);
    setError("");
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action: "decline", reason: "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong — please message the office.");
      setDone((x) => ({ ...x, [key]: true }));
      await load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
    }
  };

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
  if (!data && loadFailed) return (
    <div className="grid min-h-screen place-items-center bg-navy-50 p-6 text-center">
      <div>
        <p className="text-lg font-bold text-navy-900">No connection</p>
        <p className="mt-1 text-sm text-navy-500">Couldn&rsquo;t load this job. Check your signal and try again.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => { setLoading(true); load(); }}>Try again</button>
      </div>
    </div>
  );
  if (!data) return (
    <div className="grid min-h-screen place-items-center bg-navy-50 p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-lg font-bold text-navy-900">Link not found</p>
        <p className="text-sm text-navy-500">This job link is no longer active. Message the office if you think that&rsquo;s wrong.</p>
        <div className="pt-2">
          <a href="/portal" className="btn-primary inline-flex items-center justify-center gap-2 py-2 px-4 text-xs">
            Return to Engineer Portal →
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-50 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-navy-100 dark:!bg-white">
              <LogoMark className="h-7 w-7" variant="light" />
            </span>
            <div>
              <p className="font-bold text-navy-900">Landlord Compliance London</p>
              <p className="text-xs text-navy-500">{(data.scopes || []).some((x) => x.confirmed) ? "Your job" : "Job offer"} · {data.id}{data.area ? ` · ${data.area}` : ""}</p>
            </div>
          </div>
          <a href="/portal" className="flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition hover:border-navy-300 hover:bg-navy-50">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Engineer Portal
          </a>
        </div>
        {!data.open && <div className="card p-4 text-sm text-navy-600">{data.canUpload ? "This job is finished. If you haven\u2019t sent the certificate yet, upload it below." : "This job was cancelled."}</div>}
        {data.scopes.length === 0 && (
          <div className="card space-y-4 p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-700">
              <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-navy-900">
                {Object.keys(done).length ? "Job offer declined" : "Nothing waiting for confirmation"}
              </p>
              <p className="mt-1 text-sm text-navy-600">
                {Object.keys(done).length
                  ? "Thanks for letting us know. The office has been notified and this job has been removed from your list."
                  : "This job is not currently waiting for your confirmation."}
              </p>
            </div>
            <div className="pt-2">
              <a href="/portal" className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5 text-sm sm:w-auto sm:px-6">
                Back to Engineer Portal →
              </a>
            </div>
          </div>
        )}
        {data.scopes.map((s) => (
          <div key={s.key} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{s.engineer}</p>
            <p className="mt-1 text-base font-bold text-navy-900">{s.services}</p>
            <p className="mt-0.5 text-sm text-navy-600">{s.when || "Date to be agreed"}</p>
            {s.confirmed ? (
              <>
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">{s.finished ? "Finished — thank you." : "Confirmed — thank you. The full job card will follow."}</p>
                <a href="/portal" className="btn-outline mt-2 inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold">
                  View in Engineer Portal →
                </a>
                {/* On the day: tell the office where things are without a call. */}
                {data.open && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {!s.started && (
                      <button type="button" className="btn-outline justify-center" disabled={!!sharing} onClick={() => share(s.key)}>
                        {sharing === s.key ? "Sharing location…" : "On my way"}
                      </button>
                    )}
                    {!s.started && (
                      <select className="input" value="" disabled={busy === s.key} onChange={(e) => e.target.value && act(s.key, "late", { minutes: Number(e.target.value) }, "The office has been told you're running late.")} aria-label="Running late">
                        <option value="">Running late…</option>
                        <option value="15">About 15 minutes</option>
                        <option value="30">About 30 minutes</option>
                        <option value="45">About 45 minutes</option>
                        <option value="60">About an hour</option>
                        <option value="90">More than an hour</option>
                      </select>
                    )}
                    {!s.started && (
                      <button type="button" className="btn-primary col-span-2 justify-center" disabled={busy === s.key} onClick={() => window.confirm("Mark yourself as arrived on site?") && act(s.key, "arrived", {}, "Marked as arrived.")}>I&rsquo;ve arrived</button>
                    )}
                    {s.started && !s.finished && (
                      <button type="button" className="btn-primary col-span-2 justify-center" disabled={busy === s.key} onClick={() => window.confirm("Is the work finished?") && act(s.key, "finished", {}, "Marked as finished — please upload the certificate when it's ready.")}>Work finished</button>
                    )}
                    {sharing === s.key && <p className="col-span-2 text-xs text-navy-500">Your location is shared with the office while this page stays open.</p>}
                  </div>
                )}
                {/* The certificate usually follows after leaving site — upload
                    stays open once the work is finished (not on a cancelled job). */}
                {data.canUpload && (
                  <label className="btn-outline mt-2 w-full cursor-pointer justify-center text-sm">
                    {busy === s.key ? "Sending…" : s.finished ? "Upload the certificate" : "Upload certificate or photo"}
                    <input type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { uploadAll(s.key, e.target.files); e.target.value = ""; }} />
                  </label>
                )}
                {data.open && <button type="button" className="mt-2 text-xs font-semibold text-navy-500 underline" disabled={busy === s.key} onClick={() => decline(s.key, true)}>I can no longer do this job</button>}
              </>
            ) : data.open ? (
              <>
                <button type="button" className="btn-primary mt-3 w-full justify-center" disabled={busy === s.key} onClick={() => confirm(s.key)}>
                  {busy === s.key ? "Saving…" : "Yes, I can take this job"}
                </button>
                <button type="button" className="btn-outline mt-2 w-full justify-center" disabled={busy === s.key} onClick={() => decline(s.key, false)}>I can&rsquo;t take this one</button>
              </>
            ) : null}
          </div>
        ))}
        {note && <p className="text-center text-sm font-semibold text-brand-700">{note}</p>}
        {error && <p className="text-center text-sm font-semibold text-rose-600">{error}</p>}
        <p className="pb-8 text-center text-xs text-navy-400">
          Problem or question? Call the office on <a href={`tel:${String(invoiceConfig.phone).replace(/[^\d+]/g, "")}`} className="font-semibold text-navy-600">{String(invoiceConfig.phone).replace(/^\+44\s?/, "0")}</a>.
        </p>
      </div>
    </div>
  );
}
