// Public, no-login-required job status page. Accessible via a unique token
// stored on the job (`job.shareToken`). Shows safe info only — no bank details,
// no client phone, no internal notes.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { gbp, fmtDate, serviceName } from "@/lib/format";
import { statusMeta } from "@/lib/constants";
import LogoMark from "@/components/LogoMark";
import { invoiceConfig } from "@/lib/invoiceConfig";

const STATUS_STEPS = ["quote", "scheduled", "in_progress", "completed", "invoiced", "paid"];
// What the visit involves, in a sentence or two — so the client knows what
// to expect and what to have ready.
const WHAT_HAPPENS = {
  GAS: "The engineer tests each gas appliance, the flue and the pipework, and checks ventilation and the carbon monoxide alarm. Allow 30–45 minutes for one or two appliances. Please make sure the gas is on and the appliances can be reached.",
  GAS_COM: "The engineer tests each commercial gas appliance, its flue, ventilation and safety devices. Please make sure the appliances can be reached and the gas is on.",
  BOILER: "The engineer opens, cleans and checks the boiler and tests how it is burning. Allow about an hour. Please make sure the boiler can be reached.",
  EICR: "The electrician inspects and tests the fixed wiring, sockets, lights and the fuse box. The power is switched off for parts of the visit. Allow 2–4 hours depending on the size of the property.",
  EICR_COM: "The electrician inspects and tests the fixed wiring and each distribution board. The power is switched off circuit by circuit, so please plan around short interruptions.",
  EPC: "The assessor measures the property and records the heating, insulation, windows and lighting. Allow 30–60 minutes. Access to every room, the loft and the boiler helps.",
  EPC_COM: "The assessor surveys the building, its heating, cooling, lighting and construction. Plans and any service records are helpful.",
  PAT: "Each portable appliance is checked and tested, then labelled. Please have the appliances plugged in or to hand.",
  PAT_COM: "Each portable appliance is checked and tested, then labelled. Please have the appliances to hand and staff aware of short interruptions.",
  FRA: "The assessor walks through the property and the shared areas, looking at escape routes, fire doors, alarms and anything that could start or spread a fire. Allow 45–90 minutes.",
  FRA_COM: "The assessor walks through the premises and shared areas, looking at escape routes, fire doors, alarms, signage and how the building is used. Allow 1–2 hours.",
  FSC: "The engineer tests the smoke and heat alarms and checks they are in the right places and in date.",
  FSC_COM: "The engineer tests the alarms and detection and checks they are in the right places and working.",
  EMLIGHT: "The engineer tests each emergency light on its battery and checks it covers the escape routes.",
  EMLIGHT_COM: "The engineer tests each emergency light on its battery and checks it covers the escape routes.",
  ASBESTOS: "The surveyor inspects the agreed areas and takes small samples of any suspect material for the laboratory.",
};

const STATUS_LABELS = { quote: "Quote", scheduled: "Booked", in_progress: "In progress", completed: "Done", invoiced: "Invoice sent", paid: "Paid" };

