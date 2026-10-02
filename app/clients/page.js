"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { FiPlus, FiSearch, FiHome, FiPhone, FiMail, FiUsers, FiChevronRight } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { duplicateGroups, mergedClient, clientStats, CLIENT_TAGS } from "@/lib/clients";
import ClientImport from "@/components/ClientImport";
import { gbp } from "@/lib/format";
import { toast } from "@/lib/toast";
import PageHeader from "@/components/PageHeader";
import ClientModal from "@/components/ClientModal";
import { useSectionTour } from "@/components/OnboardingTour";

// Avatar tint per client type — the type is carried by COLOUR on the phone
// list rather than spending a whole labelled row on a word you rarely need.
const typeAvatar = {
  Landlord:              "bg-brand-100 text-brand-700",
  "Managing agent":      "bg-blue-100 text-blue-700",
  Commercial:            "bg-amber-100 text-amber-700",
  "Housing association": "bg-purple-100 text-purple-700",
};

const initials = (name = "") =>
  name.trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).slice(0, 2)
    .map((w) => w[0]).join("").toUpperCase() || "?";

const typeColors = {
  Landlord: "bg-brand-100 text-brand-700",
  "Managing agent": "bg-blue-100 text-blue-700",
  Commercial: "bg-amber-100 text-amber-700",
  "Housing association": "bg-purple-100 text-purple-700",
};

