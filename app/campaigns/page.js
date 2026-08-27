"use client";

// Campaigns — unified outreach hub.
//
// Single place to launch any outreach campaign across every audience the FSM
// tracks: Prospects (renewal cohort) · Letting Agents (B2B) · Cold Leads
// (every segment incl. estate / residential / commercial) · Engineer Recruits.
//
// Picks the right modal automatically:
//   Prospects → ProspectCampaign (renewal templates)
//   everything else → CampaignBuilder (segment-aware templates)
//
// Includes a "Seed test data" panel so the user can dry-run a campaign
// without touching real records.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FiTarget, FiHome, FiZap, FiUserCheck, FiSend, FiSearch, FiX, FiPlay,
  FiCheckCircle, FiTrash2, FiActivity, FiMail, FiBarChart2, FiRefreshCw,
  FiEye, FiMousePointer, FiUserMinus,
} from "react-icons/fi";
import { supabase } from "@/lib/supabase";
import PageHeader from "@/components/PageHeader";
import RequirePermission from "@/components/RequirePermission";
import ProspectCampaign from "@/components/ProspectCampaign";
import CampaignBuilder from "@/components/CampaignBuilder";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import {
  nextRenewalDue, monthBucket, jobYear, serviceLabel,
} from "@/lib/prospects";
import { SEGMENTS } from "@/lib/cold-leads";
import { useConfirm } from "@/components/ConfirmProvider";

const AUDIENCES = [
  { key: "prospects", label: "Prospects", sub: "Past clients · renewal cohort", icon: FiTarget },
  { key: "agents",    label: "Letting Agents", sub: "Managed · cold leads · prospect agents",  icon: FiHome },
  { key: "leads",     label: "Cold Leads", sub: "Every segment (letting, estate, residential, commercial)", icon: FiZap },
  { key: "recruits",  label: "Engineer Recruits", sub: "Pipeline & onboarding", icon: FiUserCheck },
];

