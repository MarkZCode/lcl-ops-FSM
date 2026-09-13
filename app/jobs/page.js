"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPlus, FiSearch, FiGrid, FiList, FiClipboard, FiBriefcase, FiColumns } from "react-icons/fi";
import JobFunnelView from "@/components/JobFunnelView";
import { useStore } from "@/lib/store";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { JOB_STATUSES } from "@/lib/constants";
import { gbp, fmtDateTime, jobTags } from "@/lib/format";
import { jobEngineerIds } from "@/lib/visits";
import PageHeader from "@/components/PageHeader";
import PeriodControls from "@/components/PeriodControls";
import { usePeriodRange } from "@/lib/usePeriodRange";
import { jobInRange } from "@/lib/stats";
import JobCard from "@/components/JobCard";
import StatusBadge from "@/components/StatusBadge";
import JobModal from "@/components/JobModal";
import JobCardModal from "@/components/JobCardModal";
import Link from "next/link";
import { useSectionTour } from "@/components/OnboardingTour";

export default function JobsPage() {
  const { jobs: allJobs, clients } = useStore();
  const myEngId = useMyEngineerId();
  const jobs = useMemo(
    () => (myEngId ? allJobs.filter((j) => jobBelongsToEngineer(j, myEngId)) : allJobs),
    [allJobs, myEngId]
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [cardJob, setCardJob] = useState(null);
  const [query, setQuery] = useState("");
  // The global search in the top bar navigates here with ?q=… . Without
  // reading it back the page opened unfiltered and the search looked broken.
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams?.get("q");
    if (q) setQuery(q);
  }, [searchParams]);
  // Quote is the tab that actually needs attention day to day — jobs waiting
  // on a decision or still needing an engineer/date sorted out. Opening on
  // "All" buried that queue behind every scheduled/paid/cancelled job too.
  const [statusFilter, setStatusFilter] = useState("quote");
  // The Dashboard's "Open quotes" card (and anything else linking with
  // ?status=…) was navigating here and being silently ignored — nothing ever
  // read the param back, so the link always landed on whatever the default
  // tab happened to be regardless of which status it promised.
  useEffect(() => {
    const s = searchParams?.get("status");
    if (s) setStatusFilter(s);
  }, [searchParams]);
  const [view, setView] = useState("board");

  // Same Day/Week/Month/Year/Range control as Reports, and remembered the
  // same way. Defaults to "All" here — Reports opens on a month because it is
  // ABOUT a period, but a job list that hid everything outside this month the
  // first time you opened it would look like jobs had gone missing.
  const ctl = usePeriodRange("lcl-jobs-period", { defaultPeriod: "all" });

  const tour = useSectionTour("jobs", [
    {
      selector: ".jobs-status-filter",
      label: "Jobs",
      title: "Filter by status",
      body: "Use these pills to filter jobs — Quote, Scheduled, In Progress, Completed, Invoiced, Paid. Or view all at once.",
    },
    {
      selector: ".jobs-new-btn",
      label: "Jobs",
      title: "Create a new job",
      body: "Hit New job to raise a quote. Fill in the client, services, price and engineer — then it moves through the status pipeline.",
    },
    {
      selector: ".jobs-view-toggle",
      label: "Jobs",
      title: "Board or list view",
      body: "Switch between the Kanban board (see jobs by status) and a flat list for sorting and searching.",
    },
  ]);

  const cardClient = cardJob ? clients.find((c) => c.id === cardJob.clientId) : null;
  const cardProperty =
    cardClient?.properties.find((p) => p.id === cardJob?.propertyId) || null;

  // Jobs inside the selected period. Bucketed on the SAME date as Reports
  // (scheduled date, falling back to when it was raised) so the two pages
  // can never disagree about which period a job belongs to.
  //
  // OPEN WORK IS EXEMPT FROM THE RANGE. A date range is a way of looking BACK
  // at what happened; anything still live is something you must never be able
  // to lose sight of. Reviewing July–August was hiding a job booked for
  // September behind a "Scheduled 0" pill — the one thing on this page you can
  // still act on — and doing the same to a quote means forgetting to chase it.
  //
  // Open = awaiting a decision (quote), booked (scheduled) or being done
  // (in_progress). Everything else is history and follows the range.
  const ALWAYS_VISIBLE = ["quote", "scheduled", "in_progress"];
  const inPeriod = useMemo(
    () =>
      ctl.period === "all"
        ? jobs
        : jobs.filter((j) => ALWAYS_VISIBLE.includes(j.status) || jobInRange(j, ctl.range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, ctl.period, ctl.range]
  );


  // Helper: test if a job matches the active status filter pill.
  //
  // This used to have special cases for "scheduled" and "in_progress": a job
  // counted as Scheduled if EITHER its own status was "scheduled" OR it merely
  // had some visit with a booked date, even while the job's own status was
  // still "Quote" (not every visit staffed yet — see deriveJobStatus in
  // lib/visits.js). That put the same job in TWO tabs at once, with a "Quote"
  // badge on the card while it also sat in the Scheduled list and count —
  // reported directly: "why is Nirav Hathi in Quote AND Scheduled, I thought
  // the job was scheduled." A job's status is deliberately the ONE honest
  // answer to "what state is this job in" everywhere else in the app now
  // (the whole reason deriveJobStatus exists); the filter tabs have to agree
  // with the badge on the card, not run a second, looser definition that
  // disagrees with it.
  const jobMatchesStatus = (job, targetStatus) =>
    targetStatus === "all" || job.status === targetStatus;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inPeriod
      .filter((j) => {
        if (!jobMatchesStatus(j, statusFilter)) return false;
        if (!q) return true;
        const client = clients.find((c) => c.id === j.clientId);
        const hay = [
          j.id,
          client?.name,
          client?.company,
          ...(j.services || []),
          j.notes,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      // Newest job first. Without this the list came back in whatever order
      // the store happened to hold (in practice job-id order, which is a
      // random 4-digit suffix), so a job raised today could land anywhere in
      // the list — you had to hunt for the one you just created.
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [inPeriod, clients, query, statusFilter]);

  // Counts follow the period as well — a "Paid 9" pill that ignored the
  // date filter would contradict the list sitting right under it.
  const counts = useMemo(() => {
    const c = { all: inPeriod.length };
    JOB_STATUSES.forEach((s) => {
      c[s.key] = inPeriod.filter((j) => jobMatchesStatus(j, s.key)).length;
    });
    return c;
  }, [inPeriod]);

  return (
    <>
      {tour}
      <PageHeader
        icon={FiBriefcase}
        title="Jobs"
        subtitle={`${filtered.length} of ${inPeriod.length} shown${ctl.period === "all" ? "" : ` · ${ctl.range.label}`}`}
        actions={
          <button className="jobs-new-btn btn-primary" onClick={() => setModalOpen(true)}>
            <FiPlus /> <span className="hidden sm:inline">New job</span><span className="sm:hidden">New</span>
          </button>
        }
      />

      <div className="page">
        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-2 sm:justify-between sm:gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              className="input pl-9"
              placeholder="Search jobs, clients, services…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="jobs-view-toggle self-start sm:self-auto flex items-center gap-1 rounded-lg border border-navy-200 bg-white p-1">
            <button onClick={() => setView("board")}
              className={`grid h-8 w-8 place-items-center rounded-md ${view === "board" ? "bg-navy-800 text-white" : "text-navy-500"}`}
              aria-label="Board view" title="Card board">
              <FiGrid />
            </button>
            <button onClick={() => setView("funnel")}
              className={`grid h-8 w-8 place-items-center rounded-md ${view === "funnel" ? "bg-navy-800 text-white" : "text-navy-500"}`}
              aria-label="Funnel view" title="Funnel — drag to advance status">
              <FiColumns />
            </button>
            <button onClick={() => setView("list")}
              className={`grid h-8 w-8 place-items-center rounded-md ${view === "list" ? "bg-navy-800 text-white" : "text-navy-500"}`}
              aria-label="List view" title="Flat list">
              <FiList />
            </button>
          </div>
        </div>

        {/* Period selector — sits above the status pills because it scopes
            them: the pill counts are counts WITHIN the chosen period. */}
        <PeriodControls ctl={ctl} withAll className="mb-4" />

        {/* Status filter pills */}
        <div className="jobs-status-filter scroll-area mb-5 flex gap-2 overflow-x-auto pb-1">
          <FilterPill
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="All"
            count={counts.all}
          />
          {JOB_STATUSES.map((s) => (
            <FilterPill
              key={s.key}
              active={statusFilter === s.key}
              onClick={() => setStatusFilter(s.key)}
              label={s.label}
              count={counts[s.key]}
              dot={s.dot}
            />
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-navy-500">
            No jobs match your filters.
          </div>
        ) : view === "funnel" ? (
          <JobFunnelView jobs={filtered} clients={clients} onJobCard={setCardJob} />
        ) : view === "board" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} onJobCard={setCardJob} />
            ))}
          </div>
        ) : (
          <ListView jobs={filtered} clients={clients} onJobCard={setCardJob} />
        )}
      </div>

      <JobModal open={modalOpen} onClose={() => setModalOpen(false)} />
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

