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
    const reason = window.prompt(confirmed ? "You've already confirmed this job. Why can't you do it now?" : "Not able to take it? Add a short reason (optional).");
    if (reason === null) return;
    setBusy(key);
    setError("");
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action: "decline", reason }),
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
            <p className="text-xs text-navy-500">{(data.scopes || []).some((x) => x.confirmed) ? "Your job" : "Job offer"} · {data.id}{data.area ? ` · ${data.area}` : ""}</p>
          </div>
        </div>
        {!data.open && <div className="card p-4 text-sm text-navy-600">{data.canUpload ? "This job is finished. If you haven\u2019t sent the certificate yet, upload it below." : "This job was cancelled."}</div>}
        {data.scopes.length === 0 && <div className="card p-4 text-sm text-navy-600">{Object.keys(done).length ? "Thanks for letting us know — the office has been told." : "Nothing on this job is waiting for a confirmation."}</div>}
        {data.scopes.map((s) => (
          <div key={s.key} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{s.engineer}</p>
            <p className="mt-1 text-base font-bold text-navy-900">{s.services}</p>
            <p className="mt-0.5 text-sm text-navy-600">{s.when || "Date to be agreed"}</p>
            {s.confirmed ? (
              <>
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">{s.finished ? "Finished — thank you." : "Confirmed — thank you. The full job card will follow."}</p>
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
