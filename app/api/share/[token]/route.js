// Public job-status link (/share/<token>).
//
// This used to be read straight from the browser with the ANON key, which
// meant two things:
//   1. the `jobs` table had to stay readable without a login for the link to
//      work at all — the single thing blocking the database being locked down;
//   2. the response carried the WHOLE job object to a public page. The UI only
//      renders a status, a total and the service lines, but engineer pay,
//      company margin, the access phone number and internal notes all went
//      down the wire with it, visible to anyone with the link in devtools.
//
// It now runs server-side with the service-role key and returns ONLY the
// fields the page actually shows. The token is the only credential, so what
// it unlocks has to be the minimum.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getJobLines, lineTotal } from "@/lib/format";
import { lineSizeLabel } from "@/lib/jobCard";
import { quoteMissing, intakeFieldsFor } from "@/lib/gates";
import { pushToAll } from "@/lib/pushAll";
import { runTaskSync } from "@/lib/taskSync";
import { rateLimitOr429 } from "@/lib/rateLimit";
import { applyCompanyServer } from "@/lib/companyServer";
import { invoiceConfig } from "@/lib/invoiceConfig";

export async function GET(_request, { params }) {
  const token = params?.token;
  // A short or empty token would match far too broadly — refuse outright
  // rather than letting a one-character guess enumerate jobs.
  if (!token || String(token).length < 12) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("data")
    .eq("data->>shareToken", token)
    .maybeSingle();

  if (error || !data?.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = data.data;
  // What we still need from the client to book it — asked for on the page
  // once they've accepted, so nobody has to chase it by message.
  let property = null;
  let clientRec = null;
  if (job.clientId) {
    const { data: cRow } = await supabaseAdmin.from("clients").select("data").eq("id", job.clientId).maybeSingle();
    clientRec = cRow?.data || null;
    property = (cRow?.data?.properties || []).find((p) => p.id === job.propertyId) || null;
  }
  const flat = (v) => String(v || "").replace(/\s/g, "").toUpperCase();
  const needs = [];
  if (!flat(property?.label) || flat(property?.label) === flat(property?.postcode)) needs.push("address");
  if (!String(job.nameOnCert || "").trim()) needs.push("certName");
  if (!String(job.accessName || "").trim() && !String(job.accessPhone || "").trim() && !(job.accessContacts || []).length) needs.push("access");
  if (!job.preferredDate && !job.scheduledAt) needs.push("date");
  // The questions each service asks (appliances, bedrooms, floors…) that
  // nobody has answered yet — asked on the same form, in plain words.
  const questions = quoteMissing(job, { client: clientRec, property }, { all: true })
    .map((m) => intakeFieldsFor(job).find((f) => f.field === m.key))
    .filter(Boolean)
    .map((f) => ({ field: f.field, title: f.title, input: f.input, options: f.options || null }));
  const isPdf = (f) => f?.type === "application/pdf" || /\.pdf$/i.test(f?.name || "");
  const certified = job.status === "paid" && !!(job.certifiedAt || job.certificateSentAt);
  // Explicit allow-list. Anything added to a job in future is private by
  // default and has to be named here to become public.
  await applyCompanyServer();
  const safe = {
    // The contact address from Settings → Company details.
    companyEmail: invoiceConfig.email,
    id: job.id,
    status: job.status,
    price: job.price,
    certExpiry: job.certExpiry || null,
    // The client can accept a quote from this page until it's accepted,
    // booked or closed.
    acceptedAt: job.acceptedAt || null,
    canAccept: job.status === "quote" && !job.acceptedAt,
    // Their own appointment, and whether they can still ask to move it.
    scheduledAt: job.scheduledAt || null,
    canRequestChange: job.status === "scheduled" && !!job.scheduledAt,
    changeRequestedAt: job.changeRequestedAt || null,
    postcode: property?.postcode || "",
    needs: job.status === "quote" && job.acceptedAt && !job.clientDetailsAt ? needs : [],
    questions: job.status === "quote" && job.acceptedAt && !job.clientDetailsAt ? questions : [],
    detailsSentAt: job.clientDetailsAt || null,
    // Only once the office has pressed "on the way" / the engineer said so.
    onTheWay: job.status !== "completed" && !!job.onTheWayAt && Date.now() - new Date(job.onTheWayAt).getTime() < 6 * 3600_000,
    runningLate: job.runningLate && Date.now() - new Date(job.runningLate.at).getTime() < 6 * 3600_000 ? job.runningLate.minutes : null,
    // Their certificate, once the job is paid and it has been sent — the
    // same files the office checked, never one flagged as doubtful.
    certificates: certified ? (job.attachments || []).filter((f) => isPdf(f) && f.url && f.check?.postcode !== "missing").map((f) => ({ name: f.name, url: f.url })) : [],
    lines: getJobLines(job).map((l) => ({
      name: l.code === "CUSTOM" ? l.name : l.name,
      code: l.code,
      qty: l.qty || 1,
      tier: lineSizeLabel(l, job) || l.tier || null,
      total: lineTotal(l),
    })),
  };

  return NextResponse.json(safe, {
    headers: { "Cache-Control": "no-store" },
  });
}

// The client pressing "Accept quote" on their link. Records the acceptance on
// the job exactly as the office's own "Yes, accepted" does — the date, a line
// in the conversation — and tells every device, so booking can start without
// anyone having to notice an email. It never books or schedules by itself.
export async function POST(request, { params }) {
  const token = params?.token;
  if (!token || String(token).length < 12) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const limited = rateLimitOr429("share-accept", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { data, error } = await supabaseAdmin
    .from("jobs").select("id,data").eq("data->>shareToken", token).maybeSingle();
  if (error || !data?.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const job = data.data;
  let body = {};
  try { body = await request.json(); } catch {}

  // "Can we move my appointment?" — recorded as a message from the client on
  // the job, which makes "Reply to the client" the job's next step. Nothing
  // is moved automatically: the office agrees the new slot.
  if (body?.action === "reschedule") {
    if (job.status !== "scheduled") return NextResponse.json({ error: "This appointment can't be changed online — please call us." }, { status: 409 });
    const wanted = String(body.date || "").slice(0, 10);
    const note = String(body.note || "").slice(0, 500);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wanted)) return NextResponse.json({ error: "Pick the date you'd prefer." }, { status: 400 });
    const at = new Date().toISOString();
    const nice = new Date(`${wanted}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const moved = {
      ...job,
      changeRequestedAt: at,
      updatedAt: at,
      activity: [
        ...(job.activity || []),
        { id: "act-" + Date.now().toString(36), at, by: "client", type: "note", direction: "in", title: "Client asked to move the appointment", detail: `Would prefer ${nice}.${note ? `\n\n${note}` : ""}` },
      ],
    };
    const { error: mErr } = await supabaseAdmin.from("jobs").upsert({ id: data.id, data: moved });
    if (mErr) return NextResponse.json({ error: "Couldn't send that — please call us." }, { status: 502 });
    await pushToAll({ title: "Client wants to reschedule", body: `${job.id} — would prefer ${nice}`, url: `/jobs/${job.id}` }, { kind: "reschedule" });
    await runTaskSync({ force: true });
    return NextResponse.json({ ok: true, changeRequestedAt: at });
  }

  // The booking details, typed by the client on their link after accepting.
  if (body?.action === "details") {
    if (job.status !== "quote" || !job.acceptedAt) return NextResponse.json({ error: "These details can't be sent online for this job — please call us." }, { status: 409 });
    const clip = (v, n) => String(v || "").trim().slice(0, n);
    const address = clip(body.address, 200), certName = clip(body.certName, 120), accessName = clip(body.accessName, 80), accessPhone = clip(body.accessPhone, 30);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? body.date : "";
    const slot = ["Morning", "Afternoon"].includes(body.slot) ? body.slot : "";
    // Answers to the service questions — only fields this job actually asks.
    const intake = { ...(job.intake || {}) };
    const answered = [];
    for (const f of intakeFieldsFor(job)) {
      const v = body.intake?.[f.field];
      if (v === undefined || v === null || v === "") continue;
      if (f.input === "number") { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n < 1000) { intake[f.field] = n; answered.push(`${f.title}: ${n}`); } }
      else if (f.input === "yesno") { if (["Yes", "No"].includes(v)) { intake[f.field] = v; answered.push(`${f.title}: ${v}`); } }
      else if (f.input === "chips") { const list = (Array.isArray(v) ? v : []).filter((x) => (f.options || []).includes(x)); if (list.length) { intake[f.field] = list; answered.push(`${f.title}: ${list.join(", ")}`); } }
      else { const t = clip(v, 200); if (t) { intake[f.field] = t; answered.push(`${f.title}: ${t}`); } }
    }
    if (!address && !certName && !accessName && !accessPhone && !date && !answered.length) return NextResponse.json({ error: "Please fill in the details first." }, { status: 400 });
    const at = new Date().toISOString();
    const lines = [address && `Address: ${address}`, certName && `Name on certificate: ${certName}`, (accessName || accessPhone) && `Access: ${[accessName, accessPhone].filter(Boolean).join(" · ")}`, date && `Preferred: ${date}${slot ? ` (${slot})` : ""}`, ...answered].filter(Boolean);
    const withDetails = {
      ...job,
      ...(certName ? { nameOnCert: certName } : {}),
      ...(accessName ? { accessName } : {}),
      ...(accessPhone ? { accessPhone } : {}),
      ...(date ? { preferredDate: date } : {}),
      ...(slot ? { preferredSlot: slot } : {}),
      ...(answered.length ? { intake } : {}),
      clientDetailsAt: at,
      updatedAt: at,
      activity: [...(job.activity || []), { id: "act-" + Date.now().toString(36), at, by: "client", type: "note", title: "Client sent their booking details online", detail: lines.join("\n") }],
    };
    const { error: dErr } = await supabaseAdmin.from("jobs").upsert({ id: data.id, data: withDetails });
    if (dErr) return NextResponse.json({ error: "Couldn't send that — please call us." }, { status: 502 });
    // The address goes onto the property, but only where we had none.
    if (address && job.clientId) {
      const { data: cRow } = await supabaseAdmin.from("clients").select("id,data").eq("id", job.clientId).maybeSingle();
      const c = cRow?.data;
      const flat = (v) => String(v || "").replace(/\s/g, "").toUpperCase();
      if (c && (c.properties || []).some((p) => p.id === job.propertyId && (!flat(p.label) || flat(p.label) === flat(p.postcode)))) {
        const props = c.properties.map((p) => (p.id === job.propertyId ? { ...p, label: address } : p));
        await supabaseAdmin.from("clients").upsert({ id: cRow.id, data: { ...c, properties: props } });
      }
    }
    await pushToAll({ title: "Booking details received", body: `${job.id} — the client sent their address, access and preferred date. Book it in.`, url: `/jobs/${job.id}` }, { kind: "quote_accepted" });
    await runTaskSync({ force: true });
    return NextResponse.json({ ok: true, detailsSentAt: at });
  }

  if (job.acceptedAt) return NextResponse.json({ ok: true, acceptedAt: job.acceptedAt, already: true });
  if (job.status !== "quote") return NextResponse.json({ error: "This quote can no longer be accepted online." }, { status: 409 });

  const now = new Date().toISOString();
  const next = {
    ...job,
    acceptedAt: now,
    acceptedVia: "online",
    quoteHoldUntil: null,
    updatedAt: now,
    activity: [
      ...(job.activity || []),
      { id: "act-" + Date.now().toString(36), at: now, by: "client", type: "status", title: "Quote accepted online by the client" },
    ],
  };
  const { error: wErr } = await supabaseAdmin.from("jobs").upsert({ id: data.id, data: next });
  if (wErr) return NextResponse.json({ error: "Couldn't record that — please call us." }, { status: 502 });

  await pushToAll({ title: "Quote accepted online", body: `${job.id} — the client accepted. Book it in.`, url: `/jobs/${job.id}` }, { kind: "quote_accepted" });
  await runTaskSync({ force: true });
  return NextResponse.json({ ok: true, acceptedAt: now });
}
