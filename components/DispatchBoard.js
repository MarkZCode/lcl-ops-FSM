"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiClock, FiMapPin, FiClipboard, FiArrowRight, FiAlertTriangle, FiTarget } from "react-icons/fi";
import { isSameDay, parseISO, format } from "date-fns";
import { useStore } from "@/lib/store";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { UNASSIGNED_ENGINEER } from "@/lib/constants";
import { serviceShort, fmtTime, gbp } from "@/lib/format";
import { detectConflicts, isFromOutreach } from "@/lib/dispatch";
import { visitEntries } from "@/lib/visits";
import StatusBadge from "./StatusBadge";
import JobCardModal from "./JobCardModal";

// ServiceM8-style dispatch board: one column per engineer (+ Unassigned).
// Drag a job card onto another engineer's column to reassign it.
// (Job-card button per card opens the offer/assigned card modal.)
export default function DispatchBoard({ day }) {
  const { jobs, clients, updateJob, engineers } = useStore();
  const myEngId = useMyEngineerId();
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [cardJob, setCardJob] = useState(null);

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
  const reassign = (cardId, engineerId) => {
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

  return (
    <>
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
                <StatusBadge status={job.status} size="sm" />
              </span>
            </Link>
          );
        })
      )}
    </div>

    <div className="scroll-area hidden overflow-x-auto pb-2 lg:block">
      <div className="flex w-full gap-4" style={{ minWidth: "min-content" }}>
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
              className={`flex flex-1 min-w-[18rem] flex-col rounded-xl border bg-navy-50/50 transition ${
                isOver ? "border-brand-400 ring-2 ring-brand-400/30" : "border-navy-100"
              }`}
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
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-navy-500">
                  {colJobs.length}
                </span>
              </div>

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
                  return (
                    <div
                      key={job.id}
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
                          <StatusBadge status={job.status} size="sm" />
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
                          {(job.services || []).map(serviceShort).join(", ")}
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
