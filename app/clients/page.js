"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiPlus, FiSearch, FiHome, FiPhone, FiMail, FiUsers, FiChevronRight } from "react-icons/fi";
import { useStore } from "@/lib/store";
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
  const { clients, jobs } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");

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
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.company, c.email, c.phone].join(" ").toLowerCase().includes(q)
    );
  }, [clients, query]);

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
          <button className="clients-new-btn btn-primary" onClick={() => setModalOpen(true)}>
            <FiPlus /> <span className="hidden sm:inline">New client</span><span className="sm:hidden">New</span>
          </button>
        }
      />

      <div className="page">
        <div className="relative mb-4 sm:max-w-sm">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            className="input pl-9"
            placeholder="Search clients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

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
              <span className="col-span-3">Name</span>
              <span className="col-span-2">Type</span>
              <span className="col-span-3">Contact</span>
              <span className="col-span-2">Properties</span>
              <span className="col-span-2 text-right">Jobs</span>
            </div>
            <div className="divide-y divide-navy-100">
              {filtered.map((client) => {
                const jc = jobCount(client.id);
                return (
                  <Link key={client.id} href={`/clients/${client.id}`}
                    className="grid grid-cols-1 gap-2 px-4 py-3.5 transition hover:bg-brand-50/50 sm:grid-cols-12 sm:items-center sm:gap-0">
                    {/* Name */}
                    <div className="col-span-3 min-w-0">
                      <p className="truncate font-semibold text-navy-900">{client.name}</p>
                      {client.company && <p className="truncate text-xs text-navy-400">{client.company}</p>}
                    </div>
                    {/* Type */}
                    <div className="col-span-2">
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
                    <div className="col-span-2">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Properties</span>
                      <span className="flex items-center gap-1.5 text-xs text-navy-500">
                        <FiHome className="shrink-0 text-navy-300" />
                        {client.properties.length} propert{client.properties.length === 1 ? "y" : "ies"}
                      </span>
                    </div>
                    {/* Jobs */}
                    <div className="col-span-2 sm:text-right">
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-navy-400 sm:hidden">Jobs</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${jc > 0 ? "bg-brand-50 text-brand-700" : "text-navy-400"}`}>
                        {jc} job{jc !== 1 ? "s" : ""}
                      </span>
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
    </>
  );
}
