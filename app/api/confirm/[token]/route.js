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
import { confirmationScopes, scopeAccepted, setScopeConfirmed, dateLine, isScopeFinished, isScopeStarted } from "@/lib/jobCard";
import { reconcileJob, visitEngineerId } from "@/lib/visits";
import { pushToAll } from "@/lib/pushAll";
import { runTaskSync } from "@/lib/taskSync";
import { within } from "@/lib/within";
import { rateLimitOr429 } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

async function load(token) {
  if (!token || String(token).length < 12 || !supabaseAdmin) return null;
  const { data: rows } = await supabaseAdmin.from("jobs").select("id,data").eq("data->>confirmToken", token).limit(1);
  const data = rows?.[0] || null;
  if (!data?.data) return null;
  const { data: engRows } = await supabaseAdmin.from("engineers").select("id,data");
  const engineers = (engRows || []).map((r) => r.data).filter(Boolean);
  const engineerById = (id) => engineers.find((e) => e.id === id);
  let client = null;
  if (data.data.clientId) {
    const { data: cRow } = await supabaseAdmin.from("clients").select("data").eq("id", data.data.clientId).maybeSingle();
    client = cRow?.data || null;
  }
  return { row: data, job: data.data, engineerById, client };
}

function view(job, engineerById, clientPostcode, client) {
  const todayUk = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  const scopes = confirmationScopes(job, engineerById)
    .filter((sc) => sc.engineerId && sc.engineerId !== "unassigned")
    .map((sc) => {
      const v = sc.visitId ? (job.visits || []).find((x) => x.id === sc.visitId) : null;
      const sched = v?.scheduledAt || job.scheduledAt;
      const schedDateUk = sched ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(sched)) : "";
      const isToday = !!schedDateUk && schedDateUk === todayUk;

      const raw = v
        ? (v.scheduledAt ? dateLine({ ...job, ...v }) : (job.preferredDate ? `Preferred: ${dateLine({ ...job, scheduledAt: job.preferredDate })}` : ""))
        : (job.scheduledAt ? dateLine(job) : (job.preferredDate ? `Preferred: ${dateLine({ ...job, scheduledAt: job.preferredDate })}` : ""));
      const when = raw.replace(/^(\S+(?: \d+ \w+)?) \((.*?)\)\s*(.*)$/, (m, day, range, part) => `${day}, ${range}${part ? ` (${part})` : ""}`);
      return {
        key: sc.key,
        engineerId: sc.engineerId,
        engineer: engineerById(sc.engineerId)?.name || "Engineer",
        services: sc.sub || sc.label,
        when,
        isToday,
        confirmed: scopeAccepted(job, sc),
        started: isScopeStarted(job, sc, engineerById),
        finished: isScopeFinished(job, sc, engineerById),
      };
    });

  const allFinished = scopes.length > 0 && scopes.every((s) => s.finished);
  const open = !["invoiced", "paid", "cancelled"].includes(job.status) && !allFinished;
  const anyConfirmed = scopes.some((s) => s.confirmed);
  const property = (client?.properties || []).find((p) => p.id === job.propertyId) || null;
  const fullAddress = property?.label || property?.address || clientPostcode || "";
  const propertyDetails = anyConfirmed ? {
    address: fullAddress,
    accessName: job.accessName || property?.accessName || "",
    accessPhone: job.accessPhone || property?.accessPhone || "",
    accessNotes: job.accessNotes || property?.accessNotes || job.propertyNotes || job.notes || "",
    scheduledAt: job.scheduledAt || null,
  } : null;

  return {
    id: job.id,
    open,
    canUpload: job.status !== "cancelled",
    area: clientPostcode,
    propertyDetails,
    scopes,
    messages: (job.messages || []).map((m) => ({
      id: m.id,
      at: m.at,
      sender: m.sender || (m.role === "engineer" ? "You" : "Office / Client"),
      role: m.role || "office",
      text: m.text || m.detail || "",
    })),
  };
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
  return NextResponse.json(view(found.job, found.engineerById, await postcodeArea(found.job), found.client), { headers: { "Cache-Control": "no-store" } });
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
  // A finished scope still takes the certificate upload; nothing else.
  const isThisScopeFinished = isScopeFinished(job, sc, engineerById);
  if (job.status === "cancelled" || (["invoiced", "paid"].includes(job.status) && body.action !== "upload") || (isThisScopeFinished && body.action !== "upload")) {
    return NextResponse.json({ error: isThisScopeFinished ? "You have already completed this work." : "This job is already closed." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const who = engineerById(sc.engineerId)?.name || "Engineer";

  // Engineer message
  if (body.action === "message") {
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    const msg = {
      id: "msg-" + Date.now().toString(36),
      at: now,
      sender: who,
      role: "engineer",
      text,
    };
    const act = {
      id: "act-" + Date.now().toString(36),
      at: now,
      by: who,
      type: "note",
      direction: "in",
      title: `Message from ${who} (Engineer)`,
      detail: text,
    };
    const next = {
      ...job,
      messages: [...(job.messages || []), msg],
      activity: [...(job.activity || []), act],
      updatedAt: now,
    };
    const { error: mErr } = await supabaseAdmin.from("jobs").upsert({ id: row.id, data: next });
    if (mErr) return NextResponse.json({ error: "Couldn't send message — please call us." }, { status: 502 });
    await pushToAll({ title: `Engineer message (${who})`, body: `${job.id}: ${text.slice(0, 100)}`, url: `/jobs/${job.id}` }, { kind: "engineer_message" });
    await within(runTaskSync({ force: true }));
    return NextResponse.json({ ok: true, message: msg });
  }

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
      const allJobScopes = confirmationScopes(job, engineerById);

      let patch = {};

      if (done) {
        // Build card completions map for this engineer's scopes on this job
        const nextCompletions = { ...(job.cardCompletions || {}) };
        for (const s of allJobScopes) {
          if (s.engineerId === sc.engineerId) {
            nextCompletions[s.key] = now;
            if (s.lineId) nextCompletions[`line:${s.lineId}`] = now;
            if (s.visitId) nextCompletions[`visit:${s.visitId}`] = now;
          }
        }
        nextCompletions[sc.engineerId] = now;
        if (sc.key === "job") nextCompletions.job = now;

        let updatedVisits = job.visits;
        if (Array.isArray(job.visits) && job.visits.length > 0) {
          updatedVisits = job.visits.map((v) => {
            if (v.engineerId === sc.engineerId || (visitKey && v.id === visitKey) || (sc.visitId && v.id === sc.visitId)) {
              return { ...v, status: "completed", completedAt: v.completedAt || now };
            }
            return v;
          });
        }

        const candidateJob = { ...job, cardCompletions: nextCompletions, visits: updatedVisits };
        const assignedScopes = allJobScopes.filter((s) => s.engineerId && s.engineerId !== "unassigned");
        const allScopesDone = assignedScopes.length > 0 && assignedScopes.every((s) => isScopeFinished(candidateJob, s, engineerById));

        patch = {
          cardCompletions: nextCompletions,
          ...(updatedVisits ? { visits: updatedVisits } : {}),
          status: allScopesDone ? "completed" : "in_progress",
          ...(allScopesDone ? { completedAt: now } : {}),
        };
      } else {
        // Arrived
        const nextArrivals = { ...(job.cardArrivals || {}) };
        for (const s of allJobScopes) {
          if (s.engineerId === sc.engineerId) {
            nextArrivals[s.key] = now;
            if (s.lineId) nextArrivals[`line:${s.lineId}`] = now;
            if (s.visitId) nextArrivals[`visit:${s.visitId}`] = now;
          }
        }
        nextArrivals[sc.engineerId] = now;
        if (sc.key === "job") nextArrivals.job = now;

        let updatedVisits = job.visits;
        if (Array.isArray(job.visits) && job.visits.length > 0) {
          updatedVisits = job.visits.map((v) => {
            if (v.engineerId === sc.engineerId || (visitKey && v.id === visitKey) || (sc.visitId && v.id === sc.visitId)) {
              return { ...v, status: "in_progress", startedAt: v.startedAt || now, arrivedAt: v.arrivedAt || now };
            }
            return v;
          });
        }

        patch = {
          cardArrivals: nextArrivals,
          ...(updatedVisits ? { visits: updatedVisits } : {}),
          status: "in_progress",
          startedAt: job.startedAt || now,
          engineerArrivedAt: now,
        };
      }

      if (!(await save(patch, done ? `${who} finished on site${sc.sub ? ` — ${sc.sub}` : ""}` : `${who} arrived on site`))) return NextResponse.json({ error: "Couldn't save that — please message the office." }, { status: 502 });

      // ── Sync sibling jobs for the SAME engineer (never different engineers) ──
      // If jobs belong to the same engineer, finishing one job should automatically
      // mark all jobs for that engineer as finished.
      // Jobs for DIFFERENT engineers stay separate and are NOT finished.
      if (done && sc.engineerId && sc.engineerId !== "unassigned") {
        try {
          const queries = [
            supabaseAdmin.from("jobs").select("id,data").eq("data->>confirmToken", params?.token).neq("id", job.id),
          ];
          if (job.clientId && job.scheduledAt) {
            queries.push(
              supabaseAdmin.from("jobs").select("id,data").eq("data->>clientId", job.clientId).neq("id", job.id)
            );
          }
          const results = await Promise.all(queries);
          const siblingRows = results.flatMap((r) => r.data || []);
          const seenIds = new Set();

          for (const sRow of siblingRows) {
            if (!sRow?.id || seenIds.has(sRow.id) || !sRow.data) continue;
            seenIds.add(sRow.id);
            const sJob = sRow.data;
            if (["completed", "invoiced", "paid", "cancelled"].includes(sJob.status)) continue;

            // Check if this sibling job belongs to the SAME engineer
            const sScopes = confirmationScopes(sJob, engineerById);
            const sHasThisEng = sScopes.some((s) => s.engineerId === sc.engineerId) ||
              sJob.engineerId === sc.engineerId ||
              (sJob.lineItems || []).some((l) => l.engineerId === sc.engineerId) ||
              (sJob.visits || []).some((v) => v.engineerId === sc.engineerId);

            // If job does NOT belong to this engineer, do NOT touch it!
            if (!sHasThisEng) continue;

            // Same engineer: mark their scopes as completed
            const sCompletions = { ...(sJob.cardCompletions || {}) };
            for (const s of sScopes) {
              if (s.engineerId === sc.engineerId) {
                sCompletions[s.key] = now;
                if (s.lineId) sCompletions[`line:${s.lineId}`] = now;
                if (s.visitId) sCompletions[`visit:${s.visitId}`] = now;
              }
            }
            sCompletions[sc.engineerId] = now;
            if (sScopes.some((s) => s.key === "job")) sCompletions.job = now;

            let sVisits = sJob.visits;
            if (Array.isArray(sJob.visits) && sJob.visits.length > 0) {
              sVisits = sJob.visits.map((v) => {
                if (v.engineerId === sc.engineerId) {
                  return { ...v, status: "completed", completedAt: v.completedAt || now };
                }
                return v;
              });
            }

            const candidateSibling = { ...sJob, cardCompletions: sCompletions, visits: sVisits };
            const sAssignedScopes = sScopes.filter((s) => s.engineerId && s.engineerId !== "unassigned");
            const sAllDone = sAssignedScopes.length > 0 && sAssignedScopes.every((s) => isScopeFinished(candidateSibling, s, engineerById));

            const sPatch = {
              cardCompletions: sCompletions,
              ...(sVisits ? { visits: sVisits } : {}),
              status: sAllDone ? "completed" : "in_progress",
              ...(sAllDone ? { completedAt: now } : {}),
              activity: [
                ...(sJob.activity || []),
                { id: "act-" + Date.now().toString(36), at: now, by: who, type: "status", title: `${who} finished on site (synced from ${job.id})` },
              ],
            };
            const nextSibling = reconcileJob(sJob, { ...sJob, ...sPatch, updatedAt: now }, sPatch);
            await supabaseAdmin.from("jobs").upsert({ id: sRow.id, data: nextSibling });
          }
        } catch (e) {
          console.error("Sibling sync error:", e);
        }
      }
      await pushToAll({ title: done ? "Engineer finished" : "Engineer arrived", body: `${who} ${done ? "has finished" : "is on site at"} ${job.id}${sc.sub ? ` · ${sc.sub}` : ""}`, url: `/jobs/${job.id}` }, { kind: "engineer_progress" });
      await within(runTaskSync({ force: true }));
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
    const file = { id: "att-" + Date.now().toString(36), name: safe, type: contentType, category: body.category || (contentType === "application/pdf" ? "certificate" : "evidence"), size: Math.round(base64.length * 0.75), url: pub.publicUrl, path, addedAt: now, by: who, fromEngineer: true };
    if (!(await save({ attachments: [file, ...(job.attachments || [])] }, `${who} uploaded ${safe}`))) return NextResponse.json({ error: "Couldn't save that — please send it to the office." }, { status: 502 });
    await pushToAll({ title: "Certificate uploaded", body: `${who} uploaded a document for ${job.id} — check it and send it.`, url: `/jobs/${job.id}` }, { kind: "engineer_progress" });
    await within(runTaskSync({ force: true }));
    return NextResponse.json({ ok: true });
  }

  // "I can't do this" — before accepting it's a decline, after accepting
  // it's a cancellation. Either way the job goes back to needing an
  // engineer and the office is told at once, whatever the hour.
  if (body.action === "decline") {
    const was = scopeAccepted(job, sc);
    const patch = was ? setScopeConfirmed(job, sc.key, false, engineerById) : {};

    // 1. Completely unassign line items for this engineer or scope
    patch.lineItems = (job.lineItems || []).map((l) =>
      (l.engineerId === sc.engineerId || l.id === sc.lineId || l.id === sc.key || (String(sc.key).startsWith("line:") && l.id === sc.key.slice(5)) || (sc.key === "job" && (!l.engineerId || l.engineerId === "unassigned")))
        ? { ...l, engineerId: "unassigned" }
        : l
    );

    // 2. Completely unassign visits for this engineer or scope if job has visits
    if (Array.isArray(job.visits) && job.visits.length) {
      patch.visits = job.visits.map((v) =>
        (v.engineerId === sc.engineerId || `visit:${v.id}` === sc.key || v.id === sc.visitId)
          ? { ...v, engineerId: "unassigned", engineerConfirmedAt: null, status: "pending" }
          : v
      );
    }

    // 3. Reset top-level engineerId if it matches this engineer or scope was 'job'
    if (job.engineerId === sc.engineerId || sc.key === "job") {
      patch.engineerId = "unassigned";
    }

    // 4. Remove all card confirmations, completions and arrivals for this engineer and key
    const cards = { ...(job.cardConfirmations || {}) };
    delete cards[sc.key];
    delete cards[sc.engineerId];
    if (sc.visitId) delete cards[`visit:${sc.visitId}`];
    if (sc.lineId) delete cards[`line:${sc.lineId}`];
    patch.cardConfirmations = cards;
    patch.engineerConfirmed = false;

    const completions = { ...(job.cardCompletions || {}) };
    delete completions[sc.key];
    delete completions[sc.engineerId];
    if (sc.visitId) delete completions[`visit:${sc.visitId}`];
    if (sc.lineId) delete completions[`line:${sc.lineId}`];
    patch.cardCompletions = completions;

    const arrivals = { ...(job.cardArrivals || {}) };
    delete arrivals[sc.key];
    delete arrivals[sc.engineerId];
    if (sc.visitId) delete arrivals[`visit:${sc.visitId}`];
    if (sc.lineId) delete arrivals[`line:${sc.lineId}`];
    patch.cardArrivals = arrivals;

    // 5. If no other assigned engineer remains on schedulable lines, revert scheduled to quote
    const remainingAssigned = (patch.lineItems || []).filter(
      (l) => l.engineerId && l.engineerId !== "unassigned" && !isAddonCode(l.code)
    );
    if (remainingAssigned.length === 0 && job.status === "scheduled") {
      patch.status = "quote";
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
    await within(runTaskSync({ force: true }));
    return NextResponse.json({ ok: true, declined: true });
  }

  if (scopeAccepted(job, sc)) return NextResponse.json({ ok: true, already: true });

  const patch = setScopeConfirmed(job, sc.key, true, engineerById);
  if (sc.key === "job") {
    patch.engineerId = sc.engineerId;
    patch.lineItems = (job.lineItems || []).map((l) =>
      (!l.engineerId || l.engineerId === "unassigned") ? { ...l, engineerId: sc.engineerId } : l
    );
  }
  if (patch.engineerConfirmed) {
    if (job.status === "quote") patch.status = "scheduled";
    if (!job.scheduledAt && job.preferredDate) {
      const time = job.preferredSlot === "Afternoon" ? "13:00:00.000Z" : "09:00:00.000Z";
      patch.scheduledAt = `${job.preferredDate}T${time}`;
      patch.windowPart = job.preferredSlot || "Morning";
      patch.windowFrom = job.preferredSlot === "Afternoon" ? "13:00" : "08:00";
      patch.windowTo = job.preferredSlot === "Afternoon" ? "18:00" : "13:00";
    }
  }
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
  await within(runTaskSync({ force: true }));
  return NextResponse.json({ ok: true });
}
