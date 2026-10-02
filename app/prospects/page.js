"use client";

// Prospects — past compliance clients ranked by renewal urgency.
// Default sort: days-to-cert-expiry ascending. Filter chips up top
// (≤7d / ≤30d / ≤60d / ≤90d / All / Dormant) make the daily call list
// one click away. Click a row → DetailSlideOver with Cert history,
// timeline, and one primary action per pipeline stage.

import Link from "next/link";
import { forecast } from "@/lib/insights";
import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiUpload, FiTrash2, FiSearch, FiX, FiUserPlus, FiHome,
  FiTarget, FiChevronRight, FiSend, FiMail,
} from "react-icons/fi";
import { readLocal, readCloud, write as writePref, remove as removePref } from "@/lib/userPrefs";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import StageBadge from "@/components/StageBadge";
import OutreachToolbar from "@/components/OutreachToolbar";
import ProspectDetailPanel from "@/components/ProspectDetailPanel";
import ProspectCampaign from "@/components/ProspectCampaign";
import TaskCompletionBanner from "@/components/team/TaskCompletionBanner";
import RequirePermission from "@/components/RequirePermission";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  MONTHS, STAGES, serviceLabel,
  prospectsFromCSV, nextRenewalDue, urgencyBucket, currentCycleDue, prospectUrgencyScore, jobYear,
  outreachStepsDone, buildProspectWaMessage,
} from "@/lib/prospects";

const URGENCY_TABS = [
  { key: "overdue", label: "Overdue", danger: true, title: "Renewal has already lapsed." },
  { key: "d30", label: "Due in 30 days", highlight: true, title: "Renewal due within the next 30 days — your priority call list." },
  { key: "d60", label: "Due in 60 days", title: "Renewal due in 31–60 days." },
  { key: "d90", label: "Due in 90 days", title: "Renewal due in 61–90 days." },
  { key: "later", label: "Later", title: "Renewal due beyond 90 days." },
];

// Show the exact date the job was last done, formatted nicely. Handles the
// common UK "dd/mm/yyyy" and "dd-mm-yyyy" CSV formats. Falls back to raw
// string if we can't parse it. Returns an em-dash node if missing.
function formatLastDone(p) {
  const raw = (p?.jobDate || "").trim();
  if (!raw) return <span className="text-navy-300">—</span>;
  const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(raw);
  if (!m) return raw;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (isNaN(d)) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}


// Both filter hooks paint from localStorage synchronously (so the operator's
// last-used filters are visible instantly on refresh) and then reconcile with
// their Supabase user_metadata copy — that's what carries the same filters
// across devices and re-logins.
function useFilterSet(key) {
  const [value, setValue] = useState(() => new Set());
  const [mounted, setMounted] = useState(false);
  // The cloud fetch below is a network round-trip — it can resolve AFTER the
  // operator has already clicked a filter chip (e.g. clicked "All" to clear
  // one right after the page loaded). Without this guard, the cloud value
  // lands late and silently overwrites their click back to whatever was
  // persisted from a previous session/device — the filter LOOKS cleared for
  // a moment, then snaps back, with no visible error. That's exactly what
  // made a manually-added prospect "vanish" behind a stale GAS/service
  // filter the operator thought they'd already cleared.
  const userChangedRef = useRef(false);
  useEffect(() => {
    setMounted(true);
    const local = readLocal(key, (raw) => new Set(JSON.parse(raw)));
    if (local) setValue(local);
    readCloud(key).then((cloud) => {
      if (userChangedRef.current) return; // operator already acted — don't clobber it
      if (Array.isArray(cloud)) setValue(new Set(cloud));
    });
  }, [key]);
  const toggleValue = useCallback((item) => {
    userChangedRef.current = true;
    setValue((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      writePref(key, [...next], (v) => JSON.stringify(v));
      return next;
    });
  }, [key]);
  const clearValue = useCallback(() => {
    userChangedRef.current = true;
    setValue(new Set());
    removePref(key);
  }, [key]);
  const setOnlyValue = useCallback((item) => {
    userChangedRef.current = true;
    if (item === "all") {
      setValue(new Set());
      removePref(key);
    } else {
      setValue(new Set([item]));
      writePref(key, [item], (v) => JSON.stringify(v));
    }
  }, [key]);
  return [mounted ? value : new Set(), toggleValue, clearValue, setOnlyValue, setValue];
}

function useFilterString(key, initialValue) {
  const [value, setValue] = useState(initialValue);
  const [mounted, setMounted] = useState(false);
  // Same race as useFilterSet above — guard the same way.
  const userChangedRef = useRef(false);
  useEffect(() => {
    setMounted(true);
    const local = readLocal(key);
    if (local != null) setValue(local);
    readCloud(key).then((cloud) => {
      if (userChangedRef.current) return;
      if (typeof cloud === "string") setValue(cloud);
    });
  }, [key]);
  const update = useCallback((v) => {
    userChangedRef.current = true;
    setValue(v);
    writePref(key, v);
  }, [key]);
  return [mounted ? value : initialValue, update];
}

const gbpLocal = (n) => `£${(Number(n) || 0).toFixed(2)}`;

