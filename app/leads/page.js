"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FiUpload, FiPhone, FiPhoneCall, FiMail, FiTrash2, FiZap,
  FiSearch, FiX, FiMessageCircle, FiChevronRight,
  FiGlobe, FiEdit2, FiCheck, FiSend, FiTarget, FiUsers, FiList, FiHeadphones,
} from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import DialerView from "@/components/DialerView";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import ManualDialerModal from "@/components/ManualDialerModal";
import RequirePermission from "@/components/RequirePermission";
import CampaignBuilder from "@/components/CampaignBuilder";
import QuickEmailModal from "@/components/QuickEmailModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { waLink } from "@/lib/whatsapp";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  coldLeadsFromCSV, coldLeadsFromCSVWithStats, MONTHS, STAGES, stageMeta,
  SEGMENTS, DEFAULT_SEGMENT, segmentMeta,
} from "@/lib/cold-leads";

export default function ColdLeadsPage() {
  return (
    <RequirePermission perm="prospects">
      <ColdLeadsInner />
    </RequirePermission>
  );
}

function ColdLeadsInner() {
  const ask = useConfirm();
  const leadParams = useSearchParams();
  const {
    coldLeads, coldLeadsReady, importColdLeads, updateColdLead, logColdLeadContact,
    removeColdLead, clearColdLeads, email,
    requestBigTables,
  } = useStore();
  // This page reads the big prospect/lead tables, so ask for them. Pages
  // that don't never download them — see requestBigTables in lib/store.
  useEffect(() => { requestBigTables("leads"); }, [requestBigTables]);
  const { can } = useAuth();

  // Treat any legacy row without `segment` as the default segment.
  const segmentOf = (l) => l.segment || DEFAULT_SEGMENT;

  const [view, setView] = useState("dialer"); // dialer (default) | list
  const [segmentTab, setSegmentTab] = useState("letting_agent");
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState("");
  const [fTrade, setFTrade] = useState("");   // engineer_recruit filter
  const [fHasPhone, setFHasPhone] = useState(false);
  const [fHasEmail, setFHasEmail] = useState(false);
  const [active, setActive] = useState(null);
  // Deep links from the global search: `?q=` seeds the filter and `?open=<id>`
  // opens that record. Without these, a search hit could only drop you on an
  // unfiltered 42,000-row list with no idea which one matched.
  useEffect(() => {
    const term = leadParams.get("q");
    if (term) { setQ(term); setView("list"); }
  }, [leadParams]);
  useEffect(() => {
    const openId = leadParams.get("open");
    if (!openId) return;
    const found = (coldLeads || []).find((l) => l.id === openId);
    // Jump to the segment the record actually lives in, or the tab filter
    // hides the very row we were asked to open.
    if (found) { setSegmentTab(segmentOf(found)); setActive(found); }
  }, [leadParams, coldLeads]);
  const [emailing, setEmailing] = useState(null); // lead being emailed in-app
  const [selected, setSelected] = useState(() => new Set());
  const [campaign, setCampaign] = useState(null); // {recipients, segment}
  // Cap rendered rows so the List view never freezes on thousands of leads.
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => { setVisibleCount(100); }, [segmentTab, q, fStage, fTrade, fHasPhone, fHasEmail, view]);
  useEffect(() => { setFTrade(""); }, [segmentTab]);
  const fileRef = useRef(null);

  // Import state
  const [importOpts, setImportOpts] = useState(null);
  const [importSource, setImportSource] = useState("");
  const [importSegment, setImportSegment] = useState(DEFAULT_SEGMENT);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportSource(file.name.replace(/\.csv$/i, ""));
      // If currently filtered to a specific segment, default import to that.
      setImportSegment(segmentTab || DEFAULT_SEGMENT);
      setImportOpts({ file, text: ev.target.result });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Track most recent CSV so the operator can undo with one click.
  const [lastBatch, setLastBatch] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("lcl-leads-last-batch") || "null"); } catch { return null; }
  });

  const doImport = () => {
    if (!importOpts) return;
    try {
      const batchId = `b-${Date.now().toString(36)}`;
      const { leads, stats } = coldLeadsFromCSVWithStats(importOpts.text, {
        source: importSource || importOpts.file.name,
        segment: importSegment,
        importBatchId: batchId,
      });
      if (!leads.length) { toast.error("No valid rows found"); return; }
      const { added, skipped: alreadyInDb } = importColdLeads(leads);
      const stamp = { batchId, count: added, filename: importOpts.file.name, at: Date.now() };
      setLastBatch(stamp);
      try { localStorage.setItem("lcl-leads-last-batch", JSON.stringify(stamp)); } catch {}
      // Build a full breakdown so the user can see WHERE rows went —
      // this is the answer to "1089 uploaded but only 890 shown".
      const lines = [
        `Imported: ${added}`,
        alreadyInDb && `Skipped (already in DB): ${alreadyInDb}`,
        stats.dupInCsv && `Duplicates inside this CSV: ${stats.dupInCsv}`,
        stats.noName && `Dropped (no name): ${stats.noName}`,
        stats.sponsored && `Dropped (sponsored placeholders): ${stats.sponsored}`,
      ].filter(Boolean);
      toast.success(`${added} imported · ${stats.totalRows - added - alreadyInDb} not added — see why below`);
      // Persistent breakdown in a confirm so it doesn't disappear in 3s.
      setTimeout(() => alert(`CSV row breakdown\n\nTotal rows: ${stats.totalRows}\n\n${lines.join("\n")}`), 100);
      setImportOpts(null);
    } catch (err) {
      toast.error("Could not parse CSV: " + err.message);
    }
  };

  // Segment counts (across all data, ignoring filters — used for tab badges)
  const segmentCounts = useMemo(() => {
    const c = { all: coldLeads.length };
    for (const s of SEGMENTS) c[s.code] = 0;
    for (const l of coldLeads) {
      const seg = segmentOf(l);
      c[seg] = (c[seg] || 0) + 1;
    }
    return c;
  }, [coldLeads]);

  // Filter pipeline
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = coldLeads.filter((l) => {
      if (segmentOf(l) !== segmentTab) return false;
      if (fStage && l.stage !== fStage) return false;
      if (fHasPhone && !l.phone) return false;
      if (fHasEmail && !l.email) return false;
      if (fTrade) {
        const lt = (l.trade || "").toUpperCase();
        const ls = (l.services || []).map((s) => s.toUpperCase());
        if (lt !== fTrade && !ls.includes(fTrade)) return false;
      }
      if (needle) {
        const hay = `${l.name} ${l.address} ${l.email} ${l.phone} ${l.source} ${l.postcode} ${l.category || ""} ${l.trade || ""} ${(l.services || []).join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // Sort commercial leads by tier (A→B→C) so Tier A surfaces first. Non-commercial
    // leads have tierSort=99 and sort to the back, preserving original import order.
    rows.sort((a, b) => (a.tierSort ?? 99) - (b.tierSort ?? 99));
    return rows;
  }, [coldLeads, segmentTab, q, fStage, fTrade, fHasPhone, fHasEmail]);

  const stageCounts = useMemo(() => {
    const c = {};
    for (const l of filtered) c[l.stage] = (c[l.stage] || 0) + 1;
    return c;
  }, [filtered]);

  const withPhone = filtered.filter((l) => l.phone).length;
  const withEmail = filtered.filter((l) => l.email).length;
  const hasFilters = q || fStage || fTrade || fHasPhone || fHasEmail;
  const resetFilters = () => { setQ(""); setFStage(""); setFTrade(""); setFHasPhone(false); setFHasEmail(false); };

  // Selection helpers
  const toggleSel = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allOnPageSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) filtered.forEach((l) => next.delete(l.id));
      else filtered.forEach((l) => next.add(l.id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const selectedLeads = useMemo(
    () => coldLeads.filter((l) => selected.has(l.id)),
    [coldLeads, selected]
  );
  const selectedWithEmail = selectedLeads.filter((l) => l.email);

  // Bulk actions
  const bulkMarkStage = (stage) => {
    selectedLeads.forEach((l) => updateColdLead(l.id, { stage }));
    toast.success(`Marked ${selectedLeads.length} leads as ${stage}`);
    clearSelection();
  };
  const bulkDelete = async () => {
    if (!await ask(`Delete ${selectedLeads.length} leads? This can't be undone.`)) return;
    selectedLeads.forEach((l) => removeColdLead(l.id));
    toast.success(`Deleted ${selectedLeads.length} leads`);
    clearSelection();
  };
  const openBulkEmail = () => {
    if (!selectedWithEmail.length) {
      toast.error("None of the selected leads have an email address");
      return;
    }
    setCampaign({
      recipients: selectedWithEmail,
      segment: segmentTab || DEFAULT_SEGMENT,
    });
  };

  return (
    <>
      <PageHeader
        icon={FiZap}
        title="Cold Leads"
        subtitle="Full sales pipeline — segment, bulk-email, sequence, AI call"
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="hidden" />
            {can("importData") && lastBatch?.batchId && (
              <button className="btn-secondary flex items-center gap-2" onClick={async () => {
                const toRemove = coldLeads.filter((l) => l.importBatchId === lastBatch.batchId).map((l) => l.id);
                if (!toRemove.length) { toast.error("Those rows are no longer in the database"); setLastBatch(null); return; }
                if (!await ask(`Undo last import — remove ${toRemove.length} leads from "${lastBatch.filename}"?`)) return;
                clearColdLeads(toRemove);
                setLastBatch(null);
                try { localStorage.removeItem("lcl-leads-last-batch"); } catch {}
                toast.success(`Removed ${toRemove.length} leads from the last import`);
              }}>
                <FiX /> Undo last import
              </button>
            )}
            {can("deleteRecords") && coldLeads.length > 0 && (
              <button className="btn-secondary flex items-center gap-2 text-rose-600" onClick={async () => {
                if (!await ask(`Clear ALL ${coldLeads.length} leads from the database? This can't be undone.`)) return;
                clearColdLeads();
              }}>
                <FiTrash2 /> Clear all
              </button>
            )}
            {can("importData") && (
              <button className="btn-primary flex items-center gap-2" onClick={() => fileRef.current?.click()}>
                <FiUpload /> Import CSV
              </button>
            )}
          </>
        }
      />

      <div className="page">
        {coldLeads.length === 0 && coldLeadsReady ? (
          <EmptyState onPick={can("importData") ? () => fileRef.current?.click() : null} />
        ) : coldLeads.length === 0 && !coldLeadsReady ? (
          <div className="py-20 space-y-3 px-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-navy-100 dark:bg-white/5 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
            ))}
            <p className="text-center text-xs text-navy-400 dark:text-slate-500 pt-2">Loading leads from cloud...</p>
          </div>
        ) : (
          <>
            {/* Dialer / List view toggle */}
            <div className="mb-4 inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
              <button onClick={() => setView("dialer")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === "dialer" ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
                }`}>
                <FiHeadphones className="h-3.5 w-3.5" /> Dialer
              </button>
              <button onClick={() => setView("list")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  view === "list" ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
                }`}>
                <FiList className="h-3.5 w-3.5" /> List
              </button>
            </div>

            {view === "dialer" ? (
              <DialerView
                leads={coldLeads.filter((l) => (l.segment || DEFAULT_SEGMENT) === segmentTab)}
                onLog={logColdLeadContact}
                onUpdate={updateColdLead}
                onEmail={setEmailing}
              />
            ) : (
            <>
            <SegmentTabs current={segmentTab} counts={segmentCounts} onPick={(t) => { setSegmentTab(t); clearSelection(); }} />

            {/* stats bar */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SmallStat label="Leads (filtered)" value={filtered.length} />
              <SmallStat label="Have phone" value={withPhone} sub={filtered.length ? `${Math.round(withPhone / filtered.length * 100)}%` : null} highlight />
              <SmallStat label="Have email" value={withEmail} sub={filtered.length ? `${Math.round(withEmail / filtered.length * 100)}%` : null} highlight />
              <SmallStat label="Contacted" value={stageCounts["contacted"] || 0} />
            </div>

            {/* stage chips */}
            <div className="mb-4 flex flex-wrap gap-2">
              <Chip label="All stages" value={filtered.length} active={!fStage} onClick={() => setFStage("")} />
              {STAGES.map((s) => (
                <Chip key={s.key} label={s.label} value={stageCounts[s.key] || 0}
                  color={s.color} active={fStage === s.key}
                  onClick={() => setFStage(fStage === s.key ? "" : s.key)} />
              ))}
            </div>

            {/* trade filter chips — engineer recruit only */}
            {segmentTab === "engineer_recruit" && (() => {
              const TRADES = ["GAS","EICR","FRA","EPC","PAT"];
              const counts = {};
              for (const l of coldLeads.filter((l) => segmentOf(l) === "engineer_recruit")) {
                const t = l.trade?.toUpperCase() || l.services?.[0];
                if (t) counts[t] = (counts[t] || 0) + 1;
              }
              const present = TRADES.filter((t) => counts[t]);
              if (!present.length) return null;
              return (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-navy-400">Trade:</span>
                  <button onClick={() => setFTrade("")}
                    className={`rounded-full px-3 py-0.5 text-xs font-bold border transition ${!fTrade ? "bg-navy-800 text-white border-navy-800" : "border-navy-200 text-navy-600 hover:bg-navy-50"}`}>
                    All
                  </button>
                  {present.map((t) => (
                    <button key={t} onClick={() => setFTrade(fTrade === t ? "" : t)}
                      className={`rounded-full px-3 py-0.5 text-xs font-bold border transition ${fTrade === t ? "bg-brand-600 text-white border-brand-600" : "border-navy-200 text-navy-600 hover:bg-navy-50"}`}>
                      {t} <span className="opacity-60">{counts[t]}</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* filters */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input className="input pl-9 w-72" placeholder="Search name, address, postcode…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <FilterToggle active={fHasPhone} onChange={setFHasPhone} icon={FiPhone} label="Has phone" />
              <FilterToggle active={fHasEmail} onChange={setFHasEmail} icon={FiMail} label="Has email" />
              {hasFilters && (
                <button className="btn-secondary" onClick={resetFilters}><FiX /> Clear</button>
              )}
              <span className="ml-auto text-sm text-navy-500 dark:text-slate-400">{filtered.length} leads</span>
            </div>

            {/* table */}
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-navy-500 dark:text-slate-400">No leads match these filters.</p>
            ) : (
              <>
              {/* Phone list. The table below is six columns wide — on a 375px
                  screen that is a sideways drag per record, across 42,000 of
                  them. Name and phone are what this list is for, so they lead;
                  tapping the row opens the full lead. */}
              <div className="m-group lg:hidden">
                {filtered.slice(0, visibleCount).map((l) => {
                  const isSel = selected.has(l.id);
                  const sm = segmentMeta(segmentOf(l));
                  const context = l.segment === "engineer_recruit"
                    ? [(l.trade?.toUpperCase() || l.services?.[0]), l.area].filter(Boolean).join(" · ")
                    : [l.category, l.address || l.area].filter(Boolean).join(" · ");
                  return (
                    <div key={l.id} className={`p-row ${isSel ? "bg-brand-50/60 dark:bg-brand-500/10" : ""}`}>
                      <input
                        type="checkbox" checked={isSel} onChange={() => toggleSel(l.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-navy-300"
                        aria-label={`Select ${l.name || "lead"}`}
                      />
                      <div className="p-row-main" onClick={() => setActive(l)}>
                        <span className="p-row-name">
                          {l.name || "—"}
                          {l.tier && (
                            <span className={`ml-1.5 rounded px-1.5 py-0 text-[10px] font-bold ${
                              l.tier === "A" ? "bg-emerald-100 text-emerald-700" :
                              l.tier === "B" ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-600"}`}>{l.tier}</span>
                          )}
                        </span>
                        <span className="p-row-addr">{context || "No details on file"}</span>
                        <div className="p-row-meta">
                          <span className="p-row-svc">{sm.short}</span>
                          <StagePill l={l} onStage={updateColdLead} />
                        </div>
                        {l.phone && (
                          <a
                            href={`tel:${l.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-navy-200 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:border-white/10"
                          >
                            <FiPhone className="h-3 w-3" /> {l.phone}
                          </a>
                        )}
                      </div>
                      <FiChevronRight className="m-row-chev mt-1 h-4 w-4" onClick={() => setActive(l)} />
                    </div>
                  );
                })}
                {filtered.length > visibleCount && (
                  <div className="border-t border-navy-100 p-3 text-center text-xs text-navy-500 dark:border-white/10">
                    Showing {visibleCount} of {filtered.length}.{" "}
                    <button className="font-semibold text-brand-600" onClick={() => setVisibleCount((n) => n + 200)}>Show 200 more</button>
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-navy-200 bg-white lg:block dark:border-white/10 dark:bg-navy-900">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-navy-50 text-left text-navy-600 dark:bg-navy-900 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2.5 w-8">
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll}
                          className="h-4 w-4 cursor-pointer rounded border-navy-300" />
                      </th>
                      <th className="px-4 py-2.5 font-semibold">Contact / Address</th>
                      <th className="px-4 py-2.5 font-semibold">Segment</th>
                      <th className="px-4 py-2.5 font-semibold">Phone</th>
                      <th className="px-4 py-2.5 font-semibold">Email</th>
                      <th className="px-4 py-2.5 font-semibold">Stage</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, visibleCount).map((l) => {
                      const isSel = selected.has(l.id);
                      const sm = segmentMeta(segmentOf(l));
                      return (
                        <tr key={l.id} onClick={() => setActive(l)}
                            className={`cursor-pointer border-t border-navy-100 transition dark:border-white/10 ${isSel ? "bg-brand-50/60 dark:bg-brand-500/10" : "hover:bg-navy-50 dark:hover:bg-white/5"}`}>
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleSel(l.id)}
                              className="h-4 w-4 cursor-pointer rounded border-navy-300" />
                          </td>
                          <td className="px-4 py-2.5 max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-navy-900 truncate dark:text-slate-100">{l.name}</span>
                              {l.tier && (
                                <span className={`shrink-0 rounded px-1.5 py-0 text-[10px] font-bold ${
                                  l.tier === "A" ? "bg-emerald-100 text-emerald-700" :
                                  l.tier === "B" ? "bg-amber-100 text-amber-700" :
                                  "bg-slate-100 text-slate-600"
                                }`}>{l.tier}</span>
                              )}
                            </div>
                            <div className="text-xs text-navy-500 truncate dark:text-slate-400">
                              {l.segment === "engineer_recruit"
                                ? [(l.trade?.toUpperCase() || l.services?.[0]), l.area].filter(Boolean).join(" · ")
                                : l.category
                                  ? `${l.category} · ${l.address || l.area || ""}`
                                  : (l.address || l.area || "")}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-bold text-navy-700 dark:bg-white/10 dark:text-slate-300">
                              {sm.short}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {l.phone ? (
                              <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()}
                                 className="font-medium text-brand-600 hover:underline">{l.phone}</a>
                            ) : <span className="text-navy-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 max-w-[280px]">
                            {l.email ? (
                              <span className="truncate block text-navy-700 dark:text-slate-300">{l.email}</span>
                            ) : <span className="text-navy-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <StagePill l={l} onStage={updateColdLead} />
                          </td>
                          <td className="px-4 py-2.5 text-navy-400"><FiChevronRight /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > visibleCount && (
                  <div className="border-t border-navy-100 p-3 text-center text-xs text-navy-500 dark:border-white/10 dark:text-slate-400">
                    Showing {visibleCount} of {filtered.length}.{" "}
                    <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisibleCount((n) => n + 200)}>Show 200 more</button>
                    {filtered.length <= 2000 && <>{" · "}<button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisibleCount(filtered.length)}>Show all</button></>}
                  </div>
                )}
              </div>
              </>
            )}
            </>
            )}
          </>
        )}
      </div>

      {/* Sticky bulk-action bar (always rendered, slides in when leads selected) */}
      {selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 lg:bottom-6">
          <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-white px-3 py-2 shadow-soft dark:border-white/10 dark:bg-navy-800">
            <span className="px-2 text-sm font-semibold text-navy-800 dark:text-slate-100">
              {selected.size} selected
            </span>
            <button className="btn-primary text-xs" onClick={openBulkEmail}>
              <FiSend className="h-3.5 w-3.5" /> Email campaign
            </button>
            <button className="btn-secondary text-xs" onClick={() => bulkMarkStage("contacted")} title="Mark as contacted">
              Mark contacted
            </button>
            <button className="btn-secondary text-xs text-rose-600" onClick={() => bulkMarkStage("dnc")} title="Mark do-not-contact">
              DNC
            </button>
            {can("deleteRecords") && (
              <button className="btn-ghost text-xs text-rose-600" onClick={bulkDelete}>
                <FiTrash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            <button className="btn-ghost text-xs" onClick={clearSelection}>
              <FiX className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <ContactCard
        lead={active}
        onClose={() => {
          if (active) setActive(coldLeads.find((l) => l.id === active.id) || null);
          setActive(null);
        }}
        onLog={logColdLeadContact}
        onUpdate={updateColdLead}
        onRemove={can("deleteRecords") ? (id) => { removeColdLead(id); setActive(null); } : null}
        onEmail={setEmailing}
        fromName={email?.fromName}
      />

      {/* In-app email composer — no external Mail app, sends via /api/send-email */}
      <QuickEmailModal
        open={!!emailing}
        onClose={() => setEmailing(null)}
        contact={emailing ? { id: emailing.id, name: emailing.name, email: emailing.email, address: emailing.address } : null}
        defaultSubject={emailing?._subject || "Landlord compliance certificates — Landlord Compliance London"}
        defaultBody={emailing?._body || (emailing ? `Hi ${(emailing.name || "there").split(/\s+/)[0]},\n\nI'm reaching out from Landlord Compliance London. We help landlords and letting agents stay fully compliant — Gas Safety (CP12), EICR, EPC, PAT, Fire Risk Assessments and more — across all London boroughs, often same-day.\n\nWould you like a quick quote or to book a certificate?` : "")}
        campaignLabel="cold-lead"
        onSent={() => { if (emailing) logColdLeadContact(emailing.id, { channel: "email", note: "Manual email sent" }, "contacted"); }}
      />

      <CampaignBuilder
        open={!!campaign}
        onClose={() => setCampaign(null)}
        recipients={campaign?.recipients || []}
        segment={campaign?.segment}
        email={email}
        leadKind="cold"
        onLog={logColdLeadContact}
      />

      {/* Import modal */}
      <Modal open={!!importOpts} onClose={() => setImportOpts(null)} title="Import cold leads"
        footer={
          <div className="flex w-full gap-2">
            <button className="btn-secondary" onClick={() => setImportOpts(null)}>Cancel</button>
            <button className="btn-primary ml-auto" onClick={doImport}>Import</button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-navy-600 dark:text-slate-400">
            File: <strong>{importOpts?.file?.name}</strong>
          </p>
          <div>
            <label className="label">Segment (default — overridden by `segment` column in CSV)</label>
            <select className="input" value={importSegment} onChange={(e) => setImportSegment(e.target.value)}>
              {SEGMENTS.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Source label</label>
            <input className="input" value={importSource} onChange={(e) => setImportSource(e.target.value)}
              placeholder="e.g. Google Maps London Jun 2026" />
            <p className="mt-1 text-xs text-navy-500 dark:text-slate-400">Shows in the Source column so you know which batch each lead came from.</p>
          </div>
          <p className="text-xs text-navy-500 dark:text-slate-400">
            Re-uploading the same file is safe — duplicates are skipped automatically.
          </p>
        </div>
      </Modal>
    </>
  );
}

function SegmentTabs({ current, counts, onPick }) {
  const tabs = SEGMENTS;
  return (
    <div className="mb-5 flex flex-wrap gap-1.5 border-b border-navy-100 dark:border-white/10">
      {tabs.map((t) => {
        const active = current === t.code;
        const n = counts[t.code] || 0;
        return (
          <button
            key={t.code}
            onClick={() => onPick(t.code)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              active
                ? "border-brand-500 text-navy-900 dark:text-white"
                : "border-transparent text-navy-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              active ? "bg-brand-500 text-white" : "bg-navy-100 text-navy-600 dark:bg-white/10 dark:text-slate-400"
            }`}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function SmallStat({ label, value, sub, highlight }) {
  return (
    <div className="rounded-xl border border-navy-200 bg-white p-4 dark:border-white/10 dark:bg-navy-900">
      <div className={`text-2xl font-bold ${highlight ? "text-brand-600" : "text-navy-900 dark:text-slate-100"}`}>
        {value}{sub && <span className="ml-1 text-sm font-normal text-navy-500 dark:text-slate-400">{sub}</span>}
      </div>
      <div className="mt-0.5 text-sm text-navy-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function EmptyState({ onPick }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
      <div className="mx-auto mb-4 inline-block rounded-xl bg-amber-100 p-4 dark:bg-amber-500/15">
        <FiZap className="text-2xl text-amber-600 dark:text-amber-400" />
      </div>
      <h3 className="mb-1 font-bold text-navy-900 dark:text-slate-100">No cold leads yet</h3>
      <p className="mx-auto mb-6 max-w-md text-sm text-navy-600 dark:text-slate-400">
        Import your CSV — letting agents, estate agents, residential, commercial, engineer-recruitment lists. Pick the segment at import.
      </p>
      {onPick && (
        <button className="btn-primary inline-flex items-center gap-2" onClick={onPick}>
          <FiUpload /> Import CSV
        </button>
      )}
    </div>
  );
}

function Chip({ label, value, color, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
        active ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-navy-200 bg-white hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:hover:bg-white/5"
      }`}>
      <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold ${color || "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300"}`}>
        {value}
      </span>
      <span className="font-medium text-navy-700 dark:text-slate-200">{label}</span>
    </button>
  );
}

function FilterToggle({ active, onChange, icon: Icon, label }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
      active
        ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
        : "border-navy-200 bg-white text-navy-600 hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-white/5"
    }`}>
      <input type="checkbox" className="hidden" checked={active} onChange={(e) => onChange(e.target.checked)} />
      <Icon className="h-3.5 w-3.5" /> {label}
    </label>
  );
}

function StagePill({ l, onStage }) {
  const meta = stageMeta(l.stage);
  return (
    <select value={l.stage} onClick={(e) => e.stopPropagation()}
      onChange={(e) => onStage(l.id, { stage: e.target.value })}
      className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${meta.color}`}>
      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

function ContactCard({ lead, onClose, onLog, onUpdate, onRemove, onEmail, fromName }) {
  const [note, setNote] = useState("");
  const [editPortfolio, setEditPortfolio] = useState(false);
  const [portfolioVal, setPortfolioVal] = useState("");
  const [dialerOpen, setDialerOpen] = useState(false);
  const [aiCalling, setAiCalling] = useState(false);

  const startAiCall = async () => {
    if (!lead) return;
    setAiCalling(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch("/api/vapi/call", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ coldLeadId: lead.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (result.notConfigured) toast.error("AI calling isn't set up yet — add Vapi keys.");
      else if (!res.ok || result.error) toast.error(result.error || "Couldn't start AI call.");
      else toast.success("AI call started");
    } catch {
      toast.error("Couldn't start AI call.");
    } finally {
      setAiCalling(false);
    }
  };

  if (!lead) return null;
  const l = lead;
  const sm = segmentMeta(l.segment || DEFAULT_SEGMENT);
  const company = fromName || "Landlord Compliance London";

  // Segment-aware pitch
  const isRecruit = sm.code === "engineer_recruit";
  const subject = isRecruit
    ? "Gas/electrical engineer opportunity in London"
    : "Landlord compliance certificates for your managed portfolio";
  const body = isRecruit
    ? `Hi,\n\nWe're recruiting qualified gas and electrical engineers across London at ${company}. ` +
      `Steady job flow, competitive day-rates or per-job pay, flexible scheduling.\n\n` +
      `If you're open to picking up extra work, reply and we'll send the next steps.`
    : `Hi,\n\nI'm reaching out from ${company}. We provide landlord compliance certificates across London — ` +
      `gas safety (CP12), EICRs, EPCs, fire risk assessments, PAT testing and more.\n\n` +
      `We work with letting agents and property managers across portfolios of all sizes. ` +
      `If any of your managed properties are due for compliance certificates, we'd be glad to provide a competitive quote.\n\n` +
      `Just reply or give us a call.`;
  const waMsg = isRecruit
    ? `Hi, I'm from ${company}. We're recruiting engineers — interested in picking up some work?`
    : `Hi, I'm from ${company}. We provide gas safety, EICR, EPC and fire safety certs for London property managers. Quick quote possible?`;

  const log = (channel, stage) => {
    onLog(l.id, { channel, note: note || undefined }, stage);
    setNote("");
    toast.success(`Logged ${channel}`);
  };

  const savePortfolio = () => {
    const n = parseInt(portfolioVal);
    if (!isNaN(n) && n > 0) {
      onUpdate(l.id, { portfolioSize: n });
      toast.success("Portfolio size saved");
    }
    setEditPortfolio(false);
  };

  return (
    <>
    <ManualDialerModal
      open={dialerOpen}
      onClose={() => setDialerOpen(false)}
      lead={l}
      onLog={(id, entry, stage) => {
        onLog(id, entry, stage);
        toast.success("Call logged");
      }}
    />
    <Modal open={!!lead} onClose={onClose} title={`${sm.label} · ${l.name}`} wide
      footer={
        <div className="flex w-full items-center gap-2">
          <button className="btn-secondary text-red-600" onClick={() => onRemove(l.id)}>
            <FiTrash2 /> Remove
          </button>
          <button className="btn-secondary ml-auto" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* contact info — segment-aware */}
        <div className="rounded-xl bg-navy-50 p-4 space-y-3 dark:bg-white/5">
          {/* Name + address header */}
          <div>
            <div className="font-bold text-lg text-navy-900 dark:text-slate-100">{l.name}</div>
            {l.category && (
              <div className="text-xs font-semibold text-navy-500 dark:text-slate-400">{l.category}</div>
            )}
            {(l.address || l.area) && (
              <div className="text-sm text-navy-600 dark:text-slate-400">
                {[l.address, l.area, l.county].filter(Boolean).join(", ")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Phone */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Phone</div>
              {l.phone ? (
                <a href={`tel:${l.phone}`} className="font-medium text-brand-600">{l.phone}</a>
              ) : <span className="text-navy-400">—</span>}
            </div>

            {/* Email */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Email</div>
              {l.email ? (
                <span className="font-medium text-navy-800 break-all dark:text-slate-200 text-xs">{l.email}</span>
              ) : <span className="text-navy-400">—</span>}
            </div>

            {/* ── ENGINEER RECRUIT ── */}
            {l.segment === "engineer_recruit" && (<>
              {l.trade && (
                <div className="col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-1">Trade / Qualification</div>
                  <span className="inline-block rounded-lg bg-brand-100 px-3 py-1 text-sm font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 capitalize">{l.trade}</span>
                </div>
              )}
              {l.services?.length > 0 && (
                <div className="col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-1">Can certify</div>
                  <div className="flex flex-wrap gap-1">
                    {l.services.map((s) => (
                      <span key={s} className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {l.area && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Covers</div>
                  <span className="text-navy-700 dark:text-slate-200">{l.area}</span>
                </div>
              )}
            </>)}

            {/* ── LETTING / ESTATE AGENT ── */}
            {(l.segment === "letting_agent" || l.segment === "estate_agent") && (<>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Portfolio size</div>
                {editPortfolio ? (
                  <div className="flex items-center gap-2">
                    <input type="number" className="input py-1 w-24" value={portfolioVal}
                      onChange={(e) => setPortfolioVal(e.target.value)}
                      placeholder="e.g. 50" autoFocus
                      onKeyDown={(e) => e.key === "Enter" && savePortfolio()} />
                    <button onClick={savePortfolio} className="text-green-600"><FiCheck /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy-800 dark:text-slate-200">
                      {l.portfolioSize ? `${l.portfolioSize} properties` : "Ask on call"}
                    </span>
                    <button onClick={() => { setPortfolioVal(l.portfolioSize || ""); setEditPortfolio(true); }}
                      className="text-navy-400 hover:text-navy-600"><FiEdit2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
              {l.area && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Area</div>
                  <span className="text-navy-700 dark:text-slate-200">{l.area}</span>
                </div>
              )}
              {l.org_type && l.org_type !== "letting_agency" && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Org type</div>
                  <span className="text-navy-600 dark:text-slate-400 capitalize">{l.org_type.replace(/_/g, " ")}</span>
                </div>
              )}
              {l.priority && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Priority</div>
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${l.priority === "high_value" ? "bg-emerald-100 text-emerald-700" : "bg-navy-100 text-navy-600"}`}>
                    {l.priority.replace(/_/g, " ")}
                  </span>
                </div>
              )}
            </>)}

            {/* ── COMMERCIAL ── */}
            {l.segment === "commercial" && (<>
              {l.tier && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Tier · Priority</div>
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                    l.tier === "A" ? "bg-emerald-100 text-emerald-700" :
                    l.tier === "B" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                  }`}>{l.tier}</span>
                  {l.priority && <span className="ml-1 text-xs text-navy-500">{l.priority.replace(/_/g, " ")}</span>}
                </div>
              )}
              {l.postcode && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Postcode</div>
                  <span className="font-mono text-navy-700 dark:text-slate-200">{l.postcode}</span>
                </div>
              )}
              {l.services?.length > 0 && (
                <div className="col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-1">Suggested services</div>
                  <div className="flex flex-wrap gap-1">
                    {l.services.map((s) => (
                      <span key={s} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>)}

            {/* ── RESIDENTIAL ── */}
            {l.segment === "residential" && (<>
              {l.area && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Area</div>
                  <span className="text-navy-700 dark:text-slate-200">{l.area}</span>
                </div>
              )}
              {l.services?.length > 0 && (
                <div className="col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-1">Services of interest</div>
                  <div className="flex flex-wrap gap-1">
                    {l.services.map((s) => (
                      <span key={s} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>)}

            {/* Website (all segments) */}
            {l.website && (
              <div className="col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Website</div>
                <a href={l.website} target="_blank" rel="noreferrer"
                   className="flex items-center gap-1 text-brand-600 hover:underline text-xs">
                  <FiGlobe className="h-3.5 w-3.5" />
                  {l.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </div>
            )}

            {/* Source (all segments) */}
            <div className="col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-navy-500 dark:text-slate-400 mb-0.5">Source</div>
              <span className="text-navy-500 text-xs dark:text-slate-400">{l.source || "—"}</span>
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="flex flex-wrap gap-2">
          {l.phone && (
            <button onClick={() => setDialerOpen(true)} className="btn-primary flex items-center gap-2">
              <FiPhone /> Call
            </button>
          )}
          {l.phone && (
            <button onClick={startAiCall} disabled={aiCalling}
              className="btn-secondary flex items-center gap-2 disabled:opacity-60">
              <FiPhoneCall /> {aiCalling ? "Calling…" : "AI Call"}
            </button>
          )}
          {l.email && (
            <button onClick={() => onEmail?.({ id: l.id, name: l.name, email: l.email, address: l.address, _subject: subject, _body: body })}
               className="btn-secondary flex items-center gap-2"><FiMail /> Email</button>
          )}
          {l.phone && (
            <a href={waLink(l.phone, waMsg)} target="_blank" rel="noreferrer"
               className="btn-secondary flex items-center gap-2"><FiMessageCircle /> WhatsApp</a>
          )}
          {l.website && (
            <a href={l.website} target="_blank" rel="noreferrer"
               className="btn-secondary flex items-center gap-2"><FiGlobe /> Website</a>
          )}
        </div>

        {/* note + outcome */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-navy-700 dark:text-slate-200">Log outcome</label>
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={isRecruit
              ? "e.g. Interested — qualified gas + EICR, available Mondays / Not interested"
              : "e.g. Spoke to Sarah — manages 45 props, wants quote for gas certs / Left voicemail"} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => log("note", "interested")}>Mark interested</button>
            <button className="btn-secondary" onClick={() => log("note", "booked")}>Mark booked</button>
            <button className="btn-secondary" onClick={() => log("note")}>Save note</button>
            <button className="btn-secondary text-red-600" onClick={() => log("note", "dnc")}>Do not contact</button>
          </div>
        </div>

        {/* history */}
        {(l.contactLog || []).length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-navy-700 dark:text-slate-200">Contact history</h4>
            <ul className="space-y-2">
              {l.contactLog.map((e, i) => (
                <li key={i} className="rounded-lg border border-navy-100 p-2 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between text-xs text-navy-500 dark:text-slate-400">
                    <span className="font-semibold capitalize text-navy-700 dark:text-slate-200">{e.channel}</span>
                    <span>{new Date(e.at).toLocaleString("en-GB")}</span>
                  </div>
                  {e.note && <p className="mt-1 text-navy-700 dark:text-slate-300">{e.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
    </>
  );
}
