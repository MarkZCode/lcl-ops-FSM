"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FiClock, FiMapPin, FiClipboard, FiArrowRight, FiAlertTriangle, FiTarget, FiNavigation } from "react-icons/fi";
import { routeOrder, engineerUnavailable } from "@/lib/booking";
import { toast } from "@/lib/toast";
import { isSameDay, parseISO, format } from "date-fns";
import { useStore } from "@/lib/store";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { UNASSIGNED_ENGINEER } from "@/lib/constants";
import { fmtTime, gbp, jobTags } from "@/lib/format";
import { detectConflicts, isFromOutreach } from "@/lib/dispatch";
import { visitEntries, isVisitConfirmed, isSplit } from "@/lib/visits";
import { ukDateTimeToUtcIso } from "@/lib/ukTime";
import StatusBadge from "./StatusBadge";
import { jobStage } from "@/lib/stages";
import JobCardModal from "./JobCardModal";
import DispatchMap, { MAP_COLOURS, UNASSIGNED_COLOUR } from "./DispatchMap";

// ServiceM8-style dispatch board: one column per engineer (+ Unassigned).
// Drag a job card onto another engineer's column to reassign it.
// (Job-card button per card opens the offer/assigned card modal.)
export default function DispatchBoard({ day }) {
  const { jobs, clients, updateJob, engineers, rules, logActivity } = useStore();
  const myEngId = useMyEngineerId();
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [cardJob, setCardJob] = useState(null);
  // { [engineerId]: { [cardId]: stopNumber } } — the suggested visiting order
  // for a column, worked out from the postcodes on request.
  const [routes, setRoutes] = useState({});
  const [routing, setRouting] = useState("");
  // The map is part of the board: on unless someone has switched it off.
  const [showMap, setShowMapState] = useState(true);
  useEffect(() => { try { if (localStorage.getItem("lcl-dispatch-map") === "0") setShowMapState(false); } catch {} }, []);
  const setShowMap = (fn) => setShowMapState((prev) => {
    const next = typeof fn === "function" ? fn(prev) : fn;
    try { localStorage.setItem("lcl-dispatch-map", next ? "1" : "0"); } catch {}
    return next;
  });

  // Looks the day's postcodes up (postcodes.io — postcodes only, nothing
  // about the client) and numbers the cards nearest-first from the earliest
  // booking. A suggestion to read, not a reorder: times stay as booked.
  const suggestRoute = async (engId, colJobs) => {
    const withPc = colJobs
      .map((j) => {
        const c = clients.find((x) => x.id === j.clientId);
        return { id: j.id, postcode: c?.properties.find((p) => p.id === j.propertyId)?.postcode };
      })
      .filter((x) => x.postcode);
    if (withPc.length < 2) { toast("Needs at least two jobs with postcodes."); return; }
    setRouting(engId);
    try {
      const r = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: withPc.map((x) => x.postcode) }),
      });
      const d = await r.json();
      const pts = withPc.map((x, i) => ({ id: x.id, lat: d.result?.[i]?.result?.latitude, lng: d.result?.[i]?.result?.longitude }));
      const order = routeOrder(pts);
      if (order.length < 2) throw new Error("no coordinates");
      // Straight-line miles between consecutive stops — a guide to the gaps
      // in the day, not a sat-nav figure.
      const at = Object.fromEntries(pts.map((p) => [p.id, p]));
      const miles = (a, b) => {
        const R = 3958.8, rad = Math.PI / 180;
        const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
      };
      setRoutes((prev) => ({ ...prev, [engId]: Object.fromEntries(order.map((id, i) => [id, { stop: i + 1, miles: i > 0 ? miles(at[order[i - 1]], at[id]) : null }])) }));
    } catch {
      toast.error("Couldn't look those postcodes up — check they're complete.");
    } finally {
      setRouting("");
    }
  };

  // One card PER VISIT, not per job. A gas+EICR job split across two
  // engineers on two days has to appear twice — under each engineer, on each
  // day — or the whole point of splitting is lost. Unsplit jobs produce
  // exactly one entry, so this is a no-op for everything that existed before.
  //
  // Each entry is spread over its job so downstream card rendering (which
  // reads job fields directly) keeps working, with the visit's own engineer
  // and time taking precedence.
  const dayJobs = visitEntries(jobs)
    .filter((e) => e.scheduledAt && isSameDay(parseISO(e.scheduledAt), day))
    .map((e) => ({
      ...e.job,
      engineerId: e.engineerId,
      scheduledAt: e.scheduledAt,
      windowFrom: e.windowFrom,
      windowTo: e.windowTo,
      lineItems: e.lines,
      // Composite id so two visits of one job are distinct rows; `jobId`
      // stays the real job for links and drag-and-drop.
      id: e.synthetic ? e.job.id : e.key,
      jobId: e.job.id,
      visitId: e.synthetic ? null : e.visitId,
      visitStatus: e.status,
    }))
    .filter((j) => jobBelongsToEngineer(j, myEngId));

  // Flag jobs double-booked against another job for the same engineer.
  const conflicts = useMemo(() => detectConflicts(dayJobs), [dayJobs]);

  // A scoped engineer only sees their own column.
  const columns = myEngId
    ? engineers.filter((e) => e.id === myEngId)
    : [...engineers, UNASSIGNED_ENGINEER];
  const cardClient = cardJob ? clients.find((c) => c.id === cardJob.clientId) : null;
  const cardProperty =
    cardClient?.properties.find((p) => p.id === cardJob?.propertyId) || null;

  // `dragId` is a card id, which for a split job is "JOB-x:vis-y". Resolve it
  // back to the real record and move the VISIT's engineer, not the job's —
  // moving the job would silently reassign every other visit on it too.
  // Accepted work with no date yet — the tray on the left. Dropping one on
  // an engineer books it for this day, morning window, to be confirmed.
  const tray = myEngId ? [] : jobs.filter((j) => j.status === "quote" && j.acceptedAt && !j.scheduledAt && !isSplit(j));
  const reassign = (cardId, engineerId) => {
    if (String(cardId).startsWith("tray:")) {
      const jobId = cardId.slice(5);
      if (engineerId === "unassigned") return;
      updateJob(jobId, {
        engineerId,
        scheduledAt: ukDateTimeToUtcIso(format(day, "yyyy-MM-dd"), "08:00"),
        windowPart: "Morning", windowFrom: "08:00", windowTo: "13:00",
        engineerConfirmed: false,
      });
      logActivity(jobId, { type: "status", title: `Put on the board for ${format(day, "EEE d MMM")} (morning) — ${engineers.find((e) => e.id === engineerId)?.name || "engineer"} to confirm` });
      return;
    }
    const card = dayJobs.find((j) => j.id === cardId);
    if (!card) return;
    if (card.visitId) {
      const target = jobs.find((j) => j.id === card.jobId);
      if (!target) return;
      updateJob(card.jobId, {
        visits: (target.visits || []).map((v) =>
          v.id === card.visitId ? { ...v, engineerId } : v
        ),
      });
    } else {
      updateJob(card.jobId || cardId, { engineerId });
    }
  };

  const onDrop = (engineerId) => {
    if (dragId) reassign(dragId, engineerId);
    setDragId(null);
    setOverCol(null);
  };

  const moveJob = (cardId, engineerId) => reassign(cardId, engineerId);

  const canReassign = !myEngId && columns.length > 1;

  // Everything booked for this day, earliest first — the phone view.
  const agenda = [...dayJobs].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );

  // The day's visits as map pins: numbered in time order per engineer.
  const mapStops = showMap ? columns.flatMap((col, ci) =>
    agenda.filter((j) => (j.engineerId || "unassigned") === col.id).map((j, i) => {
      const c = clients.find((x) => x.id === j.clientId);
      const p = c?.properties.find((x) => x.id === j.propertyId);
      return {
        id: j.id, jobId: j.jobId || j.id, postcode: String(p?.postcode || "").trim().toUpperCase(), label: p?.label || c?.name || "",
        time: j.windowFrom || (j.scheduledAt ? format(parseISO(j.scheduledAt), "HH:mm") : ""),
        // The same colour as the engineer's column on the board.
        engineerId: col.id, engineerName: col.name, colour: col.id === "unassigned" ? UNASSIGNED_COLOUR : col.color || MAP_COLOURS[ci % MAP_COLOURS.length], n: i + 1,
      };
    })
  ).concat(
    // Accepted work with no date yet — shown as grey "?" dots, so you can
    // see which engineer is already going to be nearby before booking it.
    tray.map((j) => {
      const c = clients.find((x) => x.id === j.clientId);
      const p = c?.properties.find((x) => x.id === j.propertyId);
      return { id: `tray:${j.id}`, jobId: j.id, postcode: String(p?.postcode || "").trim().toUpperCase(), label: p?.label || c?.name || "", time: "To book", engineerId: "tray", engineerName: "To book", colour: "#64748b", n: "?" };
    })
  ) : [];

  return (
    <>
    {!myEngId && (
      <div className="mb-3 flex justify-end">
        <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => setShowMap((s) => !s)}>
          <FiMapPin className="mr-1.5 inline" />{showMap ? "Hide the map" : "Show the map"}
        </button>
      </div>
    )}
    {showMap && !myEngId && <DispatchMap stops={mapStops} />}
    {/* Phone: one agenda for the day. See .a-row in globals.css for why the
        column board doesn't translate to a 375px screen. */}
    <div className="m-group lg:hidden">
      {agenda.length === 0 ? (
        <p className="a-empty">Nothing booked for this day.</p>
      ) : (
        agenda.map((job) => {
          const client = clients.find((c) => c.id === job.clientId);
          const property = client?.properties.find((p) => p.id === job.propertyId);
          const eng = columns.find((c) => c.id === job.engineerId);
          const conflicted = conflicts.has(job.id);
          const start = job.windowFrom
            || (job.scheduledAt ? format(parseISO(job.scheduledAt), "HH:mm") : "");
          return (
            <Link key={job.id} href={`/jobs/${job.jobId || job.id}`} className="a-row">
              <span className="a-time">
                {start || "—"}
                {job.windowTo && <span className="a-time-sub">to {job.windowTo}</span>}
              </span>
              <span className="a-main">
                <span className="a-client">{client?.name || "Unknown client"}</span>
                <span className="a-where">
                  {[property?.label, property?.postcode].filter(Boolean).join(", ")
                    || "No address on file"}
                </span>
                <span className="a-eng">
                  <span className="a-dot" style={{ backgroundColor: eng?.color || "#94a3b8" }} />
                  {eng?.name || "Unassigned"}
                  {conflicted && (
                    <span className="ml-1 rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">
                      clash
                    </span>
                  )}
                </span>
              </span>
              {/* self-start, or the badge stretches to the full row height and
                  renders as a coloured block rather than a pill. */}
              <span className="shrink-0 self-start">
                <StatusBadge status={jobStage(job)} size="sm" />
              </span>
            </Link>
          );
        })
      )}
    </div>

    <div className="scroll-area hidden overflow-x-auto pb-2 lg:block">
      <div className="flex w-full gap-4" style={{ minWidth: "min-content" }}>
        {tray.length > 0 && (
          <div className="flex w-56 shrink-0 flex-col rounded-xl border border-dashed border-navy-200 bg-white/60 dark:bg-white/[0.02]">
            <div className="border-b border-navy-100 p-3">
              <p className="text-sm font-semibold text-navy-800">To book <span className="font-normal text-navy-500">· {tray.length}</span></p>
              <p className="text-[11px] text-navy-500">Accepted, no date. Drag onto an engineer.</p>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
              {tray.slice(0, 30).map((j) => {
                const c = clients.find((x) => x.id === j.clientId);
                const p = c?.properties?.find((x) => x.id === j.propertyId);
                return (
                  <div
                    key={j.id}
                    draggable
                    onDragStart={() => setDragId(`tray:${j.id}`)}
                    onDragEnd={() => setDragId(null)}
                    className={`cursor-grab rounded-lg border border-navy-100 bg-white p-2.5 text-xs shadow-card active:cursor-grabbing ${dragId === `tray:${j.id}` ? "opacity-50" : ""}`}
                  >
                    <Link href={`/jobs/${j.id}`} className="block truncate font-bold text-navy-900 hover:text-brand-600">{c?.name || j.id}</Link>
                    <p className="truncate text-navy-500">{jobTags(j).map((t) => t.label).join(", ")}</p>
                    <p className="truncate text-navy-400">{p?.postcode || "No postcode"}{j.deadline ? ` · needed by ${j.deadline}` : j.preferredDate ? ` · wants ${j.preferredDate}` : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {columns.map((eng) => {
          const colJobs = dayJobs
            .filter((j) => j.engineerId === eng.id)
            .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
          const isOver = overCol === eng.id;
          return (
            <div
              key={eng.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(eng.id);
              }}
              onDragLeave={() => setOverCol((c) => (c === eng.id ? null : c))}
              onDrop={() => onDrop(eng.id)}
              className={`flex flex-1 min-w-[18rem] flex-col rounded-xl border transition ${
                eng.id !== "unassigned" && engineerUnavailable(eng, day) ? "bg-navy-100/70 opacity-70" : "bg-navy-50/50"
              } ${isOver ? "border-brand-400 ring-2 ring-brand-400/30" : "border-navy-100"}`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between gap-2 border-b border-navy-100 p-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: eng.color }}
                  >
                    {eng.id === "unassigned"
                      ? "?"
                      : eng.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <span className="truncate text-sm font-semibold text-navy-800">
                    {eng.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {eng.id !== "unassigned" && colJobs.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => suggestRoute(eng.id, colJobs)}
                      disabled={routing === eng.id}
                      className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-navy-600 hover:border-brand-300 hover:text-brand-600"
                      title="Number these jobs in a sensible visiting order by postcode"
                    >
                      <FiNavigation className="h-3 w-3" /> {routing === eng.id ? "…" : "Route"}
                    </button>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${eng.id !== "unassigned" && colJobs.length > (Number(eng.dailyJobs) || Number(rules?.engineerDailyJobs) || 5) ? "bg-amber-100 text-amber-800" : "bg-white text-navy-500"}`}
                    title={eng.id !== "unassigned" && colJobs.length > (Number(eng.dailyJobs) || Number(rules?.engineerDailyJobs) || 5) ? `More than ${Number(eng.dailyJobs) || Number(rules?.engineerDailyJobs) || 5} jobs in one day` : undefined}
                  >
                    {colJobs.length}
                  </span>
                </span>
              </div>
              {colJobs.length > 0 && eng.id !== "unassigned" && (
                <p className="border-b border-navy-100 px-3 py-1 text-[11px] text-navy-500">
                  {fmtTime(colJobs[0].scheduledAt)} first{colJobs.length > 1 ? ` · ${fmtTime(colJobs[colJobs.length - 1].scheduledAt)} last` : ""}
                </p>
              )}
              {eng.id !== "unassigned" && engineerUnavailable(eng, day) && (
                <p className="border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700">
                  Off this day{engineerUnavailable(eng, day).note ? ` — ${engineerUnavailable(eng, day).note}` : ""}
                </p>
              )}

              {/* Cards */}
              <div className="flex-1 space-y-2 p-2">
                {colJobs.length === 0 && (
                  <p className="py-6 text-center text-xs text-navy-300">
                    Drop jobs here
                  </p>
                )}
                {colJobs.map((job) => {
                  const client = clients.find((c) => c.id === job.clientId);
                  const property = client?.properties.find(
                    (p) => p.id === job.propertyId
                  );
                  const conflicted = conflicts.has(job.id);
                  const visit = job.visitId ? (jobs.find((x) => x.id === job.jobId)?.visits || []).find((v) => v.id === job.visitId) : null;
                  const confirmed = eng.id !== "unassigned" && (visit ? isVisitConfirmed(visit) : !!job.engineerConfirmed);
                  return (
                    <div
                      key={job.id}
                      title={eng.id === "unassigned" ? undefined : confirmed ? "Engineer has confirmed" : "Engineer hasn't confirmed yet"}
                      style={eng.id === "unassigned" ? undefined : { borderLeftWidth: 3, borderLeftColor: confirmed ? "#3FA34D" : "#f59e0b" }}
                      draggable
                      onDragStart={() => setDragId(job.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`cursor-grab rounded-lg border bg-white p-3 shadow-card transition active:cursor-grabbing ${
                        conflicted ? "border-rose-300 ring-1 ring-rose-200" : "border-navy-100"
                      } ${dragId === job.id ? "opacity-50" : ""}`}
                    >
                      {conflicted && (
                        <p className="mb-1.5 flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-1 text-[10px] font-bold text-rose-700">
                          <FiAlertTriangle className="h-3 w-3 shrink-0" /> Overlaps another job
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-navy-600">
                          <FiClock className="h-3 w-3" />
                          {fmtTime(job.scheduledAt)}
                          {routes[eng.id]?.[job.id] && (
                            <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700" title="Suggested visiting order, and the straight-line distance from the stop before">
                              Stop {routes[eng.id][job.id].stop}{routes[eng.id][job.id].miles != null ? ` · ${routes[eng.id][job.id].miles.toFixed(1)} mi` : ""}
                            </span>
                          )}
                          {isFromOutreach(job) && (
                            <FiTarget className="h-3 w-3 text-brand-500" title="Booked from outreach" />
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCardJob(job);
                            }}
                            className="grid h-6 w-6 place-items-center rounded-md border border-navy-200 text-navy-400 hover:border-brand-300 hover:text-brand-600"
                            aria-label="Job card"
                            title="Job card"
                          >
                            <FiClipboard className="h-3 w-3" />
                          </button>
                          <StatusBadge status={jobStage(job)} size="sm" />
                        </span>
                      </div>
                      <Link
                        href={`/jobs/${job.jobId || job.id}`}
                        className="mt-1 block truncate text-sm font-bold text-navy-900 hover:text-brand-600"
                      >
                        {client?.name || job.jobId || job.id}
                      </Link>
                      <div className="flex items-center justify-between">
                        <p className="truncate text-[11px] text-navy-500">
                          {jobTags(job).map((t) => t.label).join(", ")}
                        </p>
                        {job.price > 0 && (
                          <span className="shrink-0 text-[11px] font-bold text-navy-700">{gbp(job.price)}</span>
                        )}
                      </div>
                      {property && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-navy-400">
                          <FiMapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{property.postcode}</span>
                        </p>
                      )}
                      {canReassign && (
                        <label className="mt-2 flex items-center gap-1.5 lg:hidden">
                          <FiArrowRight className="h-3 w-3 shrink-0 text-navy-400" />
                          <select
                            className="input h-7 min-w-0 flex-1 py-0 text-xs"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                moveJob(job.id, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            aria-label={`Move ${job.id} to another engineer`}
                          >
                            <option value="">Move to…</option>
                            {columns
                              .filter((c) => c.id !== eng.id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    <JobCardModal
      open={!!cardJob}
      onClose={() => setCardJob(null)}
      job={cardJob}
      client={cardClient}
      property={cardProperty}
    />
    </>
  );
}
