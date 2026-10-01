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
import { pushToAll } from "@/lib/pushAll";
import { runTaskSync } from "@/lib/taskSync";
import { rateLimitOr429 } from "@/lib/rateLimit";

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
  // Explicit allow-list. Anything added to a job in future is private by
  // default and has to be named here to become public.
  const safe = {
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
    lines: getJobLines(job).map((l) => ({
      name: l.code === "CUSTOM" ? l.name : l.name,
      code: l.code,
      qty: l.qty || 1,
      tier: l.tier || null,
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
