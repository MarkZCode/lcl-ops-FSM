"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FiPlus, FiEdit2, FiTrash2, FiPhone, FiMail, FiMapPin, FiUser, FiExternalLink, FiUserCheck, FiDollarSign, FiArrowRight } from "react-icons/fi";
import { FaHardHat } from "react-icons/fa";
import { useStore } from "@/lib/store";
import { gbp } from "@/lib/format";
import { jobFinancials } from "@/lib/finance";
import PageHeader from "@/components/PageHeader";
import EngineerModal from "@/components/EngineerModal";
import CoverageMap from "@/components/CoverageMap";
import EngineerRecruitsTab from "@/components/EngineerRecruitsTab";
import RequirePermission from "@/components/RequirePermission";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ConfirmProvider";

// Applicant stage labels — derived from the cold-lead stage so we don't need
// a separate schema field. The cold-leads pipeline is the source of truth.
const APPLICANT_PHASE = {
  contacted:  { label: "Outreached",       color: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" },
  interested: { label: "In conversation",  color: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  booked:     { label: "Interview booked", color: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" },
  won:        { label: "Ready to onboard", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
};

const TYPE_COLORS = {
  Individual: "bg-brand-50 text-brand-700",
  Company: "bg-blue-50 text-blue-700",
};

export default function EngineersPage() {
  return <RequirePermission perm="engineers"><EngineersInner /></RequirePermission>;
}

function EngineersInner() {
  const ask = useConfirm();
  const { engineers, removeEngineer, jobs, coldLeads, recruits, addEngineer, updateColdLead, requestBigTables } = useStore();
  // The applicants list is built from recruit-segment leads.
  useEffect(() => { requestBigTables("leads"); }, [requestBigTables]);
  const [addOpen, setAddOpen] = useState(false);
  const [editEng, setEditEng] = useState(null);
  const [tab, setTab] = useState("roster"); // 'roster' | 'sourcing' | 'payments'
  // Deep link: /engineers?tab=sourcing lands on the recruitment pipeline. The
  // global search links engineer recruits here, and without this the link
  // quietly dropped you on the roster instead of the record you clicked.
  const engParams = useSearchParams();
  useEffect(() => {
    const t = engParams.get("tab");
    if (["roster", "sourcing", "payments"].includes(t)) setTab(t);
  }, [engParams]);
  const [prefillFromLead, setPrefillFromLead] = useState(null);

  // Engineer recruitment applicants = recruit cold leads past the 'new' stage,
  // excluding do-not-contact. Sorted most-recently-contacted first.
  const applicants = useMemo(() => {
    return (coldLeads || [])
      .filter((l) => l.segment === "engineer_recruit" && l.stage && l.stage !== "new" && l.stage !== "dnc")
      .sort((a, b) => new Date(b.lastContactedAt || 0) - new Date(a.lastContactedAt || 0));
  }, [coldLeads]);

  const promoteToEngineer = (lead) => {
    // Prefills the EngineerModal with the lead's contact details so the user
    // just confirms trade/cut/VAT and saves. After save, mark the lead as won.
    setPrefillFromLead({
      __sourceLeadId: lead.id,
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      postcode: lead.postcode || "",
      type: "Individual",
      trade: "",
      cutPercent: 40,
      notes: `Onboarded from recruitment outreach. Source: ${lead.source || "cold leads"}.`,
    });
  };

  // Called after EngineerModal saves a new prefilled engineer — flip the lead
  // to "won" so it drops out of the applicants list.
  const onEngineerSaved = () => {
    if (prefillFromLead?.__sourceLeadId) {
      updateColdLead(prefillFromLead.__sourceLeadId, { stage: "won" });
      toast.success("Engineer onboarded — lead marked complete");
    }
    setPrefillFromLead(null);
  };

  const jobsForEngineer = (id) => jobs.filter((j) =>
    ["completed","invoiced","paid"].includes(j.status) && (j.engineerId === id)
  ).length;

  const revenueForEngineer = (id) => jobs
    .filter((j) => ["completed","invoiced","paid"].includes(j.status) && j.engineerId === id)
    .reduce((s, j) => s + (j.price || 0), 0);

  return (
    <>
      <PageHeader
        icon={FaHardHat}
        title="Engineers"
        subtitle={`${engineers.length} on the roster · ${recruits.length} in sourcing pipeline`}
        actions={
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <FiPlus /> Add engineer
          </button>
        }
      />

      {/* Coverage Map — capacity ceiling, always visible above tabs */}
      <div className="px-4 pt-5 sm:px-8">
        <CoverageMap compact />
      </div>

      {/* Tabs */}
      <div className="border-b border-navy-100 bg-white px-4 dark:border-white/10 dark:bg-navy-900 sm:px-8 mt-4">
        <div className="flex gap-1">
          {[
            ["roster",   `Active roster (${engineers.length})`],
            ["sourcing", `Sourcing pipeline (${recruits.length})`],
            ["payments", "Payments"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`relative -mb-px border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                tab === key
                  ? "border-brand-500 text-navy-900 dark:text-white"
                  : "border-transparent text-navy-500 hover:text-navy-900 dark:text-slate-400 dark:hover:text-white"
              }`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="page">
        {tab === "sourcing" ? (
          <EngineerRecruitsTab />
        ) : tab === "payments" ? (
          <PaymentsTab />
        ) : engineers.length === 0 ? (
          <div className="card flex flex-col items-center gap-4 p-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-navy-100 text-navy-400">
              <FaHardHat className="h-8 w-8" />
            </span>
            <div>
              <p className="font-bold text-navy-900">No engineers yet</p>
              <p className="mt-1 text-sm text-navy-500">Add your first engineer to start assigning jobs.</p>
            </div>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              <FiPlus /> Add engineer
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Table header */}
            <div className="hidden border-b border-navy-100 bg-navy-50 px-5 py-2.5 lg:grid lg:grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-navy-400">
              <span className="col-span-3">Engineer</span>
              <span className="col-span-2">Type / Trade</span>
              <span className="col-span-3">Contact</span>
              <span className="col-span-1 text-center">Cut</span>
              <span className="col-span-1 text-center">Jobs</span>
              <span className="col-span-1 text-right">Revenue</span>
              <span className="col-span-1" />
            </div>

            {/* Phone list. Below sm: the row grid collapsed into a stack of
                six labelled fields per engineer — the same table-pretending-
                to-be-mobile pattern as Clients. One row each instead. */}
            <div className="lg:hidden">
              {engineers.map((eng) => {
                const jc = jobsForEngineer(eng.id);
                const rev = revenueForEngineer(eng.id);
                const pay = eng.payType === "weekly" ? `£${eng.weeklyRate || 0}/wk`
                  : eng.payType === "fixed_gas" ? "Fixed · gas"
                  : eng.payType === "fixed_service" ? "Fixed rate"
                  : `${eng.cutPercent ?? 40}%`;
                return (
                  <div key={eng.id} className="m-row">
                    <span className="m-row-av text-white"
                          style={{ backgroundColor: eng.color || "#3FA34D" }}>
                      {(eng.name || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="m-row-main">
                      <span className="m-row-label">{eng.name}</span>
                      <span className="m-row-sub">
                        {[eng.company || eng.trade, pay + (eng.vatRegistered ? " +VAT" : ""),
                          `${jc} job${jc === 1 ? "" : "s"}`, gbp(rev)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <button onClick={() => setEditEng(eng)}
                      aria-label={`Edit ${eng.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-navy-200 text-navy-400 dark:border-white/10">
                      <FiEdit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden divide-y divide-navy-100 lg:block">
              {engineers.map((eng) => {
                const jc = jobsForEngineer(eng.id);
                const rev = revenueForEngineer(eng.id);
                return (
                  <div key={eng.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-12 sm:items-center sm:gap-0">
                    {/* Name + avatar */}
                    <div className="col-span-3 flex items-center gap-3 min-w-0">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold text-white text-sm"
                        style={{ backgroundColor: eng.color || "#3FA34D" }}>
                        {(eng.name || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy-900">{eng.name}</p>
                        {eng.company && <p className="truncate text-xs text-navy-400">{eng.company}</p>}
                      </div>
                    </div>

                    {/* Type */}
                    <div className="col-span-2">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Type / Trade</span>
                      <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${TYPE_COLORS[eng.type] || "bg-navy-100 text-navy-600"}`}>
                        {eng.type || "Individual"}
                      </span>
                      {eng.trade && <p className="mt-0.5 text-[11px] text-navy-400">{eng.trade}</p>}
                    </div>

                    {/* Contact */}
                    <div className="col-span-3 min-w-0 space-y-0.5">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Contact</span>
                      {eng.phone && (
                        <p className="flex items-center gap-1.5 text-xs text-navy-500">
                          <FiPhone className="shrink-0 text-navy-300" /><span className="truncate">{eng.phone}</span>
                        </p>
                      )}
                      {eng.email && (
                        <p className="flex items-center gap-1.5 text-xs text-navy-500">
                          <FiMail className="shrink-0 text-navy-300" /><span className="truncate">{eng.email}</span>
                        </p>
                      )}
                      {eng.postcode && (
                        <p className="flex items-center gap-1.5 text-xs text-navy-500">
                          <FiMapPin className="shrink-0 text-navy-300" />{eng.postcode}
                        </p>
                      )}
                    </div>

                    {/* Pay basis — was hardcoded to always show "X% cut" even for
                        engineers on weekly/fixed-rate pay, which misrepresented
                        how they're actually paid. */}
                    <div className="col-span-1 sm:text-center">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Pay</span>
                      <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                        {eng.payType === "weekly" ? `£${eng.weeklyRate || 0}/wk`
                          : eng.payType === "fixed_gas" ? "Fixed · Gas"
                          : eng.payType === "fixed_service" ? "Fixed · per service"
                          : `${eng.cutPercent ?? 40}%`}
                      </span>
                      {eng.vatRegistered && (
                        <p className="mt-0.5 text-[10px] font-semibold text-brand-500">+VAT</p>
                      )}
                    </div>

                    {/* Jobs done */}
                    <div className="col-span-1 sm:text-center">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Jobs</span>
                      <span className="text-sm font-bold text-navy-900">{jc}</span>
                      <p className="text-[10px] text-navy-400">jobs</p>
                    </div>

                    {/* Revenue */}
                    <div className="col-span-1 sm:text-right">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Revenue</span>
                      <span className="text-sm font-bold text-navy-900">{gbp(rev)}</span>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 flex justify-end gap-1.5">
                      <button onClick={() => setEditEng(eng)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:border-brand-300 hover:text-brand-600">
                        <FiEdit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={async () => {
                          if (await ask(`Remove ${eng.name}? Their jobs will be unassigned.`)) removeEngineer(eng.id);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:border-rose-200 hover:text-rose-500">
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add modal */}
      <EngineerModal open={addOpen} onClose={() => setAddOpen(false)} />
      {/* Edit modal */}
      {editEng && <EngineerModal open={!!editEng} onClose={() => setEditEng(null)} engineer={editEng} />}
      {/* Onboard-from-applicant modal */}
      {prefillFromLead && (
        <EngineerModal
          open
          onClose={() => setPrefillFromLead(null)}
          prefill={prefillFromLead}
          onSaved={onEngineerSaved}
        />
      )}
    </>
  );
}

function PaymentsTab() {
  const { engineers, jobs, engineerPayments } = useStore();

  // Quick per-engineer summary: this-month earnings, jobs completed, outstanding.
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const rows = useMemo(() => engineers.map((e) => {
    const monthJobs = jobs.filter((j) =>
      j.engineerId === e.id &&
      ["completed", "invoiced", "paid"].includes(j.status) &&
      j.scheduledAt && new Date(j.scheduledAt) >= monthStart
    );
    const monthRevenue = monthJobs.reduce((s, j) => s + (j.price || 0), 0);
    // Was a flat `revenue × cutPercent` regardless of how this engineer is
    // actually paid — completely ignored fixed-rate/weekly engineers, always
    // treating them as a straight percentage cut. jobFinancials() is the
    // same canonical per-job calc the job detail page and Reports use, so
    // this now agrees with them instead of being a third, separately wrong
    // number.
    const grossPay = monthJobs.reduce((s, j) => s + jobFinancials(j, e).payable, 0);
    // Was filtering on `p.at` — payment records are stamped `paidAt`, not
    // `at`, so `new Date(undefined)` (an Invalid Date) made every comparison
    // false and "Paid" always read £0.00 regardless of real payments.
    const paidEntries = (engineerPayments || []).filter((p) =>
      p.engineerId === e.id && new Date(p.paidAt) >= monthStart
    );
    const paid = paidEntries.reduce((s, p) => s + (p.amount || 0), 0);
    return { e, monthJobs: monthJobs.length, monthRevenue, grossPay, paid, outstanding: Math.max(0, grossPay - paid) };
  }), [engineers, jobs, engineerPayments, monthStart]);

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-navy-200 bg-white p-4 dark:border-white/10 dark:bg-navy-900">
          <div className="text-[10px] font-bold uppercase tracking-wider text-navy-500 dark:text-slate-400">This month gross</div>
          <div className="mt-1 text-2xl font-bold text-navy-900 dark:text-white">{gbp(rows.reduce((s, r) => s + r.grossPay, 0))}</div>
        </div>
        <div className="rounded-xl border border-navy-200 bg-white p-4 dark:border-white/10 dark:bg-navy-900">
          <div className="text-[10px] font-bold uppercase tracking-wider text-navy-500 dark:text-slate-400">Paid this month</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{gbp(rows.reduce((s, r) => s + r.paid, 0))}</div>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Outstanding</div>
          <div className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-200">{gbp(totalOutstanding)}</div>
        </div>
      </div>

      <div className="scroll-area overflow-x-auto rounded-xl border border-navy-200 dark:border-white/10">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-navy-50 text-left text-navy-600 dark:bg-white/5 dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 font-semibold">Engineer</th>
              <th className="px-4 py-3 font-semibold">Jobs this month</th>
              <th className="px-4 py-3 font-semibold">Gross</th>
              <th className="px-4 py-3 font-semibold">Paid</th>
              <th className="px-4 py-3 font-semibold">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100 dark:divide-white/5">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-navy-500">No engineers yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.e.id} className="hover:bg-navy-50 dark:hover:bg-white/5">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white" style={{ backgroundColor: r.e.color || "#3FA34D" }}>
                      {(r.e.name || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-medium text-navy-900 dark:text-slate-100">{r.e.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-navy-700 dark:text-slate-300">{r.monthJobs}</td>
                <td className="px-4 py-3 font-medium">{gbp(r.grossPay)}</td>
                <td className="px-4 py-3 text-emerald-700 dark:text-emerald-300">{gbp(r.paid)}</td>
                <td className={`px-4 py-3 font-semibold ${r.outstanding > 0 ? "text-amber-700 dark:text-amber-300" : "text-navy-400"}`}>{gbp(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-navy-500 dark:text-slate-400">
        Full payment ledger, BACS exports, and pay-run history live on the{" "}
        <Link href="/reports" className="font-semibold text-brand-600 hover:underline inline-flex items-center gap-1">
          Reports page <FiArrowRight className="h-3 w-3" />
        </Link>.
      </p>
    </div>
  );
}

function ApplicantsTable({ applicants, onPromote }) {
  if (!applicants.length) {
    return (
      <div className="card flex flex-col items-center gap-4 p-12 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-navy-100 text-navy-400 dark:bg-white/5 dark:text-slate-400">
          <FiUserCheck className="h-8 w-8" />
        </span>
        <div>
          <p className="font-bold text-navy-900 dark:text-white">No applicants yet</p>
          <p className="mt-1 text-sm text-navy-500 dark:text-slate-400">
            Engineer applicants surface here once they reply to recruitment outreach.
            Open <Link href="/leads" className="text-brand-600 underline">Cold Leads</Link>,
            switch to the <strong>Engineers</strong> segment and start a campaign.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="hidden border-b border-navy-100 bg-navy-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-navy-400 sm:grid sm:grid-cols-12 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <span className="col-span-3">Applicant</span>
        <span className="col-span-3">Contact</span>
        <span className="col-span-2">Phase</span>
        <span className="col-span-2">Last touched</span>
        <span className="col-span-2 text-right">Actions</span>
      </div>
      <div className="divide-y divide-navy-100 dark:divide-white/10">
        {applicants.map((a) => {
          const phase = APPLICANT_PHASE[a.stage] || APPLICANT_PHASE.contacted;
          return (
            <div key={a.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-12 sm:items-center sm:gap-0">
              <div className="col-span-3 min-w-0">
                <p className="truncate font-semibold text-navy-900 dark:text-white">{a.name || "Unnamed"}</p>
                {a.source && <p className="truncate text-xs text-navy-400 dark:text-slate-500">via {a.source}</p>}
              </div>
              <div className="col-span-3 min-w-0 space-y-0.5">
                {a.phone && (
                  <p className="flex items-center gap-1.5 text-xs text-navy-500 dark:text-slate-400">
                    <FiPhone className="shrink-0 text-navy-300" /><span className="truncate">{a.phone}</span>
                  </p>
                )}
                {a.email && (
                  <p className="flex items-center gap-1.5 text-xs text-navy-500 dark:text-slate-400">
                    <FiMail className="shrink-0 text-navy-300" /><span className="truncate">{a.email}</span>
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${phase.color}`}>
                  {phase.label}
                </span>
              </div>
              <div className="col-span-2 text-xs text-navy-500 dark:text-slate-400">
                {a.lastContactedAt ? new Date(a.lastContactedAt).toLocaleDateString("en-GB") : "—"}
              </div>
              <div className="col-span-2 flex flex-wrap justify-end gap-2">
                <Link
                  href="/leads"
                  className="inline-flex items-center gap-1.5 rounded-md border border-navy-200 px-2.5 py-1 text-xs font-semibold text-navy-700 hover:border-navy-300 hover:bg-navy-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                  title="Open in Cold Leads"
                >
                  <FiExternalLink className="h-3 w-3" /> Open
                </Link>
                <button
                  onClick={() => onPromote(a)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  <FiUserCheck className="h-3 w-3" /> Onboard
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