export default function ClientsPage() {
  const { clients, jobs, updateClient, updateJob, removeClientOnly } = useStore();
  const dupes = useMemo(() => duplicateGroups(clients), [clients]);
  const [dupesOpen, setDupesOpen] = useState(false);

  // Fold `dup` into `keep`: its jobs move across (keeping their property),
  // its details fill any blanks, and only then is the empty duplicate
  // removed. No job is deleted.
  const merge = (keep, dup) => {
    if (!window.confirm(`Merge "${dup.name}" into "${keep.name}"? Their jobs and properties move across and the duplicate record is removed.`)) return;
    const { patch, propertyIdMap } = mergedClient(keep, dup);
    updateClient(keep.id, patch);
    const moving = jobs.filter((j) => j.clientId === dup.id);
    moving.forEach((j) => updateJob(j.id, { clientId: keep.id, ...(propertyIdMap[j.propertyId] ? { propertyId: propertyIdMap[j.propertyId] } : {}) }));
    removeClientOnly(dup.id);
    toast.success(`Merged — ${moving.length} job${moving.length === 1 ? "" : "s"} moved to ${keep.name}.`);
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");
  const [tag, setTag] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const stats = useMemo(() => new Map(clients.map((c) => [c.id, clientStats(c, jobs)])), [clients, jobs]);
  // The dashboard's "+ Client" lands here with the form already open.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") setModalOpen(true);
  }, []);

  const tour = useSectionTour("clients", [
    {
      selector: ".clients-new-btn",
      label: "Clients",
      title: "Add a client",
      body: "Create a client profile with their name, contact details and properties. Jobs are then linked to clients.",
    },
    {
      selector: ".clients-list",
      label: "Clients",
      title: "Click any client",
      body: "Open a client to see all their properties, full job history, certificate status and lifetime value.",
    },
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const yearAgo = Date.now() - 365 * 86400_000;
    return clients.filter((c) => {
      const st = stats.get(c.id);
      if (tag && !(c.tags || []).includes(tag)) return false;
      if (show === "lapsed" && !(st.won > 0 && st.open === 0 && st.lastAt && new Date(st.lastAt).getTime() < yearAgo)) return false;
      if (show === "owes" && !(st.owed > 0)) return false;
      if (show === "open" && !(st.open > 0)) return false;
      if (!q) return true;
      return [c.name, c.company, c.email, c.phone, ...(c.tags || []), ...(c.properties || []).map((p) => `${p.label} ${p.postcode}`), ...(c.contacts || []).map((x) => `${x.name} ${x.phone} ${x.email}`)]
        .join(" ").toLowerCase().includes(q);
    });
  }, [clients, query, show, tag, stats]);

  const jobCount = (clientId) =>
    jobs.filter((j) => j.clientId === clientId).length;

  return (
    <>
      {tour}
      <PageHeader
        icon={FiUsers}
        title="Clients"
        subtitle={`${clients.length} clients on file`}
        actions={
          <>
            <button className="btn-outline" onClick={() => setImportOpen(true)} title="Add clients from a spreadsheet">
              <span className="hidden sm:inline">Import</span><span className="sm:hidden">Import</span>
            </button>
            <button className="clients-new-btn btn-primary" onClick={() => setModalOpen(true)}>
              <FiPlus /> <span className="hidden sm:inline">New client</span><span className="sm:hidden">New</span>
            </button>
          </>
        }
      />

      <div className="page">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-auto">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              className="input pl-9"
              placeholder="Search name, phone, postcode, tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="input h-10 w-auto min-w-0 flex-1 sm:flex-none" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Which clients to show">
            <option value="all">All clients</option>
            <option value="open">With open jobs</option>
            <option value="owes">Owes money</option>
            <option value="lapsed">Not used us in 12 months</option>
          </select>
          <select className="input h-10 w-auto min-w-0 flex-1 sm:flex-none" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
            <option value="">Any tag</option>
            {CLIENT_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-navy-500">{filtered.length} shown</span>
        </div>

        {dupes.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm dark:bg-amber-500/10">
            <button type="button" className="flex w-full items-center justify-between font-semibold text-amber-900 dark:text-amber-200" onClick={() => setDupesOpen((o) => !o)}>
              <span>{dupes.length} possible duplicate client{dupes.length === 1 ? "" : "s"} — same phone or email</span>
              <span className="text-xs">{dupesOpen ? "Hide" : "Review"}</span>
            </button>
            {dupesOpen && (
              <ul className="mt-3 space-y-3">
                {dupes.map((g) => (
                  <li key={g[0].id} className="rounded-lg bg-white p-3 dark:bg-white/[0.04]">
                    <p className="text-xs text-navy-500">Keeping the oldest record:</p>
                    <p className="font-semibold text-navy-900">{g[0].name} <span className="font-normal text-navy-500">· {g[0].phone || "no phone"} · {g[0].email || "no email"} · {jobCount(g[0].id)} jobs</span></p>
                    {g.slice(1).map((d) => (
                      <div key={d.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-2">
                        <span className="text-navy-700">{d.name} <span className="text-navy-500">· {d.phone || "no phone"} · {d.email || "no email"} · {jobCount(d.id)} jobs</span></span>
                        <span className="flex gap-2">
                          <button type="button" className="btn-outline py-1 text-xs" onClick={() => merge(g[0], d)}>Merge into {g[0].name.split(" ")[0]}</button>
                          <button type="button" className="btn-outline py-1 text-xs" onClick={() => merge(d, g[0])}>Keep this one instead</button>
                        </span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-sm text-navy-500">No clients match your search.</div>
        ) : (
          <>
          {/* ── PHONE: one row per client ─────────────────────────────────
              The table below collapses on mobile into a stack of five
              labelled fields per client — 275px each, so barely two clients
              fit a screen and 37 of them ran to ~10,000px. This is the
              Contacts pattern: initials, name, one line of context, the job
              count, chevron. ~72px a row, nine to a screen. */}
          <div className="m-group lg:hidden">
            {filtered.map((client) => {
              const jc = jobCount(client.id);
              const props = client.properties?.length || 0;
              const context = [
                client.company,
                props ? `${props} propert${props === 1 ? "y" : "ies"}` : "No properties on file",
                client.phone,
              ].filter(Boolean).join(" · ");
              return (
                <Link key={client.id} href={`/clients/${client.id}`} className="m-row">
                  <span className={`m-row-av ${typeAvatar[client.type] || "bg-navy-100 text-navy-600"}`}>
                    {initials(client.name)}
                  </span>
                  <span className="m-row-main">
                    <span className="m-row-label">{client.name}</span>
                    <span className="m-row-sub">{context}</span>
                  </span>
                  <span className={`m-row-count ${jc === 0 ? "m-row-count-zero" : ""}`}>
                    {jc === 0 ? "—" : jc}
                  </span>
                  <FiChevronRight className="m-row-chev h-4 w-4" />
                </Link>
              );
            })}
          </div>

          <div className="clients-list card hidden overflow-hidden lg:block">
            <div className="hidden border-b border-navy-100 bg-navy-50 px-4 py-2.5 sm:grid sm:grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-navy-400">
              <span className="col-span-4">Name</span>
              <span className="col-span-1">Type</span>
              <span className="col-span-3">Contact</span>
              <span className="col-span-1">Homes</span>
              <span className="col-span-2 text-right">Lifetime · average</span>
              <span className="col-span-1 text-right">Jobs</span>
            </div>
            <div className="divide-y divide-navy-100">
              {filtered.map((client) => {
                const jc = jobCount(client.id);
                const st = stats.get(client.id);
                return (
                  <Link key={client.id} href={`/clients/${client.id}`}
                    className="grid grid-cols-1 gap-2 px-4 py-2.5 transition hover:bg-brand-50/50 sm:grid-cols-12 sm:items-center sm:gap-0">
                    {/* Name */}
                    <div className="col-span-4 min-w-0">
                      <p className="truncate font-semibold text-navy-900">{client.name}</p>
                      {client.company && <p className="truncate text-xs text-navy-400">{client.company}</p>}
                      {(client.tags || []).length > 0 && (
                        <p className="mt-0.5 flex flex-wrap gap-1">
                          {client.tags.map((t) => <span key={t} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t === "Slow payer" || t === "Do not chase" ? "bg-rose-50 text-rose-700" : "bg-navy-100 text-navy-600"}`}>{t}</span>)}
                        </p>
                      )}
                    </div>
                    {/* Type */}
                    <div className="col-span-1">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Type</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeColors[client.type] || "bg-navy-100 text-navy-600"}`}>
                        {client.type || "Landlord"}
                      </span>
                    </div>
                    {/* Contact */}
                    <div className="col-span-3 min-w-0 space-y-0.5">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Contact</span>
                      {client.phone && (
                        <p className="flex items-center gap-1.5 text-xs text-navy-500">
                          <FiPhone className="shrink-0 text-navy-300" /><span className="truncate">{client.phone}</span>
                        </p>
                      )}
                      {client.email && (
                        <p className="flex items-center gap-1.5 text-xs text-navy-500">
                          <FiMail className="shrink-0 text-navy-300" /><span className="truncate">{client.email}</span>
                        </p>
                      )}
                    </div>
                    {/* Properties */}
                    <div className="col-span-1">
                      <span className="flex items-center gap-1.5 text-xs text-navy-500">
                        <FiHome className="shrink-0 text-navy-300" />
                        {client.properties.length}
                      </span>
                    </div>
                    {/* Value */}
                    <div className="col-span-2 sm:text-right">
                      <span className="tnum block text-xs font-semibold text-navy-800">{st.ltv ? gbp(st.ltv) : "—"}</span>
                      {st.won > 1 && <span className="tnum block text-[11px] text-navy-400">{gbp(st.avg)} a job</span>}
                    </div>
                    {/* Jobs */}
                    <div className="col-span-1 sm:text-right">
                      <span className={`tnum inline-block rounded-full px-2 py-0.5 text-xs font-bold ${jc > 0 ? "bg-brand-50 text-brand-700" : "text-navy-400"}`}>
                        {jc}
                      </span>
                      {st.owed > 0 && <span className="tnum block text-[11px] font-semibold text-rose-600">{gbp(st.owed)} owed</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          </>
        )}
      </div>

      <ClientModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <ClientImport open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
