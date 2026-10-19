// Public, no-login-required job status page. Accessible via a unique token
// stored on the job (`job.shareToken`). Shows safe info only — no bank details,
// no client phone, no internal notes.
"use client";

import AddressInput from "@/components/AddressInput";
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

const STATUS_LABELS = { quote: "Quote", scheduled: "Booked", in_progress: "In progress", completed: "Done", invoiced: "Invoice sent", paid: "Paid", cancelled: "Cancelled" };
const ukToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
// "+44 7426 409342" → "07426 409342" for display; digits only for tel:.
const phoneShow = (p) => String(p || "").replace(/^\+44\s?/, "0");
const phoneTel = (p) => String(p || "").replace(/[^\d+]/g, "");

export default function SharePage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // network, not a bad link
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDate, setMoveDate] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState(false);

  const markPaid = async () => {
    setPaying(true);
    setPayError("");
    try {
      const r = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not record payment — please call us.");
      setPaySuccess(true);
      setJob((j) => ({ ...j, status: "paid", invoice: { ...(j?.invoice || {}), status: "paid", paidAt: d.paidAt } }));
    } catch (e) {
      setPayError(String(e.message || e));
    } finally {
      setPaying(false);
    }
  };

  const [clientMsg, setClientMsg] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgError, setMsgError] = useState("");

  const sendClientMsg = async () => {
    if (!clientMsg.trim()) return;
    setMsgBusy(true);
    setMsgError("");
    try {
      const r = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", text: clientMsg.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't send message.");
      setJob((j) => ({ ...j, messages: [...(j?.messages || []), d.message] }));
      setClientMsg("");
    } catch (e) {
      setMsgError(String(e.message || e));
    } finally {
      setMsgBusy(false);
    }
  };
  const [details, setDetails] = useState({ address: "", certName: "", accessName: "", accessPhone: "", date: "", slot: "", intake: {} });
  const setAnswer = (field, value) => setDetails((d) => ({ ...d, intake: { ...d.intake, [field]: value } }));
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  // Everything the booking needs must be filled in before it can be sent —
  // a half-filled form used to close itself, leaving the office to chase.
  const detailsMissing = (j) => {
    const n = j?.needs || [];
    const out = [];
    if (n.includes("address") && !details.address.trim()) out.push("the property address");
    if (n.includes("certName") && !details.certName.trim()) out.push("the name for the certificate");
    if (n.includes("access") && (!details.accessName.trim() || !details.accessPhone.trim())) out.push("who will let the engineer in and their number");
    if (n.includes("date") && !details.date) out.push("a preferred date");
    return out;
  };
  const sendDetails = async () => {
    const miss = detailsMissing(job);
    if (miss.length) { setDetailsError(`Please add ${miss.join(", ")}.`); return; }
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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    fetch(`/api/share/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) { setJob(null); setLoading(false); return; }
        if (!r.ok) throw new Error("load");
        setJob(await r.json());
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setJob(null); setLoadFailed(true); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [token, attempt]);

  if (loading) return (
    <div className="grid min-h-screen place-items-center bg-navy-50 text-sm text-navy-400">Loading your booking…</div>
  );

  if (!job && loadFailed) return (
    <div className="grid min-h-screen place-items-center bg-navy-50 p-6">
      <div className="text-center">
        <p className="text-lg font-bold text-navy-900">Couldn&rsquo;t load this page</p>
        <p className="mt-1 text-sm text-navy-500">Please check your internet connection and try again.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </div>
    </div>
  );

  if (!job) return (
    <div className="grid min-h-screen place-items-center bg-navy-50">
      <div className="text-center">
        <p className="text-lg font-bold text-navy-900">Link not found</p>
        <p className="mt-1 text-sm text-navy-500">This link may have expired or been removed. Please call us on {phoneShow(invoiceConfig.phone)}.</p>
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
            <a href={`tel:${phoneTel(job.companyPhone || invoiceConfig.phone)}`} className="text-xs text-navy-500">{phoneShow(job.companyPhone || invoiceConfig.phone)}</a>
          </div>
        </div>

        {/* Status */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-navy-900">{job.id}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.color}`}>{STATUS_LABELS[job.status] || meta.label}</span>
          </div>
          {/* Progress bar */}
          {job.status !== "cancelled" && <div className="flex items-center gap-1">
            {STATUS_STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 flex-col items-center gap-1">
                <div className={`h-2 w-full rounded-full ${i <= currentStep ? "bg-brand-500" : "bg-navy-100"}`} />
                <span className={`text-center text-[10px] leading-tight ${i === currentStep ? "font-semibold text-navy-700" : "text-navy-400"}`}>{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>}
        </div>

        {/* Services */}
        <div className="card p-5">
          <h2 className="mb-3 section-label text-sm">Services</h2>
          <ul className="divide-y divide-navy-100">
            {lines.map((l, i) => (
              <li key={l.id || i} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 text-navy-800">
                  {l.name}
                  {(l.tier || l.qty > 1) && <span className="block text-xs text-navy-500">{[l.tier, !l.tier && l.qty > 1 ? `× ${l.qty}` : ""].filter(Boolean).join(" · ")}</span>}
                </span>
                <span className="shrink-0 font-semibold text-navy-900">{gbp(l.total)}</span>
              </li>
            ))}
            {job.discount > 0 && (
              <li className="flex items-center justify-between py-2 text-sm">
                <span className="text-navy-800">Discount</span>
                <span className="font-semibold text-brand-700">−{gbp(job.discount)}</span>
              </li>
            )}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-navy-100 pt-2">
            <span className="text-sm text-navy-500">Total</span>
            <span className="text-base font-bold text-navy-900">{gbp(job.price)}</span>
          </div>
        </div>

        {/* Accept the quote (1-tap immediate) */}
        {job.canAccept && (
          <div className="card p-5">
            <p className="text-sm text-navy-700">Happy with this quote? Accept it here and we&rsquo;ll be in touch to agree a date.</p>
            <button
              type="button"
              className="btn-primary mt-3 w-full justify-center py-2.5 text-sm font-semibold"
              onClick={accept}
              disabled={accepting}
            >
              {accepting ? "Accepting quote…" : "Accept quote"}
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
              <div><label className="label">Full property address</label><AddressInput value={details.address} postcode={job.postcode || ""} onChange={(v) => setDetails((d) => ({ ...d, address: v }))} placeholder={job.postcode ? `Flat / house number and street, ${job.postcode}` : "Flat / house number and street"} /></div>
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
                <div><label className="label">Preferred date</label><input type="date" className="input" min={ukToday()} value={details.date} onChange={(e) => setDetails((d) => ({ ...d, date: e.target.value }))} /></div>
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
        {(job.onTheWay || job.runningLate || job.arrived || job.status === "completed") && (
          <div className="card border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            {job.arrived ? (
              <p><strong>Your engineer is on site</strong> carrying out the inspection.</p>
            ) : job.status === "completed" ? (
              <p><strong>Inspection completed.</strong> Your certificate and report are being prepared by the office.</p>
            ) : job.runningLate ? (
              <p>Your engineer is running about <strong>{job.runningLate} minutes</strong> late. Sorry for the wait.</p>
            ) : (
              <p><strong>Your engineer is on the way.</strong> Please make sure someone is there to let them in.</p>
            )}
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
            {job.window && <p className="text-sm text-navy-700">Arrival: {job.window}</p>}
            {job.changeRequestedAt ? (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-brand-800">We&rsquo;ve got your request to move it and will be in touch to confirm a new time.</p>
            ) : job.canRequestChange && !moveOpen ? (
              <button type="button" className="btn-outline mt-3" onClick={() => setMoveOpen(true)}>Need a different date?</button>
            ) : job.canRequestChange ? (
              <div className="mt-3 space-y-2">
                <input type="date" className="input" value={moveDate} min={ukToday()} onChange={(e) => setMoveDate(e.target.value)} aria-label="Preferred date" />
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

        {/* Invoice and Payment */}
        {(job.invoice || ["invoiced", "completed", "paid"].includes(job.status)) && (
          <div className="card space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="section-label text-sm">Invoice &amp; Payment</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${job.status === "paid" || paySuccess ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {job.status === "paid" || paySuccess ? "Paid" : "Payment Due"}
              </span>
            </div>

            <div className="space-y-2 rounded-xl border border-navy-100 bg-navy-50/70 p-3.5 text-xs">
              <div className="flex items-center justify-between border-b border-navy-200/60 pb-2 text-sm font-bold text-navy-900">
                <span>Total Amount:</span>
                <span>{gbp(job.invoice?.total ?? job.price)}</span>
              </div>
              <p className="font-semibold text-navy-700">Bank Transfer Details:</p>
              <div className="grid grid-cols-2 gap-2 text-navy-600">
                <div><span className="text-navy-400">Bank:</span> {job.invoice?.bank?.name || "Barclays"}</div>
                <div><span className="text-navy-400">Account:</span> {job.invoice?.bank?.accountName || "Landlord Compliance London Ltd"}</div>
                <div><span className="text-navy-400">Sort Code:</span> <strong className="font-mono text-navy-800">{job.invoice?.bank?.sortCode || "20-00-00"}</strong></div>
                <div><span className="text-navy-400">Account No:</span> <strong className="font-mono text-navy-800">{job.invoice?.bank?.account || "12345678"}</strong></div>
              </div>
              <div className="pt-1 text-[11px] text-navy-500">
                Reference: <strong className="font-mono text-navy-900">{job.id}</strong>
              </div>
            </div>

            {job.status === "paid" || paySuccess ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-800">
                ✓ Payment received in full. Thank you!
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className="btn-primary w-full justify-center py-2.5 text-sm font-semibold"
                  disabled={paying}
                  onClick={markPaid}
                >
                  {paying ? "Recording payment…" : "I’ve paid this invoice"}
                </button>
                <p className="text-center text-[11px] text-navy-400">
                  Click once you have transferred the funds. Your certificate will be issued once payment is verified.
                </p>
              </div>
            )}
            {payError && <p className="text-xs font-semibold text-rose-600">{payError}</p>}
          </div>
        )}

        {/* Client Messaging with the office */}
        <div className="card space-y-3 p-5 text-sm">
          <h2 className="section-label text-sm">Messages with the Office</h2>
          {(job.messages || []).length > 0 ? (
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {job.messages.map((m) => {
                const isMe = m.role === "client";
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs ${isMe ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-navy-100 text-navy-800"}`}>
                      <p className="whitespace-pre-line">{m.text}</p>
                    </div>
                    <span className="mt-0.5 px-1 text-[10px] text-navy-400">{m.sender}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-navy-400">No messages yet. Send a question or note below.</p>
          )}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              className="input flex-1 text-xs"
              placeholder="Type a message to the office…"
              value={clientMsg}
              onChange={(e) => setClientMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendClientMsg(); } }}
            />
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={msgBusy || !clientMsg.trim()}
              onClick={sendClientMsg}
            >
              {msgBusy ? "…" : "Send"}
            </button>
          </div>
          {msgError && <p className="text-xs text-rose-600">{msgError}</p>}
        </div>

        {/* Cert expiry */}
        {job.certExpiry && (
          <div className="card p-4 text-sm">
            <p className="text-navy-500">Certificate expiry: <span className="font-semibold text-navy-900">{fmtDate(job.certExpiry)}</span></p>
          </div>
        )}

        {/* Footer */}
        <p className="pb-8 text-center text-xs text-navy-400">
          Questions? Call us on <a href={`tel:${phoneTel(job.companyPhone || invoiceConfig.phone)}`} className="font-semibold text-navy-600">{phoneShow(job.companyPhone || invoiceConfig.phone)}</a> or email{" "}
          {/* Same company address the quotes and invoices carry — a client
              looking at their certificate shouldn't be handed a gmail. */}
          <a href={`mailto:${job?.companyEmail || invoiceConfig.email}`} className="font-semibold text-navy-600">{job?.companyEmail || invoiceConfig.email}</a>
        </p>
      </div>
    </div>
  );
}