function ProspectsInner() {
  const ask = useConfirm();
  const {
    prospects, prospectsReady, importProspects, updateProspect, logProspectContact,
    removeProspect, clearProspects, convertProspectToJob, removeJob, email, templates,
    requestBigTables, jobs: ownJobs,
  } = useStore();
  // Certificates from our OWN finished jobs falling due — the same renewals,
  // from the other side. Shown here so both lists are worked together.
  const ownRenewals = useMemo(() => forecast(ownJobs || []), [ownJobs]);
  // This page reads the big prospect/lead tables, so ask for them. Pages
  // that don't never download them — see requestBigTables in lib/store.
  useEffect(() => { requestBigTables("prospects"); }, [requestBigTables]);
  const { can } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const staleMode = searchParams.get("filter") === "stale";

  const now = new Date();
  // Urgency filter defaults to "all" — every prospect matching Status/Year/
  // Service is visible unless the operator explicitly narrows by urgency.
  // Previously this defaulted to "this calendar month," which silently hid
  // the rest of the list and made data look missing.
  const [monthFilter, toggleMonthFilter, clearMonthFilter, setMonthFilter] = useFilterSet("month");
  // Optional secondary filter: which CALENDAR month (Jan–Dec, any year) the
  // due date falls in. Independent of the urgency chips above — layer it on
  // top when you want "show me everyone due in August" regardless of whether
  // that's 3 weeks or 8 months away.
  const [dueMonthFilter, toggleDueMonthFilter, clearDueMonthFilter, setDueMonthFilter] = useFilterSet("dueMonth"); // all | 0-11
  const [who, setWho] = useFilterString("who", "all"); // all | agents | landlords
  const [statusFilter, toggleStatusFilter, clearStatusFilter, setStatusFilter] = useFilterSet("status");
  const [yearFilter, toggleYearFilter, clearYearFilter, setYearFilter] = useFilterSet("year"); // all | "2022" | "2023" | ...
  const [serviceFilter, toggleServiceFilter, clearServiceFilter, setServiceFilter] = useFilterSet("service"); // all | "GAS" | "EICR" | ...
  const [stageFilter, toggleStageFilter, clearStageFilter, setStageFilter] = useFilterSet("stage"); // all | pipeline stage key
  const [outreachFilter, toggleOutreachFilter, clearOutreachFilter, setOutreachFilter] = useFilterSet("outreach"); // all | 0 | 1 | 2 | 3
  // Urgency chips were removed from the UI but a stale saved selection could
  // still filter results invisibly. One-shot clear on mount so anyone who
  // upgrades from the chip-era build sees everything again by default.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("lcl_prospects_month_purged_v1")) return;
    clearMonthFilter();
    try { localStorage.setItem("lcl_prospects_month_purged_v1", "1"); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);
  // Deep-link support: `?open=<id>` opens that specific prospect on mount
  // (used by task notifications so tapping the noti lands on the record).
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const found = prospects.find((p) => p.id === openId);
    if (found) setActive(found);
  }, [searchParams, prospects]);
  // `?q=` seeds the list filter, so arriving from the global search shows the
  // matching rows rather than dropping you into all 14,000 unfiltered.
  useEffect(() => {
    const term = searchParams.get("q");
    if (term) setQ(term);
  }, [searchParams]);
  const [selected, setSelected] = useState(() => new Set());
  const [soloRecipient, setSoloRecipient] = useState(null); // full prospect object for a single-recipient ProspectCampaign send
  // Visible-row cap — render in chunks so switching filters on 1000+ rows
  // doesn't stutter. Use the "Show more" button to expand.
  const [visibleCount, setVisibleCount] = useState(200);
  const [campaign, setCampaign] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef(null);

  // Median invoice amount per service — for estimating price when CSV is missing it.
  const medianByService = useMemo(() => {
    const byService = {};
    for (const p of prospects) {
      if (!p.invoiceAmount || p.invoiceAmount <= 0) continue;
      const svcs = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];
      for (const s of svcs) (byService[s] = byService[s] || []).push(p.invoiceAmount);
    }
    const out = {};
    for (const [s, amounts] of Object.entries(byService)) {
      const sorted = [...amounts].sort((a, b) => a - b);
      out[s] = sorted[Math.floor(sorted.length / 2)];
    }
    return out;
  }, [prospects]);

  // Track the most recent CSV import so the operator can undo it in one click.
  const [lastBatch, setLastBatch] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("lcl-prospect-last-batch") || "null"); } catch { return null; }
  });

  // ---- import ----
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const batchId = `b-${Date.now().toString(36)}`;
        const parsed = prospectsFromCSV(ev.target.result, { importBatchId: batchId });
        if (!parsed.length) { toast.error("No rows found in that CSV"); return; }
        const { added, skipped } = importProspects(parsed);
        const stamp = { batchId, count: added, filename: file.name, at: Date.now() };
        setLastBatch(stamp);
        try { localStorage.setItem("lcl-prospect-last-batch", JSON.stringify(stamp)); } catch {}
        toast.success(`Imported ${added} prospects${skipped ? ` · ${skipped} already existed` : ""}`);
      } catch (err) {
        toast.error("Could not parse CSV: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const undoLastImport = async () => {
    if (!lastBatch?.batchId) return;
    const toRemove = prospects.filter((p) => p.importBatchId === lastBatch.batchId).map((p) => p.id);
    if (!toRemove.length) { toast.error("Those rows are no longer in the database"); setLastBatch(null); return; }
    if (!await ask(`Undo last import — remove ${toRemove.length} prospects from "${lastBatch.filename}"?`)) return;
    clearProspects(toRemove);
    setLastBatch(null);
    try { localStorage.removeItem("lcl-prospect-last-batch"); } catch {}
    toast.success(`Removed ${toRemove.length} prospects from the last import`);
  };

  // ---- manual add ----
  const onAddProspect = (form) => {
    const now = new Date();
    const prospect = {
      id: "pr-manual-" + Date.now().toString(36),
      year: now.getFullYear(), month: now.getMonth() + 1,
      monthName: MONTHS[now.getMonth() + 1],
      jobDate: now.toISOString().slice(0, 10),
      ownerName: form.name, nameOnCert: form.name,
      ownerPhone: form.phone, tenantPhone: "",
      contactEmail: form.email, address: form.address,
      services: form.service ? [form.service] : [],
      primaryService: form.service || "CONFIRM",
      sizeTier: "", renewalCadenceMo: 12,
      jobStatus: "", statusBucket: "open",
      description: "", certRenewalDate: "",
      invoiceAmount: null, isAgent: false,
      stage: "new", lastContactedAt: null, contactLog: [],
      source: "manual", importedAt: new Date().toISOString(),
    };
    importProspects([prospect]);
    // Guarantee the new row is actually visible after adding it — a manually
    // added prospect (statusBucket "open", no service, this month's due
    // date) can easily fall outside whatever filters happen to be active
    // (e.g. a leftover "GAS" service filter from earlier browsing), making
    // it look like the add silently failed when it actually just isn't
    // showing. Clear every filter that could hide it and search for it by
    // name so it's the only row left on screen.
    clearStatusFilter();
    clearYearFilter();
    clearServiceFilter();
    clearStageFilter();
    clearOutreachFilter();
    clearMonthFilter();
    clearDueMonthFilter();
    setWho("all");
    setQ(form.name || "");
    toast.success(`Added ${form.name} — filters cleared so it's visible now`);
    setAdding(false);
  };

  // ---- urgency chips ----
  // Single dimension: how many days until (or since) renewal is due. Counts
  // MUST respect the active status/year/service filters too — otherwise a
  // chip shows a count that doesn't match what actually renders once those
  // filters narrow the set.
  const monthCounts = useMemo(() => {
    const c = { all: 0, overdue: 0, d30: 0, d60: 0, d90: 0, later: 0, dormant: 0, unknown: 0 };
    const n = new Date();
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) continue;
      if (yearFilter.size > 0 && !yearFilter.has(String(jobYear(p) || ""))) continue;
      if (serviceFilter.size > 0) {
        const svcs = p.services?.length ? p.services : [p.primaryService || ""];
        if (!svcs.some((s) => serviceFilter.has(s))) continue;
      }
      c.all++;
      c[urgencyBucket(p, n)]++;
    }
    return c;
  }, [prospects, who, statusFilter, yearFilter, serviceFilter]);

  // Due-month counts (calendar month of the due date, any year) — also
  // respects urgency chip + status/year/service so a chip never over-promises.
  const dueMonthCounts = useMemo(() => {
    const c = { all: 0 };
    for (let m = 1; m <= 12; m++) c[m] = 0;
    const n = new Date();
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) continue;
      if (yearFilter.size > 0 && !yearFilter.has(String(jobYear(p) || ""))) continue;
      if (serviceFilter.size > 0) {
        const svcs = p.services?.length ? p.services : [p.primaryService || ""];
        if (!svcs.some((s) => serviceFilter.has(s))) continue;
      }
      if (monthFilter.size > 0 && !monthFilter.has(urgencyBucket(p, n))) continue;
      const due = currentCycleDue(p, n);
      if (!due) continue;
      c.all++;
      c[due.getMonth() + 1]++;
    }
    return c;
  }, [prospects, who, statusFilter, yearFilter, serviceFilter, monthFilter]);

  // Service-filter counts — respect every other active filter so the badge on
  // each chip is honest.
  const serviceCounts = useMemo(() => {
    const c = { all: 0 };
    const n = new Date();
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) continue;
      if (yearFilter.size > 0 && !yearFilter.has(String(jobYear(p) || ""))) continue;
      if (monthFilter.size > 0 && !monthFilter.has(urgencyBucket(p, n))) continue;
      if (dueMonthFilter.size > 0) {
        const due = currentCycleDue(p, n);
        if (!due || !dueMonthFilter.has(due.getMonth() + 1)) continue;
      }
      c.all++;
      const svcs = p.services?.length ? p.services : [p.primaryService || ""];
      for (const s of svcs) if (s) c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [prospects, who, statusFilter, yearFilter, monthFilter, dueMonthFilter]);

  // Distinct job years (for the Year filter). Sorted desc — newest cohorts on top.
  const yearOptions = useMemo(() => {
    const set = new Set();
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      const y = jobYear(p);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [prospects, who]);

  const whoCounts = useMemo(() => {
    let a = 0, l = 0;
    for (const p of prospects) { if (p.isAgent) a++; else l++; }
    return { all: prospects.length, agents: a, landlords: l };
  }, [prospects]);

  // ---- filter + sort by urgency ----
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const n = new Date();
    const matches = prospects.filter((p) => {
      if (who === "agents" && !p.isAgent) return false;
      if (who === "landlords" && p.isAgent) return false;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) return false;
      if (yearFilter.size > 0 && !yearFilter.has(String(jobYear(p) || ""))) return false;
      if (serviceFilter.size > 0) {
        const svcs = p.services?.length ? p.services : [p.primaryService || ""];
        if (!svcs.some((s) => serviceFilter.has(s))) return false;
      }
      if (monthFilter.size > 0 && !monthFilter.has(urgencyBucket(p, n))) return false;
      if (dueMonthFilter.size > 0) {
        const due = currentCycleDue(p, n);
        if (!due || !dueMonthFilter.has(due.getMonth() + 1)) return false;
      }
      // Stale filter: contacted >7d ago, still in new/contacted, has a contact method.
      if (staleMode) {
        if (!["new", "contacted"].includes(p.stage)) return false;
        if (!p.lastContactedAt) return false;
        const age = Date.now() - new Date(p.lastContactedAt).getTime();
        if (age <= 7 * 86400000) return false;
      }
      if (stageFilter.size > 0 && !stageFilter.has(p.stage || "new")) return false;
      if (outreachFilter.size > 0 && !outreachFilter.has(outreachStepsDone(p))) return false;
      if (needle) {
        const hay = `${p.ownerName} ${p.nameOnCert} ${p.address} ${p.contactEmail} ${p.ownerPhone}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return matches.sort((a, b) => prospectUrgencyScore(a, n) - prospectUrgencyScore(b, n));
  }, [prospects, who, monthFilter, dueMonthFilter, statusFilter, yearFilter, serviceFilter, stageFilter, outreachFilter, q, staleMode]);

  // Reset the visible cap whenever the filter shape changes — otherwise the
  // user lands on a tiny chip but is still rendering 200 stale rows.
  useEffect(() => { setVisibleCount(200); }, [monthFilter, dueMonthFilter, statusFilter, who, q, yearFilter, serviceFilter, stageFilter, outreachFilter]);

  const statusCounts = useMemo(() => {
    const c = { won: 0, open: 0, lost: 0 };
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      const bucket = p.statusBucket || "open";
      if (c[bucket] != null) c[bucket]++;
    }
    return c;
  }, [prospects, who]);

  // Pipeline stage counts — respect every other active filter so the count on
  // each chip matches what you'd actually see after clicking it.
  const stageCounts = useMemo(() => {
    const c = { all: 0 };
    const n = new Date();
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) continue;
      if (yearFilter.size > 0 && !yearFilter.has(String(jobYear(p) || ""))) continue;
      if (serviceFilter.size > 0) {
        const svcs = p.services?.length ? p.services : [p.primaryService || ""];
        if (!svcs.some((s) => serviceFilter.has(s))) continue;
      }
      if (monthFilter.size > 0 && !monthFilter.has(urgencyBucket(p, n))) continue;
      if (dueMonthFilter.size > 0) {
        const due = currentCycleDue(p, n);
        if (!due || !dueMonthFilter.has(due.getMonth() + 1)) continue;
      }
      c.all++;
      const stage = p.stage || "new";
      c[stage] = (c[stage] || 0) + 1;
    }
    return c;
  }, [prospects, who, statusFilter, yearFilter, serviceFilter, monthFilter, dueMonthFilter]);

  // Outreach-progress counts — how many of the 3 channels (email/call/
  // whatsapp) have actually been used, per prospect. Respects every other
  // active filter, same pattern as the counts above.
  const outreachCounts = useMemo(() => {
    const c = { all: 0, 0: 0, 1: 0, 2: 0, 3: 0 };
    const n = new Date();
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) continue;
      if (yearFilter.size > 0 && !yearFilter.has(String(jobYear(p) || ""))) continue;
      if (serviceFilter.size > 0) {
        const svcs = p.services?.length ? p.services : [p.primaryService || ""];
        if (!svcs.some((s) => serviceFilter.has(s))) continue;
      }
      if (monthFilter.size > 0 && !monthFilter.has(urgencyBucket(p, n))) continue;
      if (dueMonthFilter.size > 0) {
        const due = currentCycleDue(p, n);
        if (!due || !dueMonthFilter.has(due.getMonth() + 1)) continue;
      }
      if (stageFilter.size > 0 && !stageFilter.has(p.stage || "new")) continue;
      c.all++;
      c[outreachStepsDone(p)]++;
    }
    return c;
  }, [prospects, who, statusFilter, yearFilter, serviceFilter, monthFilter, dueMonthFilter, stageFilter]);

  // selection
  const toggleSel = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPageSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleSelectAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allOnPageSelected) filtered.forEach((p) => next.delete(p.id));
    else filtered.forEach((p) => next.add(p.id));
    return next;
  });
  const clearSelection = () => setSelected(new Set());
  // Preserve the on-screen sort order (filtered is sorted by urgency =
  // days-until-due ascending) so the campaign send goes out in the same
  // order the operator sees on the list — nearest-due first. Using the
  // raw `prospects` array here would send in whatever DB fetch order it
  // came in, which is essentially random.
  const selectedProspects = useMemo(
    () => filtered.filter((p) => selected.has(p.id)),
    [filtered, selected]
  );

  return (
    <>
      <TaskCompletionBanner />
      <PageHeader
        title="Prospects"
        subtitle="Past compliance clients — ranked by renewal urgency"
        actions={
          <>
            <button className="btn-secondary flex items-center gap-2" onClick={() => setAdding(true)}>
              <FiUserPlus /> Add
            </button>
            {lastBatch?.batchId && (
              <button className="btn-secondary flex items-center gap-2" onClick={undoLastImport}
                title={`Undo "${lastBatch.filename}" — ${lastBatch.count} rows`}>
                <FiX /> Undo last import
              </button>
            )}
            {can("deleteRecords") && prospects.length > 0 && (
              <button className="btn-secondary flex items-center gap-2 text-rose-600" onClick={async () => {
                if (!await ask(`Clear ALL ${prospects.length} prospects from the database? This can't be undone.`)) return;
                clearProspects();
              }}>
                <FiTrash2 /> Clear all
              </button>
            )}
            {can("importData") && (
              <label className="btn-primary flex cursor-pointer items-center gap-2">
                <FiUpload /> Import CSV
                <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="hidden" />
              </label>
            )}
          </>
        }
      />
      {ownRenewals.renewalCount > 0 && (
        <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm sm:mx-8 dark:border-white/10 dark:bg-white/[0.03]">
          <span className="text-navy-700">Also due: <strong className="text-navy-900">{ownRenewals.renewalCount} certificate{ownRenewals.renewalCount === 1 ? "" : "s"}</strong> from our own completed jobs expire in the next 90 days ({gbpLocal(ownRenewals.renewalValue)} at last time&apos;s prices).</span>
          <Link href="/reports" className="text-xs font-semibold text-brand-600 hover:underline">See them in Reports → Insights</Link>
        </div>
      )}

      <div className="page">
        {staleMode && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
            <span className="font-semibold text-amber-800 dark:text-amber-200">Showing stale prospects — contacted &gt;7 days ago, still in new/contacted stage</span>
            <button className="ml-4 text-xs font-semibold text-amber-700 underline dark:text-amber-300" onClick={() => router.replace("/prospects")}>
              Clear filter
            </button>
          </div>
        )}
        {prospects.length === 0 && prospectsReady ? (
          <EmptyState onPick={can("importData") ? () => fileRef.current?.click() : null} />
        ) : prospects.length === 0 && !prospectsReady ? (
          <div className="py-20 space-y-3 px-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-navy-100 dark:bg-white/5 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
            ))}
            <p className="text-center text-xs text-navy-400 dark:text-slate-500 pt-2">Loading prospects from cloud...</p>
          </div>
        ) : (
          <>
            {/* who-filter — All / Letting agents / Landlords */}
            <div className="mb-3 inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
              {[
                ["all", `All (${whoCounts.all})`],
                ["agents", `Letting agents (${whoCounts.agents})`],
                ["landlords", `Landlords (${whoCounts.landlords})`],
              ].map(([code, label]) => (
                <button key={code} onClick={() => { setWho(code); clearSelection(); }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    who === code ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
                  }`}>{label}</button>
              ))}
            </div>

            {/* "Call this fortnight" banner — clickable focus mode that
                narrows the list to just the prospects due in the next 14
                days (no juggling month + status chips). */}
            <CallWeekBanner prospects={prospects} who={who} statusFilter={statusFilter}
              onFocus={(kind) => { toggleMonthFilter(kind === "overdue" ? "overdue" : "d30"); clearSelection(); }} />

            {/* Past-job status filter — only "Completed" jobs are renewable.
                Default to Completed so the operator isn't calling Quote/Work
                Order/Unsuccessful rows that never received a cert. */}
            <div className="mb-3 inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
              {[
                ["won",  `Completed (${statusCounts.won})`,  "Renewable — cert was issued"],
                ["open", `Quote / WO (${statusCounts.open})`, "Quote or Work Order — never delivered"],
                ["lost", `Unsuccessful (${statusCounts.lost})`, "Job didn't go ahead"],
                ["all",  "All",                              "Show everything"],
              ].map(([code, label, tip]) => (
                <button key={code} title={tip} onClick={() => { toggleStatusFilter(code); clearSelection(); }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter.has(code) ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
                  }`}>{label}</button>
              ))}
            </div>

            {/* Urgency chips removed — the "overdue / X days to go / X years
                to go" bucketing was confusing and users prefer picking a
                specific due month below. If any old urgency selection is
                still saved in prefs it stays in monthFilter and continues
                to filter results (used by CallWeekBanner + counts), but no
                UI surfaces it. Clear-all in the empty state resets it. */}

            {/* Due month — optional secondary filter, layered on top of the
                urgency chips above. Which CALENDAR month (any year) the
                renewal falls in — e.g. "show me everyone due in August"
                regardless of whether that's 3 weeks or 8 months out. Always
                shows all 12 months so nothing appears to vanish. */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400 mr-1">Due month</span>
              <Chip label="All months" count={dueMonthCounts.all || 0}
                active={dueMonthFilter.size === 0} onClick={() => { clearDueMonthFilter(); clearSelection(); }} />
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <Chip key={m} label={MONTHS[m]} count={dueMonthCounts[m] || 0}
                  active={dueMonthFilter.has(m)} onClick={() => { toggleDueMonthFilter(m); clearSelection(); }} />
              ))}
            </div>

            {/* Year filter — by the year the original job was done (jobDate). */}
            {yearOptions.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400 mr-1">Last done</span>
                <Chip label="All years" active={yearFilter.size === 0} onClick={() => { clearYearFilter(); clearSelection(); }} />
                {yearOptions.map((y) => (
                  <Chip key={y} label={String(y)} active={yearFilter.has(String(y))}
                    onClick={() => { toggleYearFilter(String(y)); clearSelection(); }} />
                ))}
              </div>
            )}

            {/* Service filter — by cert type. Order matches what shows up in
                the dataset most often. Counts respect every other filter. */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400 mr-1">Service</span>
              <Chip label="All services" count={serviceCounts.all || 0}
                active={serviceFilter.size === 0} onClick={() => { clearServiceFilter(); clearSelection(); }} />
              {/* Always show every tracked service, even at 0 for the current
                  combination — a vanishing chip reads as "this service isn't
                  tracked" rather than "no matches for this narrow filter." */}
              {["GAS", "EICR", "EPC", "FRA", "FSC", "PAT", "ALARM", "REMEDIAL", "CONFIRM"]
                .map((s) => (
                <Chip key={s} label={s} count={serviceCounts[s] || 0}
                  active={serviceFilter.has(s)} onClick={() => { toggleServiceFilter(s); clearSelection(); }} />
              ))}
            </div>

            {/* Pipeline stage filter — funnel view: how many in each outreach stage */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400 mr-1">Pipeline</span>
              <Chip label="All" count={stageCounts.all || 0}
                active={stageFilter.size === 0} onClick={() => { clearStageFilter(); clearSelection(); }} />
              {STAGES.map((s) => (
                <Chip key={s.key} label={s.label} count={stageCounts[s.key] || 0}
                  active={stageFilter.has(s.key)}
                  onClick={() => { toggleStageFilter(s.key); clearSelection(); }} />
              ))}
            </div>

            {/* Outreach-progress filter — how many of the 3 channels
                (email/call/whatsapp) have actually been used on this
                prospect, per the OutreachToolbar's own progress bar. */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400 mr-1">Outreach</span>
              <Chip label="All" count={outreachCounts.all || 0}
                active={outreachFilter.size === 0} onClick={() => { clearOutreachFilter(); clearSelection(); }} />
              <Chip label="0 done" count={outreachCounts[0] || 0}
                title="No channel used yet."
                active={outreachFilter.has(0)} onClick={() => { toggleOutreachFilter(0); clearSelection(); }} />
              <Chip label="1/3 done" count={outreachCounts[1] || 0}
                active={outreachFilter.has(1)} onClick={() => { toggleOutreachFilter(1); clearSelection(); }} />
              <Chip label="2/3 done" count={outreachCounts[2] || 0}
                active={outreachFilter.has(2)} onClick={() => { toggleOutreachFilter(2); clearSelection(); }} />
              <Chip label="3/3 done" count={outreachCounts[3] || 0}
                title="All 3 channels used — email, call, WhatsApp."
                active={outreachFilter.has(3)} onClick={() => { toggleOutreachFilter(3); clearSelection(); }} />
            </div>

            {/* search */}
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input className="input pl-9 w-full" placeholder="Search name, address, email, phone"
                  value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-700"><FiX /></button>}
              </div>
              <span className="ml-auto text-sm text-navy-500 dark:text-slate-400">{filtered.length} shown</span>
            </div>

            {/* list */}
            {!prospectsReady ? (
              <div className="py-10 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-navy-100 dark:bg-white/5 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
                ))}
                <p className="text-center text-xs text-navy-400 dark:text-slate-500 pt-2">Loading prospects…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-navy-500 dark:text-slate-400">
                <p>No prospects match these filters.</p>
                {yearFilter.size > 0 && (monthFilter.size > 0 || dueMonthFilter.size > 0) && (
                  <p className="mt-2 text-xs text-navy-400 dark:text-slate-500">
                    &quot;Last done&quot; (when the job was completed) and the due-date filters (when it&apos;s
                    next due) are independent — a job done in {[...yearFilter].join(", ")} can be due anytime. Try clearing one.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button onClick={() => { clearYearFilter(); clearMonthFilter(); clearDueMonthFilter(); clearServiceFilter(); clearStatusFilter(); clearStageFilter(); clearOutreachFilter(); clearSelection(); }} className="btn-outline">
                    Show everything
                  </button>
                  {yearFilter.size > 0 && (
                    <button onClick={() => { clearYearFilter(); clearSelection(); }} className="btn-outline">Clear year filter</button>
                  )}
                  {monthFilter.size > 0 && (
                    <button onClick={() => { clearMonthFilter(); clearSelection(); }} className="btn-outline">Clear urgency filter</button>
                  )}
                  {dueMonthFilter.size > 0 && (
                    <button onClick={() => { clearDueMonthFilter(); clearSelection(); }} className="btn-outline">Clear due-month filter</button>
                  )}
                  {serviceFilter.size > 0 && (
                    <button onClick={() => { clearServiceFilter(); clearSelection(); }} className="btn-outline">Clear service filter</button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <ProspectTable
                  rows={filtered.slice(0, visibleCount)}
                  onOpen={setActive}
                  selected={selected}
                  onToggle={toggleSel}
                  allOnPageSelected={allOnPageSelected}
                  onToggleAll={toggleSelectAll}
                  onEmail={setSoloRecipient}
                  fromName={email?.fromName}
                  medianByService={medianByService}
                  onLogContact={logProspectContact}
                />
                {filtered.length > visibleCount && (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <p className="text-xs text-navy-500 dark:text-slate-400">
                      Showing {visibleCount} of {filtered.length} — render-capped for speed.
                    </p>
                    <button className="btn-secondary text-xs" onClick={() => setVisibleCount((n) => n + 200)}>
                      Show 200 more
                    </button>
                    <button className="btn-secondary text-xs" onClick={() => setVisibleCount(filtered.length)}>
                      Show all
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Sticky bulk-action bar — outreach only, visible to agents too */}
      {selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 lg:bottom-6">
          <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2 shadow-soft dark:border-white/10 dark:bg-navy-800">
            <span className="px-2 text-sm font-semibold text-navy-800 dark:text-slate-100">{selected.size} selected</span>
            <button className="btn-primary text-xs" onClick={() => setCampaign(true)}>
              <FiSend className="h-3.5 w-3.5" /> Renewal email campaign
            </button>
            <button className="btn-ghost text-xs" onClick={clearSelection}>
              <FiX className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <ProspectDetailPanel
        prospect={active}
        onClose={() => setActive(null)}
        onEmail={setSoloRecipient}
        onLog={logProspectContact}
        onUpdate={(id, changes) => {
          // Moving backward in funnel (new/contacted/dnc) → remove linked job so
          // the Jobs board doesn't accumulate accidental quote/scheduled entries.
          const backStages = ["new", "contacted", "dnc"];
          const movingBack = changes.stage && backStages.includes(changes.stage);
          const linkedJobId = active?.convertedJobId;
          if (movingBack && linkedJobId) {
            removeJob(linkedJobId);
            changes = { ...changes, convertedJobId: null, convertedAt: null };
            toast.success("Stage reset — linked job removed");
          }
          updateProspect(id, changes);
          setActive((prev) => prev?.id === id ? { ...prev, ...changes } : prev);
        }}
        onRemove={can("deleteRecords") ? (id) => { removeProspect(id); setActive(null); } : null}
        onConvert={(id, { status = "quote" } = {}) => {
          const result = convertProspectToJob(id, { upliftPct: 0, status });
          if (result) {
            // Stay on prospects — just toast a link. Admin can go to Jobs when ready.
            const label = status === "scheduled" ? "Job booked" : "Quote created";
            toast.success(`${label} · ${result.job.id} — go to Jobs to process`);
            // Refresh the active prospect so stage badge updates in the panel
            setActive((prev) => prev?.id === id
              ? { ...prev, stage: status === "scheduled" ? "booked" : "interested", convertedJobId: result.job.id }
              : prev
            );
          }
        }}
        onToggleAgent={(id, isAgent) => {
          updateProspect(id, { isAgent });
          if (active?.id === id) setActive({ ...active, isAgent });
          toast.success(isAgent ? "Marked as letting agent" : "Marked as landlord");
        }}
        templates={templates}
        fromName={email?.fromName}
        medianByService={medianByService}
      />

      <ProspectCampaign
        open={campaign}
        onClose={() => setCampaign(false)}
        recipients={selectedProspects.length ? selectedProspects : filtered}
        email={email}
        onLog={logProspectContact}
      />

      <AddProspectModal open={adding} onClose={() => setAdding(false)} onSave={onAddProspect} />

      {/* Single-recipient send — same modal as the bulk campaign, just scoped
          to one hand-picked prospect (recipients=[p]). Previously this used a
          bare-bones QuickEmailModal with no templates, uplift, chase
          scheduling, or contacted-override — a genuinely different, thinner
          interface than the bulk flow for what's conceptually the same
          action. Reusing ProspectCampaign here means every fix made to the
          bulk path (dedup, the "Include already-contacted" override, the
          locked send button) automatically applies to solo sends too. */}
      <ProspectCampaign
        open={!!soloRecipient}
        onClose={() => setSoloRecipient(null)}
        recipients={soloRecipient ? [soloRecipient] : []}
        email={email}
        onLog={logProspectContact}
        title={`Email ${soloRecipient?.nameOnCert || soloRecipient?.ownerName || "prospect"}`}
      />
    </>
  );
}

class RowBoundary extends Component {
  constructor(props) { super(props); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e) { console.error("[ProspectRow]", this.props.id, e?.message); }
  render() {
    if (this.state.err) {
      const msg = `Row ${this.props.id} couldn't render — data may be malformed.`;
      // The same boundary now wraps a <tr> in the desktop table AND a <div>
      // in the phone list. A <tr> fallback outside a table is invalid markup
      // that React will drop, so the failure would vanish silently on mobile
      // — the one place a broken row most needs to announce itself.
      return this.props.as === "row" ? (
        <tr className="border-t border-navy-100 dark:border-white/10">
          <td colSpan={10} className="px-4 py-2 text-xs text-rose-500">{msg}</td>
        </tr>
      ) : (
        <div className="px-4 py-2 text-xs text-rose-500">{msg}</div>
      );
    }
    return this.props.children;
  }
}

function ProspectTable({ rows, onOpen, selected, onToggle, allOnPageSelected, onToggleAll, onEmail, fromName, medianByService, onLogContact }) {
  return (
    <>
    {/* Phone list — see .p-row in globals.css for why one table can't serve
        both widths. Same rows, same handlers, laid out for a 375px screen. */}
    <div className="m-group lg:hidden">
      {rows.map((p) => (
        <RowBoundary key={p.id} id={p.id}>
          <ProspectCardRow p={p} onOpen={onOpen}
            selected={selected.has(p.id)} onToggle={onToggle}
            onEmail={onEmail} fromName={fromName} medianByService={medianByService}
            onLogContact={onLogContact} />
        </RowBoundary>
      ))}
    </div>

    <div className="hidden overflow-x-auto rounded-xl border border-navy-200 bg-white lg:block dark:border-white/10 dark:bg-navy-900">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-navy-50 text-left text-navy-600 dark:bg-navy-900 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2.5 w-8">
              <input type="checkbox" checked={allOnPageSelected} onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer rounded border-navy-300" />
            </th>
            <th className="px-4 py-2.5 font-semibold">Contact / Property</th>
            <th className="px-4 py-2.5 font-semibold">Cert</th>
            <th className="px-4 py-2.5 font-semibold">Last job</th>
            <th className="px-4 py-2.5 font-semibold">Due</th>
            <th className="px-4 py-2.5 font-semibold">Stage / contact</th>
            <th className="px-4 py-2.5 font-semibold">Outreach</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <RowBoundary key={p.id} id={p.id} as="row">
              <ProspectRow p={p} onOpen={onOpen}
                selected={selected.has(p.id)} onToggle={onToggle}
                onEmail={onEmail} fromName={fromName} medianByService={medianByService} onLogContact={onLogContact} />
            </RowBoundary>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

// One prospect on a phone: who, how overdue, and the outreach buttons.
const ProspectCardRow = memo(function ProspectCardRow({ p, onOpen, selected, onToggle, onEmail, fromName, medianByService, onLogContact }) {
  const due = nextRenewalDue(p);
  const daysLeft = due ? Math.ceil((due - new Date()) / 86400000) : null;
  const svcs = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];
  const svcText = svcs.map(serviceLabel).join(", ") || "compliance certificate";
  const dueLabel = due ? due.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "soon";
  const daysTone =
    daysLeft == null ? "p-row-days-ok"
    : daysLeft < 0 || daysLeft <= 7 ? "p-row-days-over"
    : daysLeft <= 30 ? "p-row-days-soon" : "p-row-days-ok";

  return (
    <div className="p-row">
      <input
        type="checkbox" checked={selected} onChange={() => onToggle(p.id)}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-navy-300"
        aria-label={`Select ${p.ownerName || p.nameOnCert || "prospect"}`}
      />
      <div className="p-row-main" onClick={() => onOpen(p)}>
        <span className="p-row-name">
          {p.nameOnCert || p.ownerName || "—"}
          {p.isAgent && <FiHome className="ml-1 inline h-3 w-3 -translate-y-px text-brand-600" title="Letting agent" />}
        </span>
        <span className="p-row-addr">{p.address || "No address on file"}</span>
        <div className="p-row-meta">
          {svcs.slice(0, 3).map((sv) => <span key={sv} className="p-row-svc">{sv}</span>)}
          <StageBadge stage={p.stage} size="sm" />
        </div>
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <OutreachToolbar
            compact
            contact={{
              id: p.id, phone: p.ownerPhone || p.tenantPhone, email: p.contactEmail,
              name: p.nameOnCert || p.ownerName, address: p.address, service: svcText, dueLabel,
            }}
            fromName={fromName}
            waMessage={buildProspectWaMessage(p, fromName)}
            onEmail={() => onEmail(p)}
            contactLog={p.contactLog || []}
            onChannelClick={(channel) => onLogContact(p.id, { channel, note: `${channel} outreach` })}
          />
        </div>
      </div>
      <div className="p-row-right" onClick={() => onOpen(p)}>
        <span className="p-row-due">
          {due ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
        </span>
        {daysLeft != null && (
          <span className={`p-row-days ${daysTone}`}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`}
          </span>
        )}
      </div>
    </div>
  );
});

const ProspectRow = memo(function ProspectRow({ p, onOpen, selected, onToggle, onEmail, fromName, medianByService, onLogContact }) {
  const due = nextRenewalDue(p);
  const daysLeft = due ? Math.ceil((due - new Date()) / 86400000) : null;
  const svcs = p.services?.length ? p.services : [p.primaryService || "CONFIRM"];

  // Last invoice — actual amount or estimated from comparable jobs.
  const estAmt = p.invoiceAmount == null
    ? (svcs.map((s) => medianByService?.[s]).find(Boolean) ?? null)
    : null;
  const lastInvoice = p.invoiceAmount != null
    ? `£${p.invoiceAmount.toFixed(2)}`
    : estAmt != null ? `~£${estAmt.toFixed(0)}` : "—";

  const urgentBg =
    daysLeft != null && daysLeft <= 7 ? "bg-rose-50/60 dark:bg-rose-950/20"
    : daysLeft != null && daysLeft <= 30 ? "bg-amber-50/40 dark:bg-amber-950/15" : "";

  const lastContact = p.lastContactedAt ? new Date(p.lastContactedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

  // Pre-build a WhatsApp message — shared builder so this stays in sync with
  // the prospect detail panel's outreach message.
  const svcText = svcs.map(serviceLabel).join(", ") || "compliance certificate";
  const dueLabel = due ? due.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "soon";
  const waMessage = buildProspectWaMessage(p, fromName);

  return (
    <tr className={`border-t border-navy-100 dark:border-white/10 hover:bg-navy-50 dark:hover:bg-white/5 ${urgentBg}`}>
      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={() => onToggle(p.id)}
          className="h-4 w-4 cursor-pointer rounded border-navy-300" />
      </td>
      <td className="px-4 py-2.5 max-w-xs cursor-pointer" onClick={() => onOpen(p)}>
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-navy-900 dark:text-slate-100">{p.nameOnCert || p.ownerName || "—"}</span>
          {p.isAgent && <FiHome className="h-3 w-3 shrink-0 text-brand-600" title="Letting agent" />}
        </div>
        <div className="truncate text-xs text-navy-500 dark:text-slate-400">{p.address}</div>
      </td>
      <td className="px-4 py-2.5 cursor-pointer" onClick={() => onOpen(p)}>
        <div className="flex flex-wrap gap-1">
          {svcs.map((s) => <span key={s} className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-bold text-navy-700 dark:bg-white/10 dark:text-slate-300">{s}</span>)}
        </div>
      </td>
      <td className="tnum px-4 py-2.5 cursor-pointer" onClick={() => onOpen(p)} title={p.jobDate || ""}>
        <div className="text-sm font-medium text-navy-800 dark:text-slate-200">{lastInvoice}</div>
        <div className="text-xs text-navy-500 dark:text-slate-400">{formatLastDone(p)}</div>
      </td>
      <td className="tnum px-4 py-2.5 cursor-pointer text-right" onClick={() => onOpen(p)}>
        {due ? (
          <div>
            <div className="text-xs font-semibold text-navy-800 dark:text-slate-200">
              {due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            {daysLeft != null && (
              <div className={`inline-block rounded px-1.5 text-[11px] font-bold ${
                daysLeft < 0 ? "text-rose-600"
                : daysLeft <= 7 ? "text-rose-600"
                : daysLeft <= 30 ? "text-amber-600"
                : daysLeft <= 60 ? "text-blue-600"
                : "text-navy-400"
              }`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`}
              </div>
            )}
          </div>
        ) : <span className="text-navy-300">—</span>}
      </td>
      <td className="px-4 py-2.5 cursor-pointer" onClick={() => onOpen(p)}>
        <StageBadge stage={p.stage} size="sm" />
        <div className="mt-1 text-xs text-navy-500 dark:text-slate-400">{lastContact !== "—" ? `Last contact ${lastContact}` : "No contact logged"}</div>
      </td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <OutreachToolbar
          compact
          contact={{
            id: p.id, phone: p.ownerPhone || p.tenantPhone, email: p.contactEmail,
            name: p.nameOnCert || p.ownerName, address: p.address, service: svcText,
            dueLabel,
          }}
          fromName={fromName}
          waMessage={waMessage}
          onEmail={() => onEmail(p)}
          contactLog={p.contactLog || []}
          onChannelClick={(channel) => onLogContact(p.id, { channel, note: `${channel} outreach` })}
        />
      </td>
      <td className="px-4 py-2.5 cursor-pointer text-navy-400" onClick={() => onOpen(p)}><FiChevronRight /></td>
    </tr>
  );
});

function CallWeekBanner({ prospects, who, statusFilter, onFocus }) {
  const now = useMemo(() => new Date(), []);
  const counts = useMemo(() => {
    const TWO_WEEKS = 14 * 86400000;
    let overdue = 0, dueSoon = 0;
    for (const p of prospects) {
      if (who === "agents" && !p.isAgent) continue;
      if (who === "landlords" && p.isAgent) continue;
      if (statusFilter.size > 0 && !statusFilter.has(p.statusBucket || "open")) continue;
      const due = nextRenewalDue(p, now);
      if (!due) continue;
      const delta = due - now;
      if (delta < 0) overdue++;
      else if (delta <= TWO_WEEKS) dueSoon++;
    }
    return { overdue, dueSoon };
  }, [prospects, who, statusFilter, now]);

  if (counts.overdue === 0 && counts.dueSoon === 0) return null;
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {counts.overdue > 0 && (
        <button type="button" onClick={() => onFocus?.("overdue")}
          className="flex items-center justify-between rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-left transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:hover:bg-rose-500/15"
          title="Click to focus on overdue prospects.">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Overdue renewals · Focus →</div>
            <div className="text-sm text-rose-900 dark:text-rose-200">Reach out today — these certs already expired.</div>
          </div>
          <div className="text-3xl font-bold text-rose-700 dark:text-rose-300">{counts.overdue}</div>
        </button>
      )}
      {counts.dueSoon > 0 && (
        <button type="button" onClick={onFocus}
          className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
          title="Click to focus — narrows the list to just these prospects.">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Due within 14 days · Focus →</div>
            <div className="text-sm text-amber-900 dark:text-amber-200">Call these this fortnight to keep them on contract.</div>
          </div>
          <div className="text-3xl font-bold text-amber-700 dark:text-amber-300">{counts.dueSoon}</div>
        </button>
      )}
    </div>
  );
}

function Chip({ label, count, active, highlight, danger, onClick, title }) {
  return (
    <button onClick={onClick} title={title}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
        active
          ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
          : highlight
            ? "border-brand-300 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/5"
            : "border-navy-200 bg-white hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:hover:bg-white/5"
      }`}>
      {count != null && (
        <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
          danger && count > 0
            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
            : "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300"
        }`}>{count}</span>
      )}
      <span className="font-medium text-navy-800 dark:text-slate-200">{label}</span>
    </button>
  );
}

function AddProspectModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "", service: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = () => {
    if (!form.name.trim() || !form.phone.trim()) { toast.error("Name and phone are required"); return; }
    onSave(form);
    setForm({ name: "", phone: "", address: "", email: "", service: "" });
  };
  return (
    <Modal open={open} onClose={onClose} title="Add prospect"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit}>Add</button></>}>
      <div className="space-y-3">
        <div><label className="label">Name *</label><input className="input" value={form.name} onChange={set("name")} placeholder="e.g. John Smith" /></div>
        <div><label className="label">Phone *</label><input className="input" value={form.phone} onChange={set("phone")} placeholder="07xxx xxxxxx" /></div>
        <div><label className="label">Address</label><input className="input" value={form.address} onChange={set("address")} placeholder="Property address" /></div>
        <div><label className="label">Email</label><input className="input" value={form.email} onChange={set("email")} placeholder="email@example.com" /></div>
        <div>
          <label className="label">Service</label>
          <select className="input" value={form.service} onChange={set("service")}>
            <option value="">Confirm on call</option>
            {["GAS", "EICR", "EPC", "PAT", "FRA", "FSC", "ALARM", "EMLIGHT", "REMEDIAL"].map((s) => (
              <option key={s} value={s}>{serviceLabel(s)}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

function EmptyState({ onPick }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
      <div className="mx-auto mb-4 inline-block rounded-xl bg-brand-100 p-4 dark:bg-brand-500/15">
        <FiTarget className="text-2xl text-brand-600 dark:text-brand-400" />
      </div>
      <h3 className="mb-1 font-bold text-navy-900 dark:text-slate-100">No prospects yet</h3>
      <p className="mx-auto mb-6 max-w-md text-sm text-navy-600 dark:text-slate-400">
        Import a year&rsquo;s exported jobs CSV. Each row becomes a renewal prospect with renewal dates and contact details extracted automatically.
      </p>
      {onPick && (
        <button className="btn-primary inline-flex items-center gap-2" onClick={onPick}><FiUpload /> Import CSV</button>
      )}
    </div>
  );
}

export default function ProspectsPage() {
  return (
    <RequirePermission perm="prospects">
      <Suspense>
        <ProspectsInner />
      </Suspense>
    </RequirePermission>
  );
}
