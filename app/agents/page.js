"use client";

// Letting Agents (§4.3) — B2B pipeline page.
// Top KPIs · stage + area + portfolio-band filters · row list · slide-over detail.

import { memo, useEffect, useMemo, useState } from "react";
import {
  FiUserPlus, FiSearch, FiX, FiHome, FiTrendingUp,
  FiCheckCircle, FiChevronRight, FiAlertCircle,
} from "react-icons/fi";
import PageHeader from "@/components/PageHeader";
import KPICard from "@/components/KPICard";
import StageBadge from "@/components/StageBadge";
import OutreachToolbar from "@/components/OutreachToolbar";
import AgentModal from "@/components/AgentModal";
import AgentDetailPanel from "@/components/AgentDetailPanel";
import QuickEmailModal from "@/components/QuickEmailModal";
import RequirePermission from "@/components/RequirePermission";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  STAGES, PORTFOLIO_BANDS, annualValue, portfolioBand, agentScore, makeAgent,
} from "@/lib/agents";

// Lead segments that are really letting/estate agents — these flow into the
// Agents section under the "From Leads" source tab.
const AGENT_LEAD_SEGMENTS = ["letting_agent", "estate_agent"];

// Adapt a prospect / lead into the minimal shape the derived list + promote use.
function adaptProspect(p) {
  return {
    originId: p.id, source: "prospect",
    agency_name: p.ownerName || p.nameOnCert || "Unknown",
    contact_name: p.nameOnCert && p.nameOnCert !== p.ownerName ? p.nameOnCert : "",
    email: p.contactEmail || "", phone: p.ownerPhone || p.tenantPhone || "",
    address: p.address || "", area: "",
  };
}
function adaptLead(l) {
  return {
    originId: l.id, source: "lead",
    agency_name: l.name || "Unknown", contact_name: "",
    email: l.email || "", phone: l.phone || "",
    address: l.address || "", area: l.postcode || "",
  };
}