function FilterPill({ active, onClick, label, count, dot }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-navy-800 bg-navy-800 text-white"
          : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
      }`}
    >
      {dot && !active && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] ${
          active ? "bg-white/20" : "bg-navy-100 text-navy-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ListView({ jobs, clients, onJobCard }) {
  const { engineerById } = useStore();
  const router = useRouter();
  return (
    <>
      <div className="space-y-3 sm:hidden">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onJobCard={onJobCard} />
        ))}
      </div>
    <div className="card hidden overflow-hidden sm:block">
      <div className="scroll-area overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Job</th>
              <th className="px-4 py-2.5 font-semibold">Client</th>
              <th className="px-4 py-2.5 font-semibold">Services</th>
              <th className="px-4 py-2.5 font-semibold">Engineer</th>
              <th className="px-4 py-2.5 font-semibold">Scheduled</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              <th className="px-4 py-2.5 text-right font-semibold">Card</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {jobs.map((job) => {
              const client = clients.find((c) => c.id === job.clientId);
              const engineers = jobEngineerIds(job).map(engineerById);
              return (
                <tr
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                  className="cursor-pointer transition hover:bg-navy-50"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-semibold text-navy-900 hover:text-brand-600"
                    >
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-navy-700">{client?.name || "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {jobTags(job).map((t) => (
                        <span
                          key={t.key}
                          className="rounded bg-navy-50 px-1.5 py-0.5 text-[11px] text-navy-600"
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-navy-700">
                      {engineers.map((e) => (
                        <span key={e.id} className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: e.color }}
                          />
                          {e.name}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-navy-600">
                    {fmtDateTime(job.scheduledAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={job.status} size="sm" />
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-navy-900">
                    {gbp(job.price)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); onJobCard(job); }}
                      className="inline-grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-navy-500 hover:border-brand-300 hover:text-brand-600"
                      aria-label={`Job card for ${job.id}`}
                      title="Job card"
                    >
                      <FiClipboard />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