export default function SharePage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [details, setDetails] = useState({ address: "", certName: "", accessName: "", accessPhone: "", date: "", slot: "", intake: {} });
  const setAnswer = (field, value) => setDetails((d) => ({ ...d, intake: { ...d.intake, [field]: value } }));
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const sendDetails = async () => {
    setDetailsBusy(true);
    setDetailsError("");
    try {
      const r = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "details", ...details }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong — please call us.");
      setJob((j) => ({ ...j, needs: [], questions: [], detailsSentAt: d.detailsSentAt }));
    } catch (e) {
      setDetailsError(String(e.message || e));
    } finally {
      setDetailsBusy(false);
    }
  };

  const requestMove = async () => {
    setMoveBusy(true);
    setMoveError("");
    try {
      const r = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule", date: moveDate, note: moveNote }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong — please call us.");
      setJob((j) => ({ ...j, changeRequestedAt: d.changeRequestedAt }));
      setMoveOpen(false);
    } catch (e) {
      setMoveError(String(e.message || e));
    } finally {
      setMoveBusy(false);
    }
  };

  const accept = async () => {
    setAccepting(true);
    setAcceptError("");
    try {
      const r = await fetch(`/api/share/${encodeURIComponent(token)}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Something went wrong — please call us.");
      setJob((j) => ({ ...j, acceptedAt: d.acceptedAt, canAccept: false }));
      // Fetch again so the page can ask for whatever is still needed to book.
      fetch(`/api/share/${encodeURIComponent(token)}`).then((x) => (x.ok ? x.json() : null)).then((x) => x && setJob(x)).catch(() => {});
    } catch (e) {
      setAcceptError(String(e.message || e));
    } finally {
      setAccepting(false);
    }
  };

  // Fetched through a server route that returns ONLY the fields below. The
  // browser used to query Supabase directly with the anon key, which both
  // forced the jobs table to stay world-readable and shipped the entire job
  // — engineer pay, margin, access phone, internal notes — to a public page.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setJob(d || null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setJob(null); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return (
    <div className="grid min-h-screen place-items-center bg-navy-900 text-navy-300 text-sm">Loading…</div>
  );

  if (!job) return (
    <div className="grid min-h-screen place-items-center bg-navy-50">
      <div className="text-center">
        <p className="text-lg font-bold text-navy-900">Link not found</p>
        <p className="mt-1 text-sm text-navy-500">This link may have expired or been removed.</p>
      </div>
    </div>
  );

  const meta = statusMeta(job.status);
  const currentStep = STATUS_STEPS.indexOf(job.status);
  const lines = job.lines || [];

  return (
    <div className="min-h-screen bg-navy-50 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-navy-100 dark:!bg-white">
            <LogoMark className="h-7 w-7" variant="light" />
          </span>
          <div>
            <p className="font-bold text-navy-900">Landlord Compliance London</p>
            <p className="text-xs text-navy-500">07426 409342</p>
          </div>
        </div>

        {/* Status */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-navy-900">{job.id}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.color}`}>{meta.label}</span>
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 flex-col items-center gap-1">
                <div className={`h-2 w-full rounded-full ${i <= currentStep ? "bg-brand-500" : "bg-navy-100"}`} />
                <span className="text-[8px] leading-tight text-navy-400 sm:text-[9px]">{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Services */}
        <div className="card p-5">
          <h2 className="mb-3 section-label text-sm">Services</h2>
          <ul className="divide-y divide-navy-100">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-navy-800">{l.name}</span>
                <span className="font-semibold text-navy-900">{gbp(l.total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-navy-100 pt-2">
            <span className="text-sm text-navy-500">Total</span>
            <span className="text-base font-bold text-navy-900">{gbp(job.price)}</span>
          </div>
        </div>

        {/* Accept the quote */}
        {job.canAccept && (
          <div className="card p-5">
            <p className="text-sm text-navy-700">Happy with this quote? Accept it here and we&rsquo;ll be in touch to agree a date.</p>
            <button type="button" className="btn-primary mt-3 w-full justify-center" onClick={accept} disabled={accepting}>
              {accepting ? "Recording…" : "Accept quote"}
            </button>
            {acceptError && <p className="mt-2 text-xs font-semibold text-rose-600">{acceptError}</p>}
          </div>
        )}
        {job.status === "quote" && job.acceptedAt && (
          <div className="card border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            <strong>Quote accepted</strong> on {fmtDate(job.acceptedAt)}. {job.detailsSentAt ? "Thank you — we have your details and are arranging your appointment with the engineer. We\u2019ll confirm the date and time shortly." : "We\u2019re arranging your appointment and will confirm the date and time shortly."}
          </div>
        )}

        {/* The few things we need to book it — only what's still missing. */}
        {((job.needs || []).length > 0 || (job.questions || []).length > 0) && (
          <div className="card space-y-3 p-5 text-sm">
            <p className="font-semibold text-navy-900">To book your appointment, please tell us:</p>
            {(job.needs || []).includes("address") && (
              <div><label className="label">Full property address</label><input className="input" value={details.address} onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))} placeholder={job.postcode ? `Flat / house number and street, ${job.postcode}` : ""} /></div>
            )}
            {(job.needs || []).includes("certName") && (
              <div><label className="label">Name to go on the certificate</label><input className="input" value={details.certName} onChange={(e) => setDetails((d) => ({ ...d, certName: e.target.value }))} /></div>
            )}
            {(job.needs || []).includes("access") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="label">Who will let the engineer in?</label><input className="input" value={details.accessName} onChange={(e) => setDetails((d) => ({ ...d, accessName: e.target.value }))} placeholder="Tenant or contact name" /></div>
                <div><label className="label">Their phone number</label><input className="input" inputMode="tel" value={details.accessPhone} onChange={(e) => setDetails((d) => ({ ...d, accessPhone: e.target.value }))} /></div>
              </div>
            )}
            {(job.needs || []).includes("date") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="label">Preferred date</label><input type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={details.date} onChange={(e) => setDetails((d) => ({ ...d, date: e.target.value }))} /></div>
                <div><label className="label">Morning or afternoon</label>
                  <select className="input" value={details.slot} onChange={(e) => setDetails((d) => ({ ...d, slot: e.target.value }))}>
                    <option value="">Either</option><option value="Morning">Morning (8am–1pm)</option><option value="Afternoon">Afternoon (1pm–6pm)</option>
                  </select>
                </div>
              </div>
            )}
            {/* What the engineer needs to know about the property. */}
            {(job.questions || []).map((q) => (
              <div key={q.field}>
                <label className="label">{q.title}</label>
                {q.input === "number" && <input type="number" min="0" inputMode="numeric" className="input" value={details.intake[q.field] ?? ""} onChange={(e) => setAnswer(q.field, e.target.value)} />}
                {q.input === "text" && <input className="input" value={details.intake[q.field] || ""} onChange={(e) => setAnswer(q.field, e.target.value)} />}
                {q.input === "yesno" && (
                  <div className="flex gap-2">
                    {["Yes", "No"].map((v) => (
                      <button key={v} type="button" onClick={() => setAnswer(q.field, v)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${details.intake[q.field] === v ? "border-brand-400 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600"}`}>{v}</button>
                    ))}
                  </div>
                )}
                {q.input === "chips" && (
                  <div className="flex flex-wrap gap-2">
                    {(q.options || []).map((o) => {
                      const on = (details.intake[q.field] || []).includes(o);
                      return <button key={o} type="button" onClick={() => setAnswer(q.field, on ? details.intake[q.field].filter((x) => x !== o) : [...(details.intake[q.field] || []), o])} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-navy-200 text-navy-600"}`}>{o}</button>;
                    })}
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="btn-primary w-full justify-center" disabled={detailsBusy} onClick={sendDetails}>{detailsBusy ? "Sending…" : "Send these details"}</button>
            <p className="text-xs text-navy-500">Your appointment is confirmed once the engineer has agreed the date — we&rsquo;ll let you know.</p>
            {detailsError && <p className="text-xs font-semibold text-rose-600">{detailsError}</p>}
          </div>
        )}

        {/* On the day */}
        {(job.onTheWay || job.runningLate) && (
          <div className="card border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            {job.runningLate ? <>Your engineer is running about <strong>{job.runningLate} minutes</strong> late. Sorry for the wait.</> : <><strong>Your engineer is on the way.</strong> Please make sure someone is there to let them in.</>}
          </div>
        )}

        {/* Their certificate, once it has been issued */}
        {(job.certificates || []).length > 0 && (
          <div className="card p-5 text-sm">
            <h2 className="mb-2 section-label text-sm">Your certificate</h2>
            <ul className="space-y-1.5">
              {job.certificates.map((c) => (
                <li key={c.url}><a href={c.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">{c.name}</a></li>
              ))}
            </ul>
          </div>
        )}

        {/* What to expect at the visit */}
        {["quote", "scheduled"].includes(job.status) && lines.some((l) => WHAT_HAPPENS[l.code]) && (
          <details className="card p-5 text-sm">
            <summary className="cursor-pointer font-semibold text-navy-900">What happens at the visit</summary>
            <ul className="mt-3 space-y-2 text-navy-700">
              {lines.filter((l) => WHAT_HAPPENS[l.code]).map((l) => (
                <li key={l.code}><strong className="text-navy-900">{l.name}.</strong> {WHAT_HAPPENS[l.code]}</li>
              ))}
            </ul>
          </details>
        )}

        {/* Appointment + ask to move it */}
        {job.scheduledAt && ["scheduled", "in_progress"].includes(job.status) && (
          <div className="card p-5 text-sm">
            <p className="text-navy-500">Your appointment</p>
            <p className="mt-0.5 text-base font-bold text-navy-900">
              {new Date(job.scheduledAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}
            </p>
            {job.changeRequestedAt ? (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-brand-800">We&rsquo;ve got your request to move it and will be in touch to confirm a new time.</p>
            ) : job.canRequestChange && !moveOpen ? (
              <button type="button" className="btn-outline mt-3" onClick={() => setMoveOpen(true)}>Need a different date?</button>
            ) : job.canRequestChange ? (
              <div className="mt-3 space-y-2">
                <input type="date" className="input" value={moveDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setMoveDate(e.target.value)} aria-label="Preferred date" />
                <textarea className="input resize-none" rows={2} placeholder="Anything we should know (optional)" value={moveNote} onChange={(e) => setMoveNote(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={!moveDate || moveBusy} onClick={requestMove}>{moveBusy ? "Sending…" : "Send request"}</button>
                  <button type="button" className="btn-outline" onClick={() => setMoveOpen(false)}>Cancel</button>
                </div>
                {moveError && <p className="text-xs font-semibold text-rose-600">{moveError}</p>}
              </div>
            ) : null}
          </div>
        )}

        {/* Cert expiry */}
        {job.certExpiry && (
          <div className="card p-4 text-sm">
            <p className="text-navy-500">Certificate expiry: <span className="font-semibold text-navy-900">{fmtDate(job.certExpiry)}</span></p>
          </div>
        )}

        {/* Footer */}
        <p className="pb-8 text-center text-xs text-navy-400">
          Questions? Call us on <a href="tel:07426409342" className="font-semibold text-navy-600">07426 409342</a> or email{" "}
          {/* Same company address the quotes and invoices carry — a client
              looking at their certificate shouldn't be handed a gmail. */}
          <a href={`mailto:${job?.companyEmail || invoiceConfig.email}`} className="font-semibold text-navy-600">{job?.companyEmail || invoiceConfig.email}</a>
        </p>
      </div>
    </div>
  );
}
