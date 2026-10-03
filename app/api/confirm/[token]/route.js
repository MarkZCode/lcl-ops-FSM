// Engineer confirms a job from a link (/confirm/<token>) — no login.
//
// The job offer sent on WhatsApp carries this link. Opening it shows ONLY
// what the offer already said (service, date, postcode area) and a Confirm
// button; pressing it writes the same confirmation the office's own
// "Mark confirmed" writes, so the job page, the Visits panel and the job
// card all agree. Never returns client names, phone numbers, addresses or
// prices — the token is the only credential.
import { NextResponse } from "next/server";
import { supabaseAdmin, JOB_FILES_BUCKET } from "@/lib/supabaseAdmin";
import { confirmationScopes, scopeAccepted, setScopeConfirmed, dateLine } from "@/lib/jobCard";
import { reconcileJob } from "@/lib/visits";
import { pushToAll } from "@/lib/pushAll";
import { runTaskSync } from "@/lib/taskSync";
import { rateLimitOr429 } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

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
        started: v ? ["in_progress", "completed"].includes(v.status) : ["in_progress", "completed"].includes(job.status),
        finished: v ? v.status === "completed" : job.status === "completed",
      };
    });
  return { id: job.id, open, canUpload: job.status !== "cancelled", area: clientPostcode, scopes };
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
  // A finished job still takes the certificate upload; nothing else.
  if (job.status === "cancelled" || (["completed", "invoiced", "paid"].includes(job.status) && body.action !== "upload")) {
    return NextResponse.json({ error: "This job is already closed." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const who = engineerById(sc.engineerId)?.name || "Engineer";

  // ── On the day, from the same link (only once they've confirmed) ──
  if (["on_way", "location", "late", "arrived", "finished", "upload"].includes(body.action)) {
    if (!scopeAccepted(job, sc)) return NextResponse.json({ error: "Confirm the job first." }, { status: 409 });
    const visitKey = String(sc.key).startsWith("visit:") ? sc.key.slice(6) : null;
    const save = async (patch, activityTitle, detail = "") => {
      patch.activity = [...(job.activity || []), { id: "act-" + Date.now().toString(36), at: now, by: who, type: "status", title: activityTitle, detail }];
      const nextJob = reconcileJob(job, { ...job, ...patch, updatedAt: now }, patch);
      const { error: sErr } = await supabaseAdmin.from("jobs").upsert({ id: row.id, data: nextJob });
      return !sErr;
    };

    // Where the engineer is, kept in its own row (never written onto the
    // job, so it can't collide with the office editing the job).
    if (body.action === "location") {
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!(lat > 49 && lat < 61 && lng > -9 && lng < 3)) return NextResponse.json({ error: "Bad location" }, { status: 400 });
      const { data: live } = await supabaseAdmin.from("app_settings").select("data").eq("id", "engineer_live").maybeSingle();
      const map = live?.data && typeof live.data === "object" ? live.data : {};
      // Drop anything older than a day while we're here.
      for (const k of Object.keys(map)) if (Date.now() - new Date(map[k]?.at || 0).getTime() > 86400_000) delete map[k];
      map[sc.engineerId] = { lat, lng, at: now, jobId: job.id, name: who };
      await supabaseAdmin.from("app_settings").upsert({ id: "engineer_live", data: map });
      return NextResponse.json({ ok: true });
    }

    // "On my way" — recorded on the job whether or not the phone shares its
    // location: the client's link shows "your engineer is on the way" and the
    // office is told. Location (below) is an extra for the dispatch map.
    if (body.action === "on_way") {
      if (job.onTheWayAt && Date.now() - new Date(job.onTheWayAt).getTime() < 6 * 3600_000) return NextResponse.json({ ok: true, already: true });
      if (!(await save({ onTheWayAt: now, runningLate: null }, `${who} is on the way`))) return NextResponse.json({ error: "Couldn't save that — please message the office." }, { status: 502 });
      await pushToAll({ title: "Engineer on the way", body: `${who} is on the way to ${job.id}${sc.sub ? ` · ${sc.sub}` : ""}`, url: `/jobs/${job.id}` }, { kind: "engineer_progress" });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "late") {
      const mins = [15, 30, 45, 60, 90].includes(Number(body.minutes)) ? Number(body.minutes) : 30;
      if (!(await save({ runningLate: { minutes: mins, at: now, engineerId: sc.engineerId } }, `${who} is running about ${mins} minutes late`))) return NextResponse.json({ error: "Couldn't save that — please message the office." }, { status: 502 });
      await pushToAll({ title: "Engineer running late", body: `${who} is about ${mins} min late for ${job.id} — let the client know.`, url: `/jobs/${job.id}` }, { kind: "engineer_progress" });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "arrived" || body.action === "finished") {
      const done = body.action === "finished";
      const patch = visitKey
        ? { visits: (job.visits || []).map((v) => (v.id === visitKey ? { ...v, status: done ? "completed" : "in_progress", ...(done ? { completedAt: now } : { startedAt: now }) } : v)) }
        : done ? { status: "completed", completedAt: now } : { status: "in_progress", startedAt: now };
      if (!(await save(patch, done ? `${who} finished on site${sc.sub ? ` — ${sc.sub}` : ""}` : `${who} arrived on site`))) return NextResponse.json({ error: "Couldn't save that — please message the office." }, { status: 502 });
      await pushToAll({ title: done ? "Engineer finished" : "Engineer arrived", body: `${who} ${done ? "has finished" : "is on site at"} ${job.id}${sc.sub ? ` · ${sc.sub}` : ""}`, url: `/jobs/${job.id}` }, { kind: "engineer_progress" });
      await runTaskSync({ force: true });
      return NextResponse.json({ ok: true });
    }

    // The certificate or photos, straight onto the job's documents.
    const { base64, filename, contentType } = body;
    if (!base64 || !filename || typeof base64 !== "string") return NextResponse.json({ error: "No file received." }, { status: 400 });
    if (base64.length > Math.ceil(MAX_UPLOAD_BYTES * 1.4)) return NextResponse.json({ error: "That file is too large (max 9 MB)." }, { status: 413 });
    if (!/^(application\/pdf|image\/(jpeg|png|heic|webp))$/.test(String(contentType || ""))) return NextResponse.json({ error: "Send a PDF or a photo." }, { status: 415 });
    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `jobs/${job.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error: upErr } = await supabaseAdmin.storage.from(JOB_FILES_BUCKET).upload(path, Buffer.from(base64, "base64"), { contentType, upsert: false });
    if (upErr) return NextResponse.json({ error: "Upload failed — please send it to the office instead." }, { status: 502 });
    const { data: pub } = supabaseAdmin.storage.from(JOB_FILES_BUCKET).getPublicUrl(path);
    const file = { id: "att-" + Date.now().toString(36), name: safe, type: contentType, size: Math.round(base64.length * 0.75), url: pub.publicUrl, path, addedAt: now, by: who, fromEngineer: true };
    if (!(await save({ attachments: [file, ...(job.attachments || [])] }, `${who} uploaded ${safe}`))) return NextResponse.json({ error: "Couldn't save that — please send it to the office." }, { status: 502 });
    await pushToAll({ title: "Certificate uploaded", body: `${who} uploaded a document for ${job.id} — check it and send it.`, url: `/jobs/${job.id}` }, { kind: "engineer_progress" });
    await runTaskSync({ force: true });
    return NextResponse.json({ ok: true });
  }

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
