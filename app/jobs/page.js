"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiPlus, FiSearch, FiGrid, FiList, FiClipboard, FiBriefcase, FiColumns } from "react-icons/fi";
import JobFunnelView from "@/components/JobFunnelView";
import { useStore } from "@/lib/store";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { JOB_STAGES } from "@/lib/constants";
import { quoteStage, QUOTE_STAGES } from "@/lib/stages";
import { gbp, fmtDateTime, jobTags } from "@/lib/format";
import { jobEngineerIds } from "@/lib/visits";
import { nextAction, ACTION_GROUPS } from "@/lib/nextAction";
import PageHeader from "@/components/PageHeader";
import PeriodControls from "@/components/PeriodControls";
import { usePeriodRange } from "@/lib/usePeriodRange";
import { jobInRange } from "@/lib/stats";
import BankMatch from "@/components/BankMatch";
import JobCard from "@/components/JobCard";
import StatusBadge from "@/components/StatusBadge";
import { jobStage } from "@/lib/stages";
import JobModal from "@/components/JobModal";
import JobCardModal from "@/components/JobCardModal";
import Link from "next/link";
import { useSectionTour } from "@/components/OnboardingTour";
import JobsViewMenu from "@/components/JobsViewMenu";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { matchesQuery, sortJobs, SORTS, jobsCsv, downloadCsv, unseenIds, readViews, writeViews, DEFAULT_COLUMNS } from "@/lib/jobsView";