function AgentsInner() {
  const ask = useConfirm();
  const { agents, upsertAgent, updateAgent, logAgentContact, removeAgent, clearAgents, importColdLeads, email, templates, prospects, coldLeads , requestBigTables } = useStore();
  // This page reads the big prospect/lead tables, so ask for them. Pages
  // that don't never download them — see requestBigTables in lib/store.
  useEffect(() => { requestBigTables(); }, [requestBigTables]);
  const { can } = useAuth();

  // Managed = native portfolio relationships (manual Add OR promoted from a prospect / lead).
  const managedAgents = useMemo(() => agents.filter((a) => (a.agentTier || "managed") !== "raw"), [agents]);
  // Legacy raw CSV agents — old import approach, now belong in Cold Leads pipeline.
  const rawAgents = useMemo(() => agents.filter((a) => a.agentTier === "raw"), [agents]);

  // Source tab — keeps categories from mixing: managed (native) agents vs the
  // letting-agents that surface from Prospects / Leads. Derived tabs are a live
  // read of those slices — nothing is copied until you Promote.
  const [sourceTab, setSourceTab] = useState("managed");
  const fromProspects = useMemo(() => prospects.filter((p) => p.isAgent).map(adaptProspect), [prospects]);
  const fromLeads = useMemo(() => coldLeads.filter((l) => AGENT_LEAD_SEGMENTS.includes(l.segment)).map(adaptLead), [coldLeads]);
  const promotedOrigins = useMemo(() => new Set(agents.map((a) => a.originId).filter(Boolean)), [agents]);

  const promote = (adapted) => {
    if (promotedOrigins.has(adapted.originId)) { toast.error("Already in Managed agents"); return; }
    const built = makeAgent({
      agency_name: adapted.agency_name, contact_name: adapted.contact_name,
      email: adapted.email, phone: adapted.phone, address: adapted.address,
      area: adapted.area, source: adapted.source,
    });
    built.originId = adapted.originId;
    upsertAgent(built);
    toast.success(`Promoted ${built.agency_name} to Managed agents`);
  };

  const [stageFilter, setStageFilter] = useState("all");
  const [bandFilter, setBandFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);
  const [emailing, setEmailing] = useState(null); // agent being emailed in-app
  const [editing, setEditing] = useState(null);   // agent being edited
  const [adding, setAdding] = useState(false);    // add modal open
  const [visibleCount, setVisibleCount] = useState(200);
  const [migrating, setMigrating] = useState(false);

  // ---- KPIs (Managed tier only — raw scraped rows don't count as pipeline) ----
  const kpis = useMemo(() => {
    let total = managedAgents.length, activeN = 0, pipeline = 0, properties = 0;
    for (const a of managedAgents) {
      pipeline += annualValue(a);
      properties += Number(a.portfolio_size) || a.properties?.length || 0;
      if (a.stage === "active" || a.stage === "trial_job") activeN++;
    }
    return { total, activeN, pipeline, properties };
  }, [managedAgents]);

  // ---- Areas list (for filter dropdown) ----
  const areaOptions = useMemo(() => {
    const s = new Set();
    for (const a of managedAgents) (a.area_focus || []).forEach((x) => s.add(x));
    return Array.from(s).sort();
  }, [managedAgents]);

  // ---- Filtered + ranked (Managed tier only) ----
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = new Date();
    const rows = managedAgents.filter((a) => {
      if (stageFilter !== "all" && a.stage !== stageFilter) return false;
      if (bandFilter !== "all") {
        const b = portfolioBand(a);
        if (!b || b.key !== bandFilter) return false;
      }
      if (areaFilter && !(a.area_focus || []).includes(areaFilter)) return false;
      if (needle) {
        const hay = `${a.agency_name} ${a.contact_name} ${a.email} ${a.phone} ${a.address}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return rows.sort((x, y) => agentScore(x, now) - agentScore(y, now));
  }, [managedAgents, stageFilter, bandFilter, areaFilter, q]);

  useEffect(() => { setVisibleCount(200); }, [stageFilter, bandFilter, areaFilter, q]);

  // ---- Stage counts (for chips) ----
  const stageCounts = useMemo(() => {
    const c = { all: managedAgents.length };
    for (const s of STAGES) c[s.key] = 0;
    for (const a of managedAgents) c[a.stage] = (c[a.stage] || 0) + 1;
    return c;
  }, [managedAgents]);

  // ---- Migrate legacy raw CSV agents → Cold Leads ----
  const migrateRawToLeads = async () => {
    if (!rawAgents.length) return;
    if (!await ask(`Move ${rawAgents.length} raw CSV agents to Cold Leads (Letting agents segment)?\n\nThey'll appear in /leads and can be outreached and promoted from there.`)) return;
    setMigrating(true);
    try {
      const asLeads = rawAgents.map((a) => ({
        id: "cl-" + a.id.replace(/^ag-/, ""),
        type: "cold",
        segment: "letting_agent",
        name: a.agency_name,
        address: a.address || "",
        area: (a.area_focus || []).join(", "),
        postcode: "",
        phone: a.phone || "",
        email: a.email || "",
        website: "",
        services: [],
        source: a.source || "agents_csv",
        notes: a.notes || "",
        org_type: a.org_type || "letting_agency",
        priority: a.priority || "",
        category: null,
        tier: null,
        tierSort: 99,
        portfolioSize: a.portfolio_size || null,
        stage: "new",
        lastContactedAt: null,
        contactLog: [],
        importedAt: a.importedAt || new Date().toISOString(),
        importBatchId: a.importBatchId || null,
      }));
      importColdLeads(asLeads);
      clearAgents(rawAgents.map((a) => a.id));
      toast.success(`Moved ${asLeads.length} agents to Cold Leads → Letting agents segment`);
      setSourceTab("leads");
    } catch (err) {
      toast.error("Migration failed: " + err.message);
    }
    setMigrating(false);
  };

  const handleSave = (built) => {
    upsertAgent(built);
    toast.success(editing ? "Agent saved" : `Added ${built.agency_name}`);
    setEditing(null);
    setAdding(false);
  };

  return (
    <>
      <PageHeader
        title="Letting Agents"
        subtitle="B2B pipeline — recurring portfolio relationships"
        actions={
          <>
            {can("importData") && (
              <button className="btn-primary flex items-center gap-2" onClick={() => setAdding(true)}>
                <FiUserPlus /> Add agent
              </button>
            )}
            {can("deleteRecords") && managedAgents.length > 0 && (
              <button className="btn-secondary flex items-center gap-2 text-rose-600" onClick={async () => {
                if (!await ask(`Clear ALL ${managedAgents.length} managed agents? This can't be undone.`)) return;
                clearAgents(managedAgents.map((a) => a.id));
              }}>
                Clear all
              </button>
            )}
          </>
        }
      />

      {/* Source tabs */}
      <SourceTabs
        current={sourceTab}
        onPick={setSourceTab}
        counts={{ managed: managedAgents.length, prospects: fromProspects.length, leads: fromLeads.length }}
      />

      {/* Migration banner — shown when legacy raw CSV agents still exist */}
      {rawAgents.length > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/10 sm:mx-8">
          <span className="flex-1 text-amber-800 dark:text-amber-300">
            <strong>{rawAgents.length} legacy CSV agents</strong> are stored here from a previous import. These belong in the <strong>Cold Leads</strong> pipeline.
          </span>
          <button
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            onClick={migrateRawToLeads}
            disabled={migrating}
          >
            {migrating ? "Moving…" : "Move to Cold Leads"}
          </button>
        </div>
      )}

      <div className="page">
        {sourceTab === "prospects" || sourceTab === "leads" ? (
          <DerivedList
            rows={sourceTab === "prospects" ? fromProspects : fromLeads}
            source={sourceTab}
            promote={promote}
            promoted={promotedOrigins}
          />
        ) : managedAgents.length === 0 ? (
          <EmptyState onAdd={can("importData") ? () => setAdding(true) : null} />
        ) : (
          <>
            {/* KPIs */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KPICard label="Total agents" value={kpis.total} icon={FiHome} />
              <KPICard label="Active + trial" value={kpis.activeN} tier="good" icon={FiCheckCircle} />
              <KPICard label="Pipeline £/yr" value={`£${kpis.pipeline.toLocaleString()}`} hint="portfolio × £120 est." tier="good" icon={FiTrendingUp} />
              <KPICard label="Properties" value={kpis.properties.toLocaleString()} hint="under management" />
            </div>

            {/* Stage chips */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Chip label="All" value={stageCounts.all} active={stageFilter === "all"} onClick={() => setStageFilter("all")} />
              {STAGES.map((s) => (
                <Chip key={s.key} label={s.label} value={stageCounts[s.key] || 0}
                  active={stageFilter === s.key} onClick={() => setStageFilter(stageFilter === s.key ? "all" : s.key)} />
              ))}
            </div>

            {/* Filter row */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input className="input pl-9 w-72" placeholder="Search agency, contact, email…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="input w-auto" value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
                <option value="all">Any portfolio size</option>
                {PORTFOLIO_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label} properties</option>)}
              </select>
              {areaOptions.length > 0 && (
                <select className="input w-auto" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                  <option value="">Any area</option>
                  {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {(q || bandFilter !== "all" || areaFilter || stageFilter !== "all") && (
                <button className="btn-secondary" onClick={() => { setQ(""); setBandFilter("all"); setAreaFilter(""); setStageFilter("all"); }}>
                  <FiX /> Clear
                </button>
              )}
              <span className="ml-auto text-sm text-navy-500 dark:text-slate-400">{filtered.length} shown</span>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-navy-500 dark:text-slate-400">No agents match these filters.</p>
            ) : (
              <>
              {/* Phone list. Seven columns — agency, portfolio, £/yr, area,
                  stage, outreach — is a sideways drag per agency. Portfolio
                  size and annual value are what qualify an agent, so they
                  lead; the rest opens with the row. */}
              <div className="m-group lg:hidden">
                {filtered.slice(0, visibleCount).map((a) => {
                  const n = a.portfolio_size || a.properties?.length || 0;
                  const value = annualValue(a);
                  return (
                    <div key={a.id} className="p-row">
                      <div className="p-row-main" onClick={() => setActive(a)}>
                        <span className="p-row-name">
                          <FiHome className="mr-1 inline h-3 w-3 -translate-y-px text-brand-600" />
                          {a.agency_name}
                          {!a.agreement_signed && a.stage === "trial_job" && (
                            <FiAlertCircle className="ml-1 inline h-3 w-3 -translate-y-px text-amber-600" title="No trade agreement signed" />
                          )}
                        </span>
                        <span className="p-row-addr">
                          {[a.contact_name, a.decision_maker_role, (a.area_focus || [])[0]].filter(Boolean).join(" · ") || "No contact on file"}
                        </span>
                        <div className="p-row-meta">
                          <span className="p-row-svc">{n} {n === 1 ? "property" : "properties"}</span>
                          <StageBadge stage={a.stage} size="sm" />
                        </div>
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <OutreachToolbar
                            compact hideAiCall
                            contact={{ phone: a.phone, email: a.email, name: a.contact_name || a.agency_name }}
                            onEmail={() => setEmailing({ id: a.id, name: a.contact_name || a.agency_name, email: a.email, address: a.address })}
                          />
                        </div>
                      </div>
                      <div className="p-row-right" onClick={() => setActive(a)}>
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                          £{value.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-navy-500">per year</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-navy-200 bg-white lg:block dark:border-white/10 dark:bg-navy-900">
                <table className="w-full text-sm">
                  <thead className="bg-navy-50 text-left text-navy-600 dark:bg-white/5 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Agency · contact</th>
                      <th className="px-4 py-3 font-semibold">Portfolio</th>
                      <th className="px-4 py-3 font-semibold">£/yr</th>
                      <th className="px-4 py-3 font-semibold">Area</th>
                      <th className="px-4 py-3 font-semibold">Stage</th>
                      <th className="px-4 py-3 font-semibold">Outreach</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, visibleCount).map((a) => <AgentRow key={a.id} a={a} onOpen={setActive} onLog={logAgentContact} onEmail={setEmailing} />)}
                  </tbody>
                </table>
                {filtered.length > visibleCount && (
                  <div className="border-t border-navy-100 p-3 text-center text-xs dark:border-white/10">
                    Showing {visibleCount} of {filtered.length}.{" "}
                    <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisibleCount((n) => n + 200)}>Show 200 more</button>
                    {" · "}
                    <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisibleCount(filtered.length)}>Show all</button>
                  </div>
                )}
              </div>
              </>
            )}
          </>
        )}
      </div>

      <AgentDetailPanel
        agent={active}
        onClose={() => { if (active) setActive(agents.find((a) => a.id === active.id) || null); setActive(null); }}
        onUpdate={updateAgent}
        onLog={logAgentContact}
        onRemove={can("deleteRecords") ? (id) => { removeAgent(id); setActive(null); } : null}
        onUnpromote={(id) => { unpromoteAgent(id); setActive(null); toast.success("Reverted"); }}
        onEdit={(a) => { setActive(null); setEditing(a); }}
        templates={templates}
        fromName={email?.fromName}
      />

      <AgentModal
        open={adding || !!editing}
        agent={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSave={handleSave}
      />

      {/* In-app email composer — never opens the native Mail app */}
      <QuickEmailModal
        open={!!emailing}
        onClose={() => setEmailing(null)}
        contact={emailing}
        defaultSubject="Landlord compliance for your managed portfolio — Landlord Compliance London"
        defaultBody={emailing ? `Hi ${(emailing.name || "there").split(/\s+/)[0]},\n\nI'm reaching out from Landlord Compliance London. We provide landlord compliance certificates across London — Gas Safety (CP12), EICR, EPC, Fire Risk Assessments, PAT and more — and work with letting agents managing portfolios of all sizes, often same-day.\n\nIf any of your managed properties are due for certificates, we'd be glad to set up a simple trade account and a competitive rate. Would you be open to a quick chat?` : ""}
        campaignLabel="agent-outreach"
        onSent={() => { if (emailing) logAgentContact(emailing.id, { channel: "email", direction: "out", note: "Manual email sent" }, "contacted"); }}
      />
    </>
  );
}

const AgentRow = memo(function AgentRow({ a, onOpen, onLog, onEmail }) {
  const value = annualValue(a);
  const band = portfolioBand(a);
  const n = a.portfolio_size || a.properties?.length || 0;
  return (
    <tr className="border-t border-navy-100 dark:border-white/10 hover:bg-navy-50 dark:hover:bg-white/5">
      <td className="px-4 py-3 cursor-pointer max-w-xs" onClick={() => onOpen(a)}>
        <div className="flex items-center gap-1.5">
          <FiHome className="h-3 w-3 shrink-0 text-brand-600" />
          <span className="truncate font-medium text-navy-900 dark:text-slate-100">{a.agency_name}</span>
          {!a.agreement_signed && a.stage === "trial_job" && (
            <FiAlertCircle className="h-3 w-3 text-amber-600" title="No trade agreement signed" />
          )}
        </div>
        <div className="truncate text-xs text-navy-500 dark:text-slate-400">
          {a.contact_name || "—"}{a.decision_maker_role ? ` · ${a.decision_maker_role}` : ""}
        </div>
      </td>
      <td className="px-4 py-3 cursor-pointer" onClick={() => onOpen(a)}>
        <div className="font-bold text-navy-900 dark:text-slate-100">{n}</div>
        {band && <div className="text-[10px] text-navy-500 dark:text-slate-400">{band.label}</div>}
      </td>
      <td className="px-4 py-3 cursor-pointer font-semibold text-emerald-700 dark:text-emerald-300" onClick={() => onOpen(a)}>
        £{value.toLocaleString()}
      </td>
      <td className="px-4 py-3 cursor-pointer text-xs text-navy-500" onClick={() => onOpen(a)}>
        {(a.area_focus || []).slice(0, 2).join(", ") || "—"}
      </td>
      <td className="px-4 py-3 cursor-pointer" onClick={() => onOpen(a)}><StageBadge stage={a.stage} size="sm" /></td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <OutreachToolbar
          compact hideAiCall
          contact={{ phone: a.phone, email: a.email, name: a.contact_name || a.agency_name }}
          onEmail={() => onEmail?.({ id: a.id, name: a.contact_name || a.agency_name, email: a.email, address: a.address })}
          /* No onChannelClick: icon clicks don't auto-advance stage or log attempts.
             Stage moves only on actual Send / dialer disposition / explicit chip. */
        />
      </td>
      <td className="px-4 py-3 cursor-pointer text-navy-400" onClick={() => onOpen(a)}><FiChevronRight /></td>
    </tr>
  );
});

function Chip({ label, value, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
        active ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
        : "border-navy-200 bg-white hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:hover:bg-white/5"
      }`}>
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-navy-100 px-1.5 text-[10px] font-bold text-navy-700 dark:bg-white/10 dark:text-slate-300">{value}</span>
      <span className="font-medium text-navy-800 dark:text-slate-200">{label}</span>
    </button>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
      <div className="mx-auto mb-4 inline-block rounded-xl bg-brand-100 p-4 dark:bg-brand-500/15">
        <FiHome className="text-2xl text-brand-600 dark:text-brand-400" />
      </div>
      <h3 className="mb-1 font-bold text-navy-900 dark:text-slate-100">No managed agents yet</h3>
      <p className="mx-auto mb-6 max-w-md text-sm text-navy-600 dark:text-slate-400">
        Managed agents are B2B relationships you&apos;ve signed — portfolio size, agreement status, and outreach history all tracked here. Cold-prospect letting agents live in <strong>Cold Leads</strong>.
      </p>
      {onAdd && (
        <button className="btn-primary inline-flex items-center gap-2" onClick={onAdd}><FiUserPlus /> Add agent</button>
      )}
    </div>
  );
}

function SourceTabs({ current, onPick, counts }) {
  const tabs = [
    { k: "managed", label: "Managed" },
    { k: "prospects", label: "From Prospects" },
    { k: "leads", label: "From Leads" },
  ];
  return (
    <div className="border-b border-navy-100 bg-white px-4 dark:border-white/10 dark:bg-navy-900 sm:px-8">
      <div className="scroll-area -mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = current === t.k;
          return (
            <button key={t.k} onClick={() => onPick(t.k)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition ${
                active ? "border-brand-500 text-navy-900 dark:text-white" : "border-transparent text-navy-500 hover:text-navy-800 dark:text-slate-400"
              }`}>
              {t.label}
              <span className={`tnum rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" : "bg-navy-100 text-navy-500 dark:bg-white/10 dark:text-slate-400"}`}>
                {counts[t.k] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DerivedList({ rows, source, promote, promoted }) {
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(100);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => `${r.agency_name} ${r.contact_name} ${r.email} ${r.phone} ${r.address}`.toLowerCase().includes(n));
  }, [rows, q]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
        <FiHome className="mx-auto mb-3 text-2xl text-navy-300 dark:text-slate-600" />
        <p className="text-sm text-navy-500 dark:text-slate-400">
          No letting agents found among your {source === "prospects" ? "prospects" : "leads"} yet.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-navy-400 dark:text-slate-500">
          {source === "prospects"
            ? "Prospects auto-flagged as a company appear here. Mark a prospect as a letting agent from its card to surface it."
            : "Leads tagged with the “Letting agents” or “Estate agents” segment appear here."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input className="input pl-9" placeholder="Search agency, contact, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-navy-500 dark:text-slate-400">
          {filtered.length} letting agent{filtered.length !== 1 ? "s" : ""} from {source === "prospects" ? "prospects" : "leads"}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-left text-navy-600 dark:bg-white/5 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Agency · contact</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Area</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((r) => {
              const done = promoted.has(r.originId);
              return (
                <tr key={r.originId} className="border-t border-navy-100 dark:border-white/10 hover:bg-navy-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-navy-900 dark:text-slate-100">{r.agency_name}</span>
                      {r.priority === "high_value" && (
                        <span className="shrink-0 rounded px-1.5 py-0 text-[10px] font-bold bg-emerald-100 text-emerald-700">HV</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-navy-500 dark:text-slate-400">
                      {r.org_type && r.org_type !== "letting_agency" ? `${r.org_type} · ` : ""}
                      {r.contact_name || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 tnum text-navy-600 dark:text-slate-300">{r.phone || "—"}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-navy-600 dark:text-slate-300">{r.email || "—"}</td>
                  <td className="px-4 py-3 text-navy-500 dark:text-slate-400">{r.area || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                        <FiCheckCircle className="h-3.5 w-3.5" /> Managed
                      </span>
                    ) : (
                      <button onClick={() => promote(r)} className="btn-secondary py-1.5 text-xs">
                        <FiUserPlus className="h-3.5 w-3.5" /> Promote
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > visible && (
          <div className="border-t border-navy-100 p-3 text-center text-xs dark:border-white/10">
            Showing {visible} of {filtered.length}.{" "}
            <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisible((n) => n + 200)}>Show 200 more</button>
          </div>
        )}
      </div>
    </>
  );
}

function RawCsvList({ rows, onOpen, onPromote, onRemove }) {
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(200);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => `${r.agency_name} ${r.contact_name} ${r.email} ${r.phone} ${r.address}`.toLowerCase().includes(n));
  }, [rows, q]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
        <FiHome className="mx-auto mb-3 text-2xl text-navy-300 dark:text-slate-600" />
        <p className="text-sm text-navy-500 dark:text-slate-400">No raw scraped agents yet.</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-navy-400 dark:text-slate-500">
          Any CSV you Import on this page lands here first. Triage, then Promote the keepers to Managed.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input className="input pl-9" placeholder="Search agency, contact, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-navy-500 dark:text-slate-400">
          {filtered.length} raw scraped agent{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-left text-navy-600 dark:bg-white/5 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Agency · contact</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Area</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((r) => (
              <tr key={r.id} className="border-t border-navy-100 dark:border-white/10 hover:bg-navy-50 dark:hover:bg-white/5">
                <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => onOpen?.(r)}>
                  <div className="truncate font-medium text-navy-900 dark:text-slate-100">{r.agency_name}</div>
                  {r.contact_name && <div className="truncate text-xs text-navy-500 dark:text-slate-400">{r.contact_name}</div>}
                </td>
                <td className="px-4 py-3 tnum text-navy-600 dark:text-slate-300">{r.phone || "—"}</td>
                <td className="px-4 py-3 max-w-[200px] truncate text-navy-600 dark:text-slate-300">{r.email || "—"}</td>
                <td className="px-4 py-3 text-navy-500 dark:text-slate-400">{(r.area_focus || []).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onPromote(r)} className="btn-secondary py-1.5 text-xs"><FiUserPlus className="h-3.5 w-3.5" /> Promote</button>
                  {onRemove && <button onClick={() => onRemove(r)} className="btn-ghost py-1.5 text-xs text-rose-600"><FiX className="h-3.5 w-3.5" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > visible && (
          <div className="border-t border-navy-100 p-3 text-center text-xs dark:border-white/10">
            Showing {visible} of {filtered.length}.{" "}
            <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisible((n) => n + 200)}>Show 200 more</button>
          </div>
        )}
      </div>
    </>
  );
}

export default function AgentsPage() {
  return (
    <RequirePermission perm="agents">
      <AgentsInner />
    </RequirePermission>
  );
}