function CampaignsInner() {
  const ask = useConfirm();
  const store = useStore();
  // Campaigns build audiences from the big prospect/lead tables — ask for them.
  useEffect(() => { store.requestBigTables?.(); }, [store.requestBigTables]);
  const { can } = useAuth();
  const {
    prospects, importProspects, clearProspects, logProspectContact,
    agents, importAgents, clearAgents, logAgentContact,
    coldLeads, importColdLeads, clearColdLeads, logColdLeadContact,
    recruits, importRecruits, clearRecruits, logRecruitContact,
    email,
  } = store;

  const [audience, setAudience] = useState("prospects");
  const [q, setQ] = useState("");

  // Prospect facets
  const [pYear, setPYear] = useState("all");
  const [pService, setPService] = useState("all");
  const [pBucket, setPBucket] = useState("due14"); // due14 | overdue | thisYear | all
  const [pWho, setPWho] = useState("all"); // all | landlords | agents

  // Agent facets — combined pool: managed agents + letting-agent cold leads + prospect agents
  const [aSource, setASource] = useState("all"); // all | managed | lead | prospect
  const [aStage, setAStage] = useState("all");

  // Cold-lead facets
  const [lSegment, setLSegment] = useState("all");
  const [lStage, setLStage] = useState("all");

  // Recruit facets
  const [rStage, setRStage] = useState("all");

  // Modals
  const [campaignOpen, setCampaignOpen] = useState(false);

  // ---- Campaign history stats ----
  const [statsHistory, setStatsHistory] = useState([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token || "";
      const res = await fetch("/api/campaign-stats", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.campaigns) setStatsHistory(json.campaigns);
    } catch { /* non-fatal */ }
    setStatsLoading(false);
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ---- Recipient lists per audience (apply facets + search) ----
  const recipients = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const search = (...fields) => !needle || fields.filter(Boolean).join(" ").toLowerCase().includes(needle);
    const now = new Date();
    if (audience === "prospects") {
      const TWO_WEEKS = 14 * 86400000;
      return prospects.filter((p) => {
        if (!p.contactEmail) return false; // email-only campaign hub
        if (pWho === "agents" && !p.isAgent) return false;
        if (pWho === "landlords" && p.isAgent) return false;
        if (pYear !== "all" && String(jobYear(p) || "") !== pYear) return false;
        if (pService !== "all") {
          const svcs = p.services?.length ? p.services : [p.primaryService || ""];
          if (!svcs.includes(pService)) return false;
        }
        if (pBucket !== "all") {
          const due = nextRenewalDue(p, now);
          if (pBucket === "due14") {
            if (!due || due < now || (due - now) > TWO_WEEKS) return false;
          } else if (pBucket === "overdue") {
            if (!due || due >= now) return false;
          } else if (pBucket === "thisYear") {
            if (!due || due.getFullYear() !== now.getFullYear()) return false;
          }
        }
        return search(p.ownerName, p.nameOnCert, p.address, p.contactEmail);
      });
    }
    if (audience === "agents") {
      // Combine all three sources into a uniform shape, dedup by email.
      const fromManaged = agents
        .filter((a) => a.email)
        .map((a) => ({
          id: a.id, name: a.contact_name || a.agency_name,
          email: a.email, phone: a.phone || "", address: a.address || "",
          stage: a.stage, source: "managed",
          lastContactedAt: a.lastContactedAt, portfolioSize: a.portfolio_size,
        }));
      const fromLeads = coldLeads
        .filter((l) => (l.segment === "letting_agent" || l.segment === "estate_agent") && l.email)
        .map((l) => ({
          id: l.id, name: l.name,
          email: l.email, phone: l.phone || "", address: l.address || "",
          stage: l.stage, source: "lead",
          lastContactedAt: l.lastContactedAt, portfolioSize: l.portfolioSize,
        }));
      const fromProspects = prospects
        .filter((p) => p.isAgent && p.contactEmail)
        .map((p) => ({
          id: p.id, name: p.ownerName || p.nameOnCert || "",
          email: p.contactEmail, phone: p.contactPhone || "", address: p.address || "",
          stage: p.stage, source: "prospect",
          lastContactedAt: p.lastContactedAt, portfolioSize: null,
        }));
      const seen = new Set();
      const all = [...fromManaged, ...fromLeads, ...fromProspects].filter((r) => {
        const key = r.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      return all.filter((r) => {
        if (aSource !== "all" && r.source !== aSource) return false;
        if (aStage !== "all" && r.stage !== aStage) return false;
        return search(r.name, r.email, r.address);
      });
    }
    if (audience === "leads") {
      return coldLeads.filter((l) => {
        if (!l.email) return false;
        if (lSegment !== "all" && (l.segment || "letting_agent") !== lSegment) return false;
        if (lStage !== "all" && l.stage !== lStage) return false;
        return search(l.name, l.email, l.address, l.postcode);
      });
    }
    // recruits
    return recruits.filter((r) => {
      if (!r.contact?.email) return false;
      if (rStage !== "all" && r.stage !== rStage) return false;
      return search(r.contact?.name, r.contact?.email, r.area);
    });
  }, [audience, prospects, agents, coldLeads, recruits, q, pYear, pService, pBucket, pWho, aSource, aStage, lSegment, lStage, rStage]);

  // ---- Distinct year / service options for prospect facets ----
  const yearOptions = useMemo(() => {
    const s = new Set();
    for (const p of prospects) { const y = jobYear(p); if (y) s.add(y); }
    return [...s].sort((a, b) => b - a);
  }, [prospects]);

  const serviceOptions = ["GAS", "EICR", "EPC", "FRA", "FSC", "PAT", "ALARM", "REMEDIAL"];

  // Adapt the audience-shaped recipients into the wire format each modal
  // expects. ProspectCampaign reads p.contactEmail / p.nameOnCert directly,
  // so we pass the ORIGINAL prospect objects through untouched. The other
  // modals expect { name, email, phone, ... }.
  const wireRecipients = useMemo(() => {
    if (audience === "prospects") {
      return recipients;
    }
    if (audience === "agents") {
      // recipients already unified to { id, name, email, phone, address, stage, source, ... }
      return recipients;
    }
    if (audience === "leads") {
      return recipients;
    }
    return recipients.map((r) => ({
      id: r.id,
      name: r.contact?.name,
      email: r.contact?.email,
      phone: r.contact?.phone,
      address: r.area || "",
      stage: r.stage,
      lastContactedAt: r.lastContactedAt,
    }));
  }, [audience, recipients]);

  // Pick segment code for the modal — used by CampaignBuilder for templates.
  const segmentForModal = useMemo(() => {
    if (audience === "agents") return "letting_agent";
    if (audience === "leads") return lSegment === "all" ? "letting_agent" : lSegment;
    if (audience === "recruits") return "engineer_recruit";
    return null;
  }, [audience, lSegment]);

  // Human-readable modal title reflecting the actual audience.
  const campaignModalTitle = useMemo(() => {
    const aud = AUDIENCES.find((a) => a.key === audience);
    const audLabel = aud?.label || "Campaign";
    if (audience === "prospects") return `Renewal campaign · ${audLabel}`;
    if (audience === "agents") return `Email campaign · ${audLabel}`;
    if (audience === "leads") {
      const segLabel = lSegment === "all" ? "All segments" : (lSegment.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      return `Email campaign · ${audLabel} — ${segLabel}`;
    }
    if (audience === "recruits") return `Email campaign · ${audLabel}`;
    return `Email campaign · ${audLabel}`;
  }, [audience, lSegment]);

  const onLogFor = (id, entry, stage) => {
    if (audience === "prospects") return logProspectContact(id, entry, stage);
    if (audience === "agents")    return logAgentContact(id, entry, stage);
    if (audience === "leads")     return logColdLeadContact(id, entry, stage);
    return logRecruitContact(id, entry, stage);
  };

  // ---- Test data seeding ----
  const [seeding, setSeeding] = useState(false);
  const seedTestData = async () => {
    if (!await ask("Add a batch of TEST records (5 prospects · 5 agents · 5 cold leads · 5 recruits) into the database?\n\nThey'll be tagged source='test' so you can clear them later.")) return;
    setSeeding(true);
    try {
      importProspects(makeTestProspects(5));
      importAgents(makeTestAgents(5));
      importColdLeads(makeTestColdLeads(5));
      importRecruits(makeTestRecruits(5));
      toast.success("Seeded 20 test records. Switch audience to view them.");
    } catch (e) {
      toast.error("Seeding failed: " + (e.message || e));
    } finally {
      setSeeding(false);
    }
  };

  const clearTestData = async () => {
    const pIds = prospects.filter((p) => p.source === "test").map((p) => p.id);
    const aIds = agents.filter((a) => a.source === "test").map((a) => a.id);
    const lIds = coldLeads.filter((l) => l.source === "test").map((l) => l.id);
    const rIds = recruits.filter((r) => r.source === "test").map((r) => r.id);
    const total = pIds.length + aIds.length + lIds.length + rIds.length;
    if (!total) { toast.error("No test records found."); return; }
    if (!await ask(`Remove ${total} test records?`)) return;
    if (pIds.length) clearProspects(pIds);
    if (aIds.length) clearAgents(aIds);
    if (lIds.length) clearColdLeads(lIds);
    if (rIds.length) clearRecruits(rIds);
    toast.success(`Removed ${total} test records.`);
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Outreach across every audience — prospects, agents, leads, recruits"
        actions={
          <>
            <Link href="/email-log" className="btn-secondary flex items-center gap-2" title="See every send, per-recipient status, replies, and scheduled chases">
              <FiMail /> Email log
            </Link>
            {can("importData") && (
              <button className="btn-secondary flex items-center gap-2" onClick={seedTestData} disabled={seeding} title="Add 20 fake records so you can dry-run a campaign without touching real data.">
                <FiActivity /> Seed test data
              </button>
            )}
          </>
        }
      />

      <div className="page">
        {/* Audience picker */}
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AUDIENCES.map((a) => {
            const Icon = a.icon;
            const active = audience === a.key;
            return (
              <button key={a.key} onClick={() => { setAudience(a.key); setQ(""); }}
                className={`text-left rounded-xl border p-4 transition ${
                  active
                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
                    : "border-navy-200 bg-white hover:border-navy-300 hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:hover:border-white/20"
                }`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-brand-500 text-white" : "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-200"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-bold text-navy-900 dark:text-slate-100">{a.label}</span>
                </div>
                <p className="text-xs text-navy-500 dark:text-slate-400">{a.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Per-audience facet bar */}
        {audience === "prospects" && (
          <FacetBar>
            <FacetGroup label="Who">
              {[
                ["all", "All"],
                ["landlords", "Landlords"],
                ["agents", "Letting agents"],
              ].map(([code, label]) => (
                <Chip key={code} label={label} active={pWho === code} onClick={() => setPWho(code)} />
              ))}
            </FacetGroup>
            <FacetGroup label="Cohort">
              {[
                ["due14", "Due 14d"],
                ["overdue", "Overdue"],
                ["thisYear", "This year"],
                ["all", "All"],
              ].map(([code, label]) => (
                <Chip key={code} label={label} active={pBucket === code} onClick={() => setPBucket(code)} />
              ))}
            </FacetGroup>
            {yearOptions.length > 0 && (
              <FacetGroup label="Last done">
                <Chip label="All years" active={pYear === "all"} onClick={() => setPYear("all")} />
                {yearOptions.map((y) => (
                  <Chip key={y} label={String(y)} active={pYear === String(y)} onClick={() => setPYear(String(y))} />
                ))}
              </FacetGroup>
            )}
            <FacetGroup label="Service">
              <Chip label="All" active={pService === "all"} onClick={() => setPService("all")} />
              {serviceOptions.map((s) => (
                <Chip key={s} label={s} active={pService === s} onClick={() => setPService(s)} />
              ))}
            </FacetGroup>
          </FacetBar>
        )}

        {audience === "agents" && (
          <FacetBar>
            <FacetGroup label="Source">
              {[
                ["all", "All sources"],
                ["lead", "Cold leads"],
                ["prospect", "Prospects"],
                ["managed", "Managed agents"],
              ].map(([code, label]) => (
                <Chip key={code} label={label} active={aSource === code} onClick={() => setASource(code)} />
              ))}
            </FacetGroup>
            <FacetGroup label="Stage">
              {[
                ["all", "All"],
                ["new", "New"],
                ["contacted", "Contacted"],
                ["engaged", "Engaged"],
                ["active", "Active"],
                ["dormant", "Dormant"],
              ].map(([code, label]) => (
                <Chip key={code} label={label} active={aStage === code} onClick={() => setAStage(code)} />
              ))}
            </FacetGroup>
          </FacetBar>
        )}

        {audience === "leads" && (
          <FacetBar>
            <FacetGroup label="Segment">
              <Chip label="All segments" active={lSegment === "all"} onClick={() => setLSegment("all")} />
              {SEGMENTS.map((s) => (
                <Chip key={s.code} label={s.label} active={lSegment === s.code} onClick={() => setLSegment(s.code)} />
              ))}
            </FacetGroup>
            <FacetGroup label="Stage">
              {[
                ["all", "All"],
                ["new", "New"],
                ["contacted", "Contacted"],
                ["engaged", "Engaged"],
                ["booked", "Booked"],
                ["dnc", "DNC"],
              ].map(([code, label]) => (
                <Chip key={code} label={label} active={lStage === code} onClick={() => setLStage(code)} />
              ))}
            </FacetGroup>
          </FacetBar>
        )}

        {audience === "recruits" && (
          <FacetBar>
            <FacetGroup label="Stage">
              {[
                ["all", "All"],
                ["sourced", "Sourced"],
                ["contacted", "Contacted"],
                ["agreement_sent", "Agreement sent"],
                ["agreement_signed", "Agreement signed"],
                ["meeting_scheduled", "Meeting scheduled"],
                ["onboarded", "Onboarded"],
              ].map(([code, label]) => (
                <Chip key={code} label={label} active={rStage === code} onClick={() => setRStage(code)} />
              ))}
            </FacetGroup>
          </FacetBar>
        )}

        {/* Search + summary */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input className="input pl-9 w-full" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-700"><FiX /></button>}
          </div>
          <span className="text-sm text-navy-500 dark:text-slate-400">
            <strong className="text-navy-900 dark:text-white">{recipients.length}</strong> eligible recipient{recipients.length === 1 ? "" : "s"}
          </span>
          <button
            className="btn-primary ml-auto flex items-center gap-2"
            onClick={() => setCampaignOpen(true)}
            disabled={!recipients.length}
            title={recipients.length ? "Launch campaign" : "No eligible recipients with an email"}>
            <FiSend /> Launch campaign
          </button>
        </div>

        {/* Test-data quick action */}
        {can("importData") && (
          <TestDataPanel onSeed={seedTestData} seeding={seeding} onClear={clearTestData}
            counts={{
              p: prospects.filter((x) => x.source === "test").length,
              a: agents.filter((x) => x.source === "test").length,
              l: coldLeads.filter((x) => x.source === "test").length,
              r: recruits.filter((x) => x.source === "test").length,
            }} />
        )}

        {/* Recipient preview list */}
        {recipients.length === 0 ? (
          <EmptyState audience={audience} />
        ) : (
          <RecipientList rows={recipients} audience={audience} />
        )}

        {/* Sent campaign history + stats */}
        <CampaignHistory history={statsHistory} loading={statsLoading} onRefresh={fetchStats} />
      </div>

      {/* Campaign modal — pick the right one for the audience */}
      {audience === "prospects" ? (
        <ProspectCampaign
          open={campaignOpen}
          onClose={() => setCampaignOpen(false)}
          recipients={wireRecipients}
          email={email}
          onLog={onLogFor}
          title={campaignModalTitle}
        />
      ) : (
        <CampaignBuilder
          open={campaignOpen}
          onClose={() => setCampaignOpen(false)}
          recipients={wireRecipients}
          segment={segmentForModal}
          email={email}
          leadKind={audience === "leads" ? "cold" : audience}
          onLog={onLogFor}
          title={campaignModalTitle}
        />
      )}
    </>
  );
}

/* ───────── Campaign history ───────── */

function pct(n, total) {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function StatPill({ icon: Icon, label, value, color = "navy" }) {
  const colors = {
    navy: "bg-navy-50 text-navy-700 dark:bg-white/5 dark:text-slate-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${colors[color]}`}>
      <Icon className="h-3 w-3" /> {label}: {value}
    </span>
  );
}

function CampaignHistory({ history, loading, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? history : history.slice(0, 5);

  return (
    <div className="mt-8 rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
      <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <FiBarChart2 className="h-4 w-4 text-brand-500" />
          <span className="font-semibold text-navy-900 dark:text-slate-100">Sent campaigns</span>
          {history.length > 0 && (
            <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-bold text-navy-600 dark:bg-white/10 dark:text-slate-300">
              {history.length}
            </span>
          )}
        </div>
        <button onClick={onRefresh} className="btn-ghost p-1.5 text-xs" title="Refresh stats">
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {history.length === 0 && !loading && (
        <p className="px-5 py-8 text-center text-sm text-navy-400 dark:text-slate-500">
          No campaigns sent yet. Launch one above to see stats here.
        </p>
      )}

      {loading && history.length === 0 && (
        <div className="space-y-3 p-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-navy-100 dark:bg-white/5" />
          ))}
        </div>
      )}

      {shown.length > 0 && (
        <div className="divide-y divide-navy-100 dark:divide-white/5">
          {shown.map((c) => (
            <div key={c.label} className="px-5 py-4">
              <div className="mb-2 flex items-start justify-between gap-4">
                <p className="font-medium text-navy-900 dark:text-slate-100 leading-tight">{c.label}</p>
                <span className="shrink-0 text-xs text-navy-400 dark:text-slate-500">
                  {c.lastSentAt ? new Date(c.lastSentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatPill icon={FiMail} label="Sent" value={c.sent} />
                <StatPill icon={FiEye} label="Opened" value={`${c.opened} (${pct(c.opened, c.sent)})`} color="green" />
                <StatPill icon={FiMousePointer} label="Clicked" value={`${c.clicked} (${pct(c.clicked, c.sent)})`} color="blue" />
                {c.unsubscribed > 0 && <StatPill icon={FiUserMinus} label="Unsub" value={c.unsubscribed} color="rose" />}
                {c.failed > 0 && <StatPill icon={FiX} label="Failed" value={c.failed} color="rose" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 5 && (
        <div className="border-t border-navy-100 px-5 py-3 dark:border-white/10">
          <button className="btn-ghost text-xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show less" : `Show all ${history.length} campaigns`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── small UI bits ───────── */

function FacetBar({ children }) {
  return <div className="mb-4 space-y-3 rounded-xl border border-navy-200 bg-white p-4 dark:border-white/10 dark:bg-navy-900">{children}</div>;
}

function FacetGroup({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">{label}</span>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300"
          : "border-navy-200 bg-white text-navy-700 hover:bg-navy-50 dark:border-white/10 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-white/5"
      }`}>{label}</button>
  );
}

function RecipientList({ rows, audience }) {
  const [visible, setVisible] = useState(100);
  return (
    <>
    {/* Phone list. This is a review-before-you-send list, so the question is
        "is this the right person and can we actually reach them" — name, then
        the contact detail the campaign will use. */}
    <div className="m-group lg:hidden">
      {rows.slice(0, visible).map((r) => {
        const f = recipientFields(r, audience);
        return (
          <div key={r.id} className="m-row">
            <span className="m-row-main">
              <span className="m-row-label">{f.name || "—"}</span>
              <span className="m-row-sub">{[f.email || f.phone || "No contact detail", f.extra].filter(Boolean).join(" · ")}</span>
            </span>
            {/* Same `badge-navy` the desktop row uses — StageBadge isn't
                imported on this page, and reaching for it here would have
                thrown at runtime rather than at build. */}
            {f.stage && <span className="badge-navy shrink-0">{f.stage}</span>}
          </div>
        );
      })}
      {rows.length > visible && (
        <div className="border-t border-navy-100 p-3 text-center text-xs dark:border-white/10">
          Showing {visible} of {rows.length}.{" "}
          <button className="font-semibold text-brand-600" onClick={() => setVisible((n) => n + 200)}>Show 200 more</button>
        </div>
      )}
    </div>

    <div className="hidden overflow-x-auto rounded-xl border border-navy-200 bg-white lg:block dark:border-white/10 dark:bg-navy-900">
      <table className="w-full text-sm">
        <thead className="bg-navy-50 text-left text-navy-600 dark:bg-white/5 dark:text-slate-300">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Name</th>
            <th className="px-4 py-2.5 font-semibold">Email</th>
            <th className="px-4 py-2.5 font-semibold">Phone</th>
            <th className="px-4 py-2.5 font-semibold">{audience === "agents" ? "Agency / Tier" : "Address / Tag"}</th>
            <th className="px-4 py-2.5 font-semibold">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, visible).map((r) => <Row key={r.id} r={r} audience={audience} />)}
        </tbody>
      </table>
      {rows.length > visible && (
        <div className="border-t border-navy-100 p-3 text-center text-xs dark:border-white/10">
          Showing {visible} of {rows.length}.{" "}
          <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisible((n) => n + 200)}>Show 200 more</button>
          {" · "}
          <button className="font-semibold text-brand-600 hover:underline" onClick={() => setVisible(rows.length)}>Show all</button>
        </div>
      )}
    </div>
    </>
  );
}

// Field mapping shared by the phone list and the desktop table, so the two can
// never disagree about which field a given audience puts where.
function recipientFields(r, audience) {
  let name = "", email = "", phone = "", extra = "", stage = "";
  if (audience === "prospects") {
    name = r.nameOnCert || r.ownerName; email = r.contactEmail;
    phone = r.ownerPhone || r.tenantPhone || "";
    extra = r.address || ""; stage = r.stage;
  } else if (audience === "agents") {
    name = r.name; email = r.email; phone = r.phone || "";
    extra = r.source === "prospect" ? "Prospect" : r.source === "lead" ? "Cold lead" : "Managed";
    stage = r.stage;
  } else if (audience === "leads") {
    name = r.name; email = r.email; phone = r.phone || "";
    extra = `${r.address || ""}${r.segment ? ` · ${r.segment}` : ""}`;
    stage = r.stage;
  } else {
    name = r.contact?.name; email = r.contact?.email; phone = r.contact?.phone || "";
    extra = r.area || ""; stage = r.stage;
  }
  return { name, email, phone, extra, stage };
}

function Row({ r, audience }) {
  const { name, email, phone, extra, stage } = recipientFields(r, audience);
  return (
    <tr className="border-t border-navy-100 dark:border-white/10">
      <td className="px-4 py-2 font-medium text-navy-900 dark:text-slate-100">{name || "—"}</td>
      <td className="max-w-[280px] truncate px-4 py-2 text-navy-700 dark:text-slate-300">{email || "—"}</td>
      <td className="px-4 py-2 tnum text-navy-600 dark:text-slate-400">{phone || "—"}</td>
      <td className="px-4 py-2 max-w-xs truncate text-navy-600 dark:text-slate-400">{extra}</td>
      <td className="px-4 py-2"><span className="badge-navy">{stage || "—"}</span></td>
    </tr>
  );
}

function TestDataPanel({ onSeed, onClear, counts, seeding }) {
  const total = counts.p + counts.a + counts.l + counts.r;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-navy-200 bg-navy-50/50 p-3 text-sm dark:border-white/10 dark:bg-white/5">
      <FiActivity className="text-brand-600 dark:text-brand-400" />
      <span className="font-semibold text-navy-800 dark:text-slate-200">Test data</span>
      <span className="text-navy-500 dark:text-slate-400">
        {total > 0
          ? `Currently ${counts.p} prospects · ${counts.a} agents · ${counts.l} leads · ${counts.r} recruits tagged source='test'.`
          : "No test records loaded. Seed some so you can dry-run a campaign safely."}
      </span>
      <div className="ml-auto flex gap-1.5">
        <button className="btn-secondary text-xs" onClick={onSeed} disabled={seeding}>
          {seeding ? "Seeding…" : <><FiPlay className="h-3.5 w-3.5" /> Seed 20</>}
        </button>
        {total > 0 && (
          <button className="btn-secondary text-xs text-rose-600" onClick={onClear}>
            <FiTrash2 className="h-3.5 w-3.5" /> Clear test data
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ audience }) {
  const tip = audience === "prospects" ? "Try widening the cohort filter or clearing the year/service chips."
    : audience === "agents" ? "No letting agents with an email match these filters. They're pulled from Cold Leads, Prospects (isAgent), and managed Agents."
    : audience === "leads" ? "Try a different segment, or import some cold leads first."
    : "Try clearing the stage filter, or add some recruits first.";
  return (
    <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
      <FiTarget className="mx-auto mb-3 text-2xl text-navy-300 dark:text-slate-600" />
      <p className="text-sm text-navy-500 dark:text-slate-400">No eligible recipients match these filters.</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-navy-400 dark:text-slate-500">{tip}</p>
    </div>
  );
}

/* ───────── test-data factories ───────── */

const FIRST_NAMES = ["Sarah", "Tom", "Priya", "James", "Amelia", "Daniel", "Olivia", "Hassan", "Chloe", "Ravi"];
const LAST_NAMES  = ["Walker", "Hughes", "Patel", "Brooks", "Sharma", "Lewis", "Khan", "Davies", "Bennett", "Holloway"];
const AGENCIES    = ["Crownway Lettings", "Northbank Estates", "Tower Bridge Property", "Camden Square Lets", "Old Oak Residential"];
const AREAS       = ["Camden", "Hackney", "Islington", "Tower Hamlets", "Lambeth"];
const POSTCODES   = ["NW1 3AB", "E2 8PQ", "N1 1HS", "E1 6LA", "SE1 9JT"];
const SERVICES    = ["GAS", "EICR", "EPC", "FRA", "PAT"];

function rng() { return Math.random().toString(36).slice(2, 8); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeTestProspects(n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES);
    const jobYearN = now.getFullYear() - (1 + (i % 3));
    const jobDate = `${String(1 + (i % 28)).padStart(2, "0")}/${String(1 + (i % 12)).padStart(2, "0")}/${jobYearN}`;
    const svc = pick(SERVICES);
    return {
      id: `pr-test-${Date.now()}-${i}-${rng()}`,
      ownerName: `${first} ${last}`,
      nameOnCert: `${first} ${last}`,
      ownerPhone: `0790000${1000 + i}`,
      tenantPhone: "",
      contactEmail: `${first.toLowerCase()}.${last.toLowerCase()}+test@example.com`,
      address: `${10 + i} Test Lane, ${pick(AREAS)}, ${pick(POSTCODES)}`,
      services: [svc],
      primaryService: svc,
      jobDate,
      certRenewalDate: "",
      invoiceAmount: 60 + (i * 15),
      monthName: "",
      sizeTier: "", renewalCadenceMo: 12,
      jobStatus: "Completed", statusBucket: "won",
      description: "Test record",
      isAgent: false,
      stage: "new",
      lastContactedAt: null,
      contactLog: [],
      source: "test",
      importedAt: new Date().toISOString(),
    };
  });
}

function makeTestAgents(n) {
  return Array.from({ length: n }, (_, i) => {
    const ag = `${pick(AGENCIES)} ${i + 1}`;
    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES);
    return {
      id: `ag-test-${Date.now()}-${i}-${rng()}`,
      agency_name: ag,
      contact_name: `${first} ${last}`,
      email: `manager+test@${ag.toLowerCase().replace(/\s+/g, "")}.test`,
      phone: `0791111${1000 + i}`,
      address: `${20 + i} High St, ${pick(AREAS)}`,
      area_focus: [pick(AREAS)],
      portfolio_size: 5 + i * 7,
      properties: [],
      stage: "new",
      trial_job_id: null,
      decision_maker_role: "Lettings Manager",
      agreement_signed: false,
      notes: "Test record",
      source: "test",
      agentTier: "raw",
      lastContactedAt: null,
      nextActionAt: null,
      timeline: [],
      importedAt: new Date().toISOString(),
      annual_value_estimate: (5 + i * 7) * 120,
    };
  });
}

function makeTestColdLeads(n) {
  const segs = ["letting_agent", "estate_agent", "residential", "commercial", "engineer_recruit"];
  return Array.from({ length: n }, (_, i) => {
    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES);
    const seg = segs[i % segs.length];
    return {
      id: `cl-test-${Date.now()}-${i}-${rng()}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}+lead@example.com`,
      phone: `0793333${1000 + i}`,
      address: `${30 + i} Pilot Rd, ${pick(AREAS)}`,
      postcode: pick(POSTCODES),
      website: "",
      segment: seg,
      portfolioSize: seg === "letting_agent" ? 10 + i : null,
      stage: "new",
      source: "test",
      contactLog: [],
      lastContactedAt: null,
      importedAt: new Date().toISOString(),
    };
  });
}

function makeTestRecruits(n) {
  const trades = [["gas"], ["electrical"], ["gas", "electrical"]];
  return Array.from({ length: n }, (_, i) => {
    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES);
    return {
      id: `rc-test-${Date.now()}-${i}-${rng()}`,
      contact: {
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}+eng@example.com`,
        phone: `0794444${1000 + i}`,
      },
      trade: trades[i % trades.length],
      services_offered: [],
      area: pick(AREAS),
      availability: "Weekdays",
      qualifications: "",
      day_rate: 0,
      stage: "sourced",
      source: "test",
      contactLog: [],
      lastContactedAt: null,
      importedAt: new Date().toISOString(),
    };
  });
}

export default function CampaignsPage() {
  return (
    <RequirePermission perm="prospects">
      <CampaignsInner />
    </RequirePermission>
  );
}