export default function JobsPage() {
  const { jobs: allJobs, clients, engineerById, engineers, updateJob } = useStore();
  const router = useRouter();
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
  // Opens on Quote → All quotes. It briefly opened on the To do "Everything"
  // list instead, and — worse — went back there every time you opened a job
  // and came back, throwing away whichever filter you'd picked. The To do
  // pills are still one click away; they're just not forced on you.
  // Whatever you pick is remembered for the session, so Back from a job
  // lands on the same list you left.
  const [statusFilter, setStatusFilterState] = useState("quote");
  const setStatusFilter = (v) => {
    setStatusFilterState(v);
    try { sessionStorage.setItem("lcl-jobs-filter", v); } catch {}
  };
  // The Dashboard's "Open quotes" card (and anything else linking with
  // ?status=…) was navigating here and being silently ignored — nothing ever
  // read the param back, so the link always landed on whatever the default
  // tab happened to be regardless of which status it promised.
  useEffect(() => {
    const s = searchParams?.get("status");
    if (s) { setStatusFilter(s); return; }
    try {
      const saved = sessionStorage.getItem("lcl-jobs-filter");
      if (saved) setStatusFilterState(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [view, setView] = useState("board");
  // How the list is ordered and drawn. Sort and density are remembered on
  // this device; saved views bundle filter + search + sort under a name.
  const [sort, setSort] = useState("default");
  const [compact, setCompactState] = useState(false);
  const [columns, setColumnsState] = useState(DEFAULT_COLUMNS);
  const [views, setViews] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const [owners, setOwners] = useState(() => new Map());
  useEffect(() => {
    try {
      setCompactState(localStorage.getItem("lcl-jobs-compact") === "1");
      const cols = JSON.parse(localStorage.getItem("lcl-jobs-columns") || "null");
      if (Array.isArray(cols) && cols.length) setColumnsState(cols);
      setSort(sessionStorage.getItem("lcl-jobs-sort") || "default");
    } catch {}
    setViews(readViews());
  }, []);
  const setCompact = (v) => { setCompactState(v); try { localStorage.setItem("lcl-jobs-compact", v ? "1" : "0"); } catch {} };
  const setColumns = (v) => { setColumnsState(v); try { localStorage.setItem("lcl-jobs-columns", JSON.stringify(v)); } catch {} };
  const changeSort = (v) => { setSort(v); try { sessionStorage.setItem("lcl-jobs-sort", v); } catch {} };
  // Who holds the open task on each job — shown on the card so "whose is
  // this?" doesn't need the Team page.
  useEffect(() => {
    if (!supabase) return;
    let off = false;
    supabase.from("tasks").select("data").then(({ data }) => {
      if (off) return;
      const m = new Map();
      for (const r of data || []) {
        const t = r.data;
        if (t && t.status !== "done" && t.linkedTo?.kind === "job" && t.assigneeName && !m.has(t.linkedTo.id)) m.set(t.linkedTo.id, t.assigneeName);
      }
      setOwners(m);
    }).catch(() => {});
    return () => { off = true; };
  }, []);

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
  // The next step for every job, worked out once. To-do ignores the period
  // filter on purpose: an unpaid invoice from March is still today's job.
  const clientOf = (j) => clients.find((c) => c.id === j.clientId);
  const nextByJob = useMemo(() => {
    const m = new Map();
    const byId = new Map(clients.map((c) => [c.id, c]));
    for (const j of jobs) {
      const c = byId.get(j.clientId);
      const a = nextAction(j, {
        engineerName: (id) => engineerById(id)?.name || "the engineer",
        clientEmail: c?.email || "",
        clientPhone: c?.phone || "",
        engineerById: (id) => engineerById(id),
        client: c,
      });
      if (a) m.set(j.id, a);
    }
    return m;
  }, [jobs, clients, engineerById]);

  const todoCounts = useMemo(() => {
    const c = { todo: nextByJob.size };
    for (const a of nextByJob.values()) c[a.group] = (c[a.group] || 0) + 1;
    return c;
  }, [nextByJob]);

  const isTodo = statusFilter === "todo" || statusFilter.startsWith("todo:");

  const jobMatchesStatus = (job, targetStatus) => {
    if (targetStatus === "todo") return nextByJob.has(job.id);
    if (targetStatus.startsWith("todo:")) return nextByJob.get(job.id)?.group === targetStatus.slice(5);
    if (targetStatus.startsWith("quote:")) return job.status === "quote" && quoteStage(job, undefined, clientOf(job)) === targetStatus.slice(6);
    // Tabs are STAGES: "Paid" is paid-but-not-yet-certified, "Certified" the rest.
    return targetStatus === "all" || jobStage(job) === targetStatus;
  };

  const filteredBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (isTodo ? jobs : inPeriod)
      .filter((j) => {
        if (!jobMatchesStatus(j, statusFilter)) return false;
        if (!q) return true;
        // Finds a job by reference, invoice number, name, phone, address
        // or postcode — however it was typed.
        return matchesQuery(j, clients.find((c) => c.id === j.clientId), q);
      })
      // Newest job first. Without this the list came back in whatever order
      // the store happened to hold (in practice job-id order, which is a
      // random 4-digit suffix), so a job raised today could land anywhere in
      // the list — you had to hunt for the one you just created.
      // To do: most urgent first, then oldest first — the job that's been
      // waiting longest is the one most likely to have been forgotten.
      // Everything else: newest first.
      .sort((a, b) => {
        if (isTodo) {
          const ua = nextByJob.get(a.id)?.severity === "urgent" ? 0 : 1;
          const ub = nextByJob.get(b.id)?.severity === "urgent" ? 0 : 1;
          if (ua !== ub) return ua - ub;
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod, jobs, clients, query, statusFilter, nextByJob]);
  const filtered = useMemo(() => sortJobs(filteredBase, sort), [filteredBase, sort]);
  const unseen = useMemo(() => unseenIds(filtered), [filtered]);

  // ── Saved views, export, selection ──
  const saveView = (name) => {
    const next = [...views.filter((v) => v.name !== name), { id: "v-" + Date.now().toString(36), name, statusFilter, query, sort }];
    setViews(next); writeViews(next);
    toast.success(`Saved view “${name}”.`);
  };
  const applyView = (v) => { setStatusFilter(v.statusFilter || "quote"); setQuery(v.query || ""); changeSort(v.sort || "default"); };
  const deleteView = (id) => { const next = views.filter((v) => v.id !== id); setViews(next); writeViews(next); };
  const exportList = (list = filtered) => {
    downloadCsv(`jobs-${new Date().toISOString().slice(0, 10)}.csv`, jobsCsv(list, { clients, engineerById, nextByJob }));
  };
  const toggleSelected = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedJobs = filtered.filter((j) => selected.has(j.id));
  const assignSelected = (engineerId) => {
    if (!engineerId) return;
    const ok = selectedJobs.filter((j) => ["quote", "scheduled"].includes(j.status) && !(j.visits || []).length);
    ok.forEach((j) => updateJob(j.id, { engineerId }));
    toast.success(`${ok.length} job${ok.length === 1 ? "" : "s"} assigned${ok.length < selectedJobs.length ? ` — ${selectedJobs.length - ok.length} skipped (finished, or split into visits)` : ""}.`);
    setSelected(new Set());
  };

  // ── Keyboard: / search · J K move · Enter open · N new job ──
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing) { if (e.key === "Escape") el.blur(); return; }
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("jobs-search")?.focus(); }
      else if (e.key === "j" || e.key === "k") { e.preventDefault(); setCursor((c) => Math.max(0, Math.min(filtered.length - 1, c + (e.key === "j" ? 1 : -1)))); }
      else if (e.key === "Enter" && cursor >= 0 && filtered[cursor]) router.push(`/jobs/${filtered[cursor].id}`);
      else if (e.key === "n") { e.preventDefault(); setModalOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, cursor, router]);
  useEffect(() => {
    if (cursor >= 0 && filtered[cursor]) document.getElementById(`job-row-${filtered[cursor].id}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, filtered]);

  // The list as currently filtered and ordered, remembered so a job page can
  // offer "previous / next in this list".
  useEffect(() => {
    try { sessionStorage.setItem("lcl-jobs-order", JSON.stringify(filtered.slice(0, 400).map((j) => j.id))); } catch {}
  }, [filtered]);

  // Counts follow the period as well — a "Paid 9" pill that ignored the
  // date filter would contradict the list sitting right under it.
  const counts = useMemo(() => {
    const c = { all: inPeriod.length };
    JOB_STAGES.forEach((s) => {
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
              id="jobs-search"
              className="input pl-9"
              placeholder="Search name, postcode, phone, invoice…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="input hidden h-10 w-auto sm:block" value={sort} onChange={(e) => changeSort(e.target.value)} aria-label="Sort jobs">
            {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <JobsViewMenu
            views={views} onApply={applyView} onSave={saveView} onDelete={deleteView}
            compact={compact} onCompact={setCompact}
            selecting={selecting} onSelecting={(v) => { setSelecting(v); if (!v) setSelected(new Set()); }}
            onExport={() => exportList()}
            view={view} columns={columns} onColumns={setColumns}
          />
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

        {/* To do — every job grouped by the one thing it needs next. */}
        <div className="mb-3 rounded-xl border border-navy-100 bg-white p-2.5 dark:bg-white/[0.03]">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-navy-500">To do</p>
          <div className="scroll-area flex gap-2 overflow-x-auto pb-0.5">
            <FilterPill
              active={statusFilter === "todo"}
              onClick={() => setStatusFilter("todo")}
              label="Everything"
              count={todoCounts.todo || 0}
            />
            {ACTION_GROUPS.filter((g) => todoCounts[g.key]).map((g) => (
              <FilterPill
                key={g.key}
                active={statusFilter === `todo:${g.key}`}
                onClick={() => setStatusFilter(`todo:${g.key}`)}
                label={g.label}
                count={todoCounts[g.key]}
                dot={{ rose: "bg-rose-500", amber: "bg-amber-500", blue: "bg-blue-500", purple: "bg-purple-500", green: "bg-brand-500" }[g.tone]}
              />
            ))}
          </div>
        </div>

        {/* Status filter pills */}
        <div className="jobs-status-filter scroll-area mb-5 flex gap-2 overflow-x-auto pb-1">
          <FilterPill
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="All"
            count={counts.all}
          />
          {JOB_STAGES.map((s) => (
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

        {/* Quote levels — a new enquiry, a quote waiting on the client and one
            they've promised to come back to are different piles of work. */}
        {(statusFilter === "quote" || statusFilter.startsWith("quote:")) && (
          <div className="-mt-3 mb-5 flex flex-wrap gap-2">
            <FilterPill active={statusFilter === "quote"} onClick={() => setStatusFilter("quote")} label="All quotes" count={counts.quote || 0} />
            {QUOTE_STAGES.map((q) => {
              const n = inPeriod.filter((j) => j.status === "quote" && quoteStage(j, undefined, clientOf(j)) === q.key).length;
              if (!n) return null;
              return (
                <FilterPill key={q.key} active={statusFilter === `quote:${q.key}`} onClick={() => setStatusFilter(`quote:${q.key}`)} label={q.label} count={n} />
              );
            })}
          </div>
        )}

        {statusFilter === "invoiced" && <BankMatch />}

        {selecting && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm dark:bg-white/[0.04]">
            <strong className="text-navy-900">{selected.size} selected</strong>
            <button type="button" className="text-xs font-semibold text-brand-700 underline" onClick={() => setSelected(new Set(filtered.map((j) => j.id)))}>Select all {filtered.length}</button>
            <span className="flex-1" />
            <select className="input h-8 w-auto py-0 text-xs" value="" disabled={!selected.size} onChange={(e) => assignSelected(e.target.value)} aria-label="Assign the selected jobs to an engineer">
              <option value="">Assign to engineer…</option>
              {engineers.filter((e) => e.availability !== "unavailable").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button type="button" className="btn-outline py-1.5 text-xs" disabled={!selected.size} onClick={() => exportList(selectedJobs)}>Export selected</button>
            <button type="button" className="btn-outline py-1.5 text-xs" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Done</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-navy-500">
            {isTodo && !query ? "All caught up — nothing needs doing right now." : "No jobs match your filters."}
          </div>
        ) : view === "funnel" ? (
          <JobFunnelView jobs={filtered} clients={clients} onJobCard={setCardJob} />
        ) : view === "board" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((job, i) => (
              <JobCard
                key={job.id} job={job} onJobCard={setCardJob}
                compact={compact} owner={owners.get(job.id)} unseen={unseen.has(job.id)} highlighted={i === cursor}
                selecting={selecting} selected={selected.has(job.id)} onToggle={toggleSelected}
              />
            ))}
          </div>
        ) : (
          <ListView jobs={filtered} clients={clients} onJobCard={setCardJob} columns={columns} owners={owners} nextByJob={nextByJob} unseen={unseen} cursor={cursor} selecting={selecting} selected={selected} onToggle={toggleSelected} />
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

function ListView({ jobs, clients, onJobCard, columns, owners, nextByJob, unseen, cursor, selecting, selected, onToggle }) {
  const { engineerById } = useStore();
  const router = useRouter();
  const has = (k) => columns.includes(k);
  const th = "px-4 py-2.5 font-semibold";
  return (
    <>
      <div className="space-y-3 sm:hidden">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onJobCard={onJobCard} owner={owners.get(job.id)} unseen={unseen.has(job.id)} selecting={selecting} selected={selected.has(job.id)} onToggle={onToggle} />
        ))}
      </div>
    <div className="card hidden overflow-hidden sm:block">
      <div className="scroll-area overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
            <tr>
              {selecting && <th className="w-8 px-3 py-2.5" />}
              <th className={th}>Job</th>
              {has("client") && <th className={th}>Client</th>}
              {has("postcode") && <th className={th}>Postcode</th>}
              {has("services") && <th className={th}>Services</th>}
              {has("engineer") && <th className={th}>Engineer</th>}
              {has("scheduled") && <th className={th}>Scheduled</th>}
              {has("next") && <th className={th}>Next step</th>}
              {has("owner") && <th className={th}>Owner</th>}
              {has("status") && <th className={th}>Status</th>}
              {has("price") && <th className={`${th} text-right`}>Price</th>}
              <th className={`${th} text-right`}>Card</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {jobs.map((job, i) => {
              const client = clients.find((c) => c.id === job.clientId);
              const engineers = jobEngineerIds(job).map(engineerById);
              const next = nextByJob.get(job.id);
              return (
                <tr
                  key={job.id}
                  id={`job-row-${job.id}`}
                  onClick={() => (selecting ? onToggle(job.id) : router.push(`/jobs/${job.id}`))}
                  className={`cursor-pointer transition hover:bg-navy-50 ${i === cursor ? "bg-brand-50/70" : ""}`}
                >
                  {selecting && (
                    <td className="px-3 py-2.5"><input type="checkbox" readOnly checked={selected.has(job.id)} aria-label={`Select ${job.id}`} /></td>
                  )}
                  <td className="px-4 py-2.5">
                    <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1.5 font-semibold text-navy-900 hover:text-brand-600" onClick={(e) => selecting && e.preventDefault()}>
                      {unseen.has(job.id) && <span className="h-2 w-2 rounded-full bg-blue-500" title="Changed since you last opened it" />}
                      {job.id}
                    </Link>
                  </td>
                  {has("client") && <td className="px-4 py-2.5 text-navy-700">{client?.name || "—"}</td>}
                  {has("postcode") && <td className="px-4 py-2.5 text-navy-600">{client?.properties?.find((p) => p.id === job.propertyId)?.postcode || "—"}</td>}
                  {has("services") && (
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {jobTags(job).map((t) => (
                          <span key={t.key} className="rounded bg-navy-50 px-1.5 py-0.5 text-[11px] text-navy-600">{t.label}</span>
                        ))}
                      </div>
                    </td>
                  )}
                  {has("engineer") && (
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-navy-700">
                        {engineers.map((e) => (
                          <span key={e.id} className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                            {e.name}
                          </span>
                        ))}
                      </span>
                    </td>
                  )}
                  {has("scheduled") && <td className="px-4 py-2.5 text-navy-600">{fmtDateTime(job.scheduledAt)}</td>}
                  {has("next") && <td className={`max-w-[16rem] truncate px-4 py-2.5 text-xs ${next?.severity === "urgent" ? "font-semibold text-rose-600" : "text-navy-600"}`} title={next?.detail || ""}>{next?.title || "—"}</td>}
                  {has("owner") && <td className="px-4 py-2.5 text-xs text-navy-600">{owners.get(job.id) || "—"}</td>}
                  {has("status") && <td className="px-4 py-2.5"><StatusBadge status={jobStage(job)} size="sm" /></td>}
                  {has("price") && <td className="tnum px-4 py-2.5 text-right font-semibold text-navy-900">{gbp(job.price)}</td>}
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
