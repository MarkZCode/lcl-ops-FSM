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

  const upload = async (key, file, category = "certificate") => {
    if (!file) return;
    if (file.size > 9 * 1024 * 1024) { setError("That file is too large (max 9 MB)."); return; }
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    await act(key, "upload", { base64, filename: file.name, contentType: file.type, category }, `${file.name} sent to the office.`);
  };
  // Several photos at once — sent one after another.
  const uploadAll = async (key, files, category = "certificate") => {
    const list = [...(files || [])];
    for (const f of list) await upload(key, f, category);
    if (list.length > 1) setNote(`${list.length} files sent to the office.`);
  };

  const [engMsg, setEngMsg] = useState("");
  const [engMsgBusy, setEngMsgBusy] = useState(false);
  const [engMsgError, setEngMsgError] = useState("");

  const sendEngineerMsg = async (key) => {
    if (!engMsg.trim()) return;
    setEngMsgBusy(true);
    setEngMsgError("");
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, action: "message", text: engMsg.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't send message.");
      setData((prev) => ({ ...prev, messages: [...(prev?.messages || []), d.message] }));
      setEngMsg("");
    } catch (e) {
      setEngMsgError(String(e.message || e));
    } finally {
      setEngMsgBusy(false);
    }
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) load(); }, [token]);

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
      setNote("Job declined. The office has been notified and this job is removed from your schedule. Returning to Engineer Portal…");
      setTimeout(() => {
        window.location.href = "/portal";
      }, 1200);
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
        {/* Full Property & Access Card once confirmed */}
        {data.propertyDetails && (
          <div className="card space-y-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-navy-400">Property & Access Details</p>
                <p className="mt-1 text-base font-bold text-navy-900">{data.propertyDetails.address || data.area}</p>
              </div>
              {data.propertyDetails.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.propertyDetails.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:bg-navy-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Directions
                </a>
              )}
            </div>

            {(data.propertyDetails.accessName || data.propertyDetails.accessPhone) && (
              <div className="rounded-lg bg-navy-50 p-3 text-xs">
                <p className="font-semibold text-navy-700">Access Contact:</p>
                <p className="mt-0.5 text-navy-900 font-medium">
                  {data.propertyDetails.accessName || "Site contact"}
                  {data.propertyDetails.accessPhone && (
                    <>
                      {" · "}
                      <a href={`tel:${data.propertyDetails.accessPhone.replace(/[^\d+]/g, "")}`} className="font-bold text-brand-700 underline">
                        {data.propertyDetails.accessPhone}
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}

            {data.propertyDetails.accessNotes && (
              <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 p-3 text-xs text-amber-900">
                <p className="font-semibold">Access / Key Safe Notes:</p>
                <p className="mt-0.5 whitespace-pre-line">{data.propertyDetails.accessNotes}</p>
              </div>
            )}
          </div>
        )}

        {data.scopes.map((s) => (
          <div key={s.key} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{s.engineer}</p>
            <p className="mt-1 text-base font-bold text-navy-900">{s.services}</p>
            <p className="mt-0.5 text-sm text-navy-600">{s.when || "Date to be agreed"}</p>
            {s.confirmed ? (
              <>
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200">{s.finished ? "Finished — thank you." : "Confirmed — thank you. The full job card will follow."}</p>
                <a href="/portal" className="btn-outline mt-2 inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold">
                  View in Engineer Portal →
                </a>
                {/* On the day: restricted until appointment date */}
                {data.open && !s.finished && (
                  <>
                    {!s.isToday && !s.started && (
                      <div className="mt-3 rounded-lg border border-navy-200 bg-navy-50 p-2.5 text-center text-xs text-navy-600">
                        On-the-day buttons (&ldquo;On my way&rdquo;, &ldquo;I&rsquo;ve arrived&rdquo;) activate on the day of the appointment ({s.when}).
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      {!s.started && (
                        <button
                          type="button"
                          className="btn-outline justify-center disabled:opacity-40"
                          disabled={!s.isToday || !!sharing || busy === s.key}
                          onClick={() => share(s.key)}
                          title={!s.isToday ? "Available on appointment date" : ""}
                        >
                          {sharing === s.key ? "Sharing location…" : "On my way"}
                        </button>
                      )}
                      {!s.started && (
                        <select
                          className="input disabled:opacity-40"
                          value=""
                          disabled={!s.isToday || busy === s.key}
                          onChange={(e) => e.target.value && act(s.key, "late", { minutes: Number(e.target.value) }, "The office has been told you're running late.")}
                          aria-label="Running late"
                        >
                          <option value="">Running late…</option>
                          <option value="15">About 15 minutes</option>
                          <option value="30">About 30 minutes</option>
                          <option value="45">About 45 minutes</option>
                          <option value="60">About an hour</option>
                          <option value="90">More than an hour</option>
                        </select>
                      )}
                      {!s.started && (
                        <button
                          type="button"
                          className="btn-primary col-span-2 justify-center disabled:opacity-40"
                          disabled={!s.isToday || busy === s.key}
                          onClick={() => window.confirm("Mark yourself as arrived on site?") && act(s.key, "arrived", {}, "Marked as arrived.")}
                        >
                          I&rsquo;ve arrived
                        </button>
                      )}
                      {s.started && !s.finished && (
                        <button
                          type="button"
                          className="btn-primary col-span-2 justify-center"
                          disabled={busy === s.key}
                          onClick={() => window.confirm("Is the work finished?") && act(s.key, "finished", {}, "Marked as finished — please upload the certificate when it's ready.")}
                        >
                          Work finished
                        </button>
                      )}
                      {sharing === s.key && <p className="col-span-2 text-xs text-navy-500">Your location is shared with the office while this page stays open.</p>}
                    </div>
                  </>
                )}
                {/* Separated Uploads: Certificate (PDF) and Site Evidence (Photos) */}
                {data.canUpload && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="btn-outline flex cursor-pointer items-center justify-center gap-1.5 py-2 text-xs font-semibold">
                      <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Upload Certificate (PDF)</span>
                      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { uploadAll(s.key, e.target.files, "certificate"); e.target.value = ""; }} />
                    </label>

                    <label className="btn-outline flex cursor-pointer items-center justify-center gap-1.5 py-2 text-xs font-semibold">
                      <svg className="h-4 w-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Upload Site Photos</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadAll(s.key, e.target.files, "evidence"); e.target.value = ""; }} />
                    </label>
                  </div>
                )}

                {/* Messaging with Office */}
                <div className="mt-4 border-t border-navy-100 pt-3">
                  <p className="text-xs font-semibold text-navy-800">Messages with the Office</p>
                  {(data.messages || []).length > 0 && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {data.messages.map((m) => {
                        const isMe = m.role === "engineer";
                        return (
                          <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs ${isMe ? "bg-brand-600 text-white rounded-br-sm" : "bg-navy-100 text-navy-800 rounded-bl-sm"}`}>
                              <p className="whitespace-pre-line">{m.text}</p>
                            </div>
                            <span className="text-[10px] text-navy-400 mt-0.5 px-1">{m.sender}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      className="input flex-1 text-xs"
                      placeholder="Message the office…"
                      value={engMsg}
                      onChange={(e) => setEngMsg(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendEngineerMsg(s.key); } }}
                    />
                    <button
                      type="button"
                      className="btn-primary py-1 px-3 text-xs"
                      disabled={engMsgBusy || !engMsg.trim()}
                      onClick={() => sendEngineerMsg(s.key)}
                    >
                      {engMsgBusy ? "…" : "Send"}
                    </button>
                  </div>
                  {engMsgError && <p className="mt-1 text-xs text-rose-600">{engMsgError}</p>}
                </div>
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
        {note && <p className="text-center text-sm font-semibold text-brand-700 dark:text-emerald-300">{note}</p>}
        {error && <p className="text-center text-sm font-semibold text-rose-600">{error}</p>}
        <p className="pb-8 text-center text-xs text-navy-400">
          Problem or question? Call the office on <a href={`tel:${String(invoiceConfig.phone).replace(/[^\d+]/g, "")}`} className="font-semibold text-navy-600">{String(invoiceConfig.phone).replace(/^\+44\s?/, "0")}</a>.
        </p>
      </div>
    </div>
  );
}
