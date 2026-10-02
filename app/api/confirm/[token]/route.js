// Engineer confirms a job from a link (/confirm/<token>) — no login.
//
// The job offer sent on WhatsApp carries this link. Opening it shows ONLY
// what the offer already said (service, date, postcode area) and a Confirm
// button; pressing it writes the same confirmation the office's own
// "Mark confirmed" writes, so the job page, the Visits panel and the job
// card all agree. Never returns client names, phone numbers, addresses or
// prices — the token is the only credential.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { confirmationScopes, scopeAccepted, setScopeConfirmed, dateLine } from "@/lib/jobCard";
import { reconcileJob } from "@/lib/visits";
import { pushToAll } from "@/lib/pushAll";
import { runTaskSync } from "@/lib/taskSync";
import { rateLimitOr429 } from "@/lib/rateLimit";

export const runtime = "nodejs";

async function load(token) {
  if (!token || String(token).length < 12 || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin.from("jobs").select("id,data").eq("data->>confirmToken", token).maybeSingle();
  if (!data?.data) return null;
  const { data: engRows } = await supabaseAdmin.from("engineers").select("id,data");
  const engineers = (engRows || []).map((r) => r.data).filter(Boolean);
  const engineerById = (id) => engineers.find((e) => e.id === id);
  return { row: data, job: data.data, engineerById };
}

function view(job, engineerById, clientPostcode) {
  const open = !["completed", "invoiced", "paid", "cancelled"].includes(job.status);
  const scopes = confirmationScopes(job, engineerById)
    .filter((sc) => sc.engineerId && sc.engineerId !== "unassigned")
    .map((sc) => {
      const v = sc.visitId ? (job.visits || []).find((x) => x.id === sc.visitId) : null;
      const when = v ? (v.scheduledAt ? dateLine({ ...job, ...v }) : "") : (job.scheduledAt ? dateLine(job) : "");
      return {
        key: sc.key,
        engineer: engineerById(sc.engineerId)?.name || "Engineer",
        services: sc.sub || sc.label,
        when,
        confirmed: scopeAccepted(job, sc),
      };
    });
  return { id: job.id, open, area: clientPostcode, scopes };
}

async function postcodeArea(job) {
  if (!job.clientId) return "";
  const { data } = await supabaseAdmin.from("clients").select("data").eq("id", job.clientId).maybeSingle();
  const p = (data?.data?.properties || []).find((x) => x.id === job.propertyId);
  const s = String(p?.postcode || "").toUpperCase().replace(/\s+/g, "");
  return s.length >= 5 ? s.slice(0, -3) : s;
}

export async function GET(_req, { params }) {
  const found = await load(params?.token);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view(found.job, found.engineerById, await postcodeArea(found.job)), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req, { params }) {
  const limited = rateLimitOr429("engineer-confirm", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const found = await load(params?.token);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { job, row, engineerById } = found;
  let body = {};
  try { body = await req.json(); } catch {}
  const sc = confirmationScopes(job, engineerById).find((s) => s.key === body.key);
  if (!sc || !sc.engineerId || sc.engineerId === "unassigned") {
    return NextResponse.json({ error: "That part of the job isn't open to confirm." }, { status: 409 });
  }
  if (["completed", "invoiced", "paid", "cancelled"].includes(job.status)) {
    return NextResponse.json({ error: "This job is already closed." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const who = engineerById(sc.engineerId)?.name || "Engineer";

  // "I can't do this" — before accepting it's a decline, after accepting
  // it's a cancellation. Either way the job goes back to needing an
  // engineer and the office is told at once, whatever the hour.
  if (body.action === "decline") {
    const was = scopeAccepted(job, sc);
    const patch = was ? setScopeConfirmed(job, sc.key, false, engineerById) : {};
    if (sc.key === "job") patch.engineerId = "unassigned";
    else if (String(sc.key).startsWith("visit:")) {
      patch.visits = (patch.visits || job.visits || []).map((v) => (`visit:${v.id}` === sc.key ? { ...v, engineerId: "unassigned", engineerConfirmedAt: null } : v));
    }
    patch.offerLog = [...(job.offerLog || []), { engineerId: sc.engineerId, key: sc.key, status: was ? "cancelled" : "declined", at: now }];
    patch.activity = [
      ...(job.activity || []),
      { id: "act-" + Date.now().toString(36), at: now, by: who, type: "status", title: `${who} ${was ? "pulled out of" : "declined"} the job${sc.sub ? ` — ${sc.sub}` : ""}`, detail: String(body.reason || "").slice(0, 300) },
    ];
    const nextJob = reconcileJob(job, { ...job, ...patch, updatedAt: now }, patch);
    const { error: dErr } = await supabaseAdmin.from("jobs").upsert({ id: row.id, data: nextJob });
    if (dErr) return NextResponse.json({ error: "Couldn't save that — please message the office." }, { status: 502 });
    await pushToAll({ title: was ? "Engineer pulled out" : "Engineer declined", body: `${who} can't do ${job.id}${sc.sub ? ` · ${sc.sub}` : ""} — it needs another engineer.`, url: `/jobs/${job.id}` }, { kind: "engineer_cancelled" });
    await runTaskSync({ force: true });
    return NextResponse.json({ ok: true, declined: true });
  }

  if (scopeAccepted(job, sc)) return NextResponse.json({ ok: true, already: true });

  const patch = setScopeConfirmed(job, sc.key, true, engineerById);
  if (patch.engineerConfirmed && job.status === "quote") patch.status = "scheduled";
  patch.offerLog = [...(job.offerLog || []), { engineerId: sc.engineerId, key: sc.key, status: "accepted", at: now }];
  const name = engineerById(sc.engineerId)?.name || "Engineer";
  patch.activity = [
    ...(job.activity || []),
    { id: "act-" + Date.now().toString(36), at: now, by: name, type: "status", title: `${name} confirmed from the job link${sc.sub ? ` — ${sc.sub}` : ""}` },
  ];
  const next = reconcileJob(job, { ...job, ...patch, updatedAt: now }, patch);
  const { error } = await supabaseAdmin.from("jobs").upsert({ id: row.id, data: next });
  if (error) return NextResponse.json({ error: "Couldn't save that — please message the office." }, { status: 502 });
  await pushToAll({ title: "Engineer confirmed", body: `${name} confirmed ${job.id}${sc.sub ? ` · ${sc.sub}` : ""}`, url: `/jobs/${job.id}` }, { kind: "engineer_confirmed" });
  await runTaskSync({ force: true });
  return NextResponse.json({ ok: true });
}
