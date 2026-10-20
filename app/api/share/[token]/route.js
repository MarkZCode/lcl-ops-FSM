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
import { lineSizeLabel, windowStr } from "@/lib/jobCard";
import { quoteMissing, intakeFieldsFor, bookingMissing } from "@/lib/gates";
import { reconcileJob } from "@/lib/visits";
import { pushToAll } from "@/lib/pushAll";
import { runTaskSync } from "@/lib/taskSync";
import { within } from "@/lib/within";
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
  const certified = !!(job.certifiedAt || job.certificateSentAt || (job.attachments || []).some((f) => f.verifiedAt));
  // Explicit allow-list. Anything added to a job in future is private by
  // default and has to be named here to become public.
  await applyCompanyServer();
  const safe = {
    // The contact address from Settings → Company details.
    companyEmail: invoiceConfig.email,
    companyPhone: invoiceConfig.phone || "",
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
    // The arrival window the client is given ("9am–12pm, morning").
    window: job.scheduledAt ? windowStr(job).replace(/^\((.*?)\)\s*(.*)$/, (m, range, part) => (part ? `${range} (${part})` : range)) : "",
    canRequestChange: job.status === "scheduled" && !!job.scheduledAt,
    changeRequestedAt: job.changeRequestedAt || null,
    postcode: property?.postcode || "",
    needs: job.status === "quote" && job.acceptedAt && !job.clientDetailsAt ? needs : [],
    questions: job.status === "quote" && job.acceptedAt && !job.clientDetailsAt ? questions : [],
    detailsSentAt: job.clientDetailsAt || null,
    // Only once the office has pressed "on the way" / the engineer said so.
    // Both stop once the engineer is on site (or done) — a finished job was
    // still telling the client the engineer was running late.
    onTheWay: job.status === "scheduled" && !!job.onTheWayAt && Date.now() - new Date(job.onTheWayAt).getTime() < 6 * 3600_000,
    runningLate: job.status === "scheduled" && job.runningLate && Date.now() - new Date(job.runningLate.at).getTime() < 6 * 3600_000 ? job.runningLate.minutes : null,
    arrived: !!(job.engineerArrivedAt || job.startedAt || (job.visits || []).some((v) => v.arrivedAt || v.startedAt)),
    completed: ["completed", "invoiced", "paid"].includes(job.status),
    preferredDate: job.preferredDate || null,
    preferredSlot: job.preferredSlot || null,
    // Their certificate, strictly gated on office verification/certification
    certificates: certified ? (job.attachments || []).filter((f) => isPdf(f) && f.url && f.check?.postcode !== "missing").map((f) => ({ name: f.name, url: f.url })) : [],
    // Invoice and payment details
    invoice: {
      total: job.price || 0,
      status: job.status,
      paidAt: job.paidAt || null,
      bank: {
        name: invoiceConfig.bankName || "Barclays",
        accountName: invoiceConfig.accountName || "Landlord Compliance London Ltd",
        sortCode: invoiceConfig.sortCode || "20-00-00",
        account: invoiceConfig.accountNumber || "12345678",
      },
    },
    // Messages thread
    messages: (job.messages || []).map((m) => ({
      id: m.id,
      at: m.at,
      sender: m.sender || (m.role === "client" ? "You" : "Office"),
      role: m.role || (m.by === "client" ? "client" : "office"),
      text: m.text || m.detail || "",
    })),
    // Cancelled services aren't shown; a discount is its own line so the
    // list adds up to the total.
    lines: getJobLines(job).filter((l) => !l.cancelled).map((l, i) => ({
      id: l.id || `l${i}`,
      name: l.name,
      code: l.code,
      qty: l.qty || 1,
      tier: lineSizeLabel(l, job) || l.tier || null,
      total: lineTotal(l),
    })),
  };
  {
    const sum = safe.lines.reduce((t, l) => t + (Number(l.total) || 0), 0);
    const off = Math.round((sum - (Number(job.price) || 0)) * 100) / 100;
    safe.discount = off >= 0.01 ? off : 0;
  }

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

  // Client marks invoice as paid
  if (body?.action === "mark_paid") {
    const at = new Date().toISOString();
    const paidJob = {
      ...job,
      status: "paid",
      paidAt: at,
      paymentMethod: body.method || "Bank transfer",
      updatedAt: at,
      activity: [
        ...(job.activity || []),
        { id: "act-" + Date.now().toString(36), at, by: "client", type: "payment", title: "Client marked invoice as paid online", detail: `Amount: £${job.price || 0} via bank transfer` },
      ],
    };
    const { error: pErr } = await supabaseAdmin.from("jobs").upsert({ id: data.id, data: paidJob });
    if (pErr) return NextResponse.json({ error: "Couldn't record payment — please call us." }, { status: 502 });
    await pushToAll({ title: "Invoice paid online", body: `${job.id} — client confirmed payment of £${job.price || 0}`, url: `/jobs/${job.id}` }, { kind: "invoice_paid" });
    await within(runTaskSync({ force: true }));
    return NextResponse.json({ ok: true, status: "paid", paidAt: at });
  }

  // Client sends message to office/engineer
  if (body?.action === "message") {
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    const at = new Date().toISOString();
    const { data: cRow } = job.clientId ? await supabaseAdmin.from("clients").select("id,data").eq("id", job.clientId).maybeSingle() : { data: null };
    const clientName = cRow?.data?.name || "Client";
    const msg = {
      id: "msg-" + Date.now().toString(36),
      at,
      sender: clientName,
      role: "client",
      text,
    };
    const act = {
      id: "act-" + Date.now().toString(36),
      at,
      by: clientName,
      type: "note",
      direction: "in",
      title: `Message from ${clientName} (Client)`,
      detail: text,
    };
    const next = {
      ...job,
      messages: [...(job.messages || []), msg],
      activity: [...(job.activity || []), act],
      updatedAt: at,
    };
    const { error: mErr } = await supabaseAdmin.from("jobs").upsert({ id: data.id, data: next });
    if (mErr) return NextResponse.json({ error: "Couldn't send message — please call us." }, { status: 502 });
    await pushToAll({ title: `Client message (${job.id})`, body: text.slice(0, 120), url: `/jobs/${job.id}` }, { kind: "client_message" });
    await within(runTaskSync({ force: true }));
    return NextResponse.json({ ok: true, message: msg });
  }

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
    await within(runTaskSync({ force: true }));
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

    const time = slot === "Afternoon" ? "13:00:00.000Z" : "09:00:00.000Z";
    const windowPart = slot || "Morning";
    const windowFrom = slot === "Afternoon" ? "13:00" : "08:00";
    const windowTo = slot === "Afternoon" ? "18:00" : "13:00";
    const scheduledAt = date ? `${date}T${time}` : (job.scheduledAt || null);

    let withDetails = {
      ...job,
      ...(certName ? { nameOnCert: certName } : {}),
      ...(accessName ? { accessName } : {}),
      ...(accessPhone ? { accessPhone } : {}),
      ...(accessName || accessPhone ? {
        accessContacts: [{ name: accessName || "Site contact", phone: accessPhone || "" }],
      } : {}),
      ...(date ? {
        preferredDate: date,
        scheduledAt,
        windowPart: job.windowPart || windowPart,
        windowFrom: job.windowFrom || windowFrom,
        windowTo: job.windowTo || windowTo,
      } : {}),
      ...(slot ? { preferredSlot: slot } : {}),
      ...(answered.length ? { intake } : {}),
      clientDetailsAt: at,
      updatedAt: at,
      activity: [...(job.activity || []), { id: "act-" + Date.now().toString(36), at, by: "client", type: "note", title: "Client sent their booking details online", detail: lines.join("\n") }],
    };

    if (Array.isArray(withDetails.visits) && withDetails.visits.length > 0 && date) {
      withDetails.visits = withDetails.visits.map((v) => ({
        ...v,
        scheduledAt: v.scheduledAt || scheduledAt,
        windowPart: v.windowPart || windowPart,
        windowFrom: v.windowFrom || windowFrom,
        windowTo: v.windowTo || windowTo,
      }));
    }

    const nextJob = reconcileJob(job, withDetails, withDetails);
    const { error: dErr } = await supabaseAdmin.from("jobs").upsert({ id: data.id, data: nextJob });
    if (dErr) return NextResponse.json({ error: "Couldn't send that — please call us." }, { status: 502 });

    // The address, access contact, and certificate name go onto the client and property
    const { data: cRow } = job.clientId ? await supabaseAdmin.from("clients").select("id,data").eq("id", job.clientId).maybeSingle() : { data: null };
    let client = cRow?.data || null;
    if (client && (address || accessName || accessPhone)) {
      const c = client;
      let matchedProp = false;
      const props = (c.properties || []).map((p) => {
        if (p.id === job.propertyId) {
          matchedProp = true;
          return {
            ...p,
            ...(address ? { label: address } : {}),
            ...(accessName ? { accessName } : {}),
            ...(accessPhone ? { accessPhone } : {}),
          };
        }
        return p;
      });
      if (!matchedProp && job.propertyId) {
        props.push({
          id: job.propertyId,
          label: address || job.postcode || "Property",
          postcode: job.postcode || "",
          accessName: accessName || "",
          accessPhone: accessPhone || "",
        });
      }
      await supabaseAdmin.from("clients").upsert({ id: cRow.id, data: { ...c, properties: props } });
      client = { ...c, properties: props };
    }

    // The alert says exactly what arrived and what is still missing — never
    // a stock sentence that claims more than the client actually sent.
    const sent = [address && "address", certName && "name for the certificate", (accessName || accessPhone) && "access contact", date && "preferred date", answered.length && "property details"].filter(Boolean);
    const property = (client?.properties || []).find((p) => p.id === job.propertyId) || null;
    const still = [...bookingMissing(nextJob, { client, property }), ...quoteMissing(nextJob, { client, property }, { all: true }).filter((m) => m.key !== "address" && m.key !== "name" && m.key !== "postcode")].map((m) => m.label);
    const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0] || "");
    await pushToAll({
      title: still.length ? "Client sent some details" : "Booking details complete",
      body: `${job.id} — client sent: ${list(sent)}.${still.length ? ` Still missing: ${list(still)}.` : " Everything needed is in — book it."}`,
      url: `/jobs/${job.id}`,
    }, { kind: "quote_accepted" });
    await within(runTaskSync({ force: true }));
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
  await within(runTaskSync({ force: true }));
  return NextResponse.json({ ok: true, acceptedAt: now });
}
