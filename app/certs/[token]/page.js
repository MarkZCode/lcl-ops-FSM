// Public page: every certificate we hold for one client, to download.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import { invoiceConfig } from "@/lib/invoiceConfig";

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function CertsPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/certs/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [token]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-navy-50 text-sm text-navy-500">Loading…</div>;
  if (!data) return (
    <div className="grid min-h-screen place-items-center bg-navy-50 p-6 text-center">
      <div>
        <p className="text-lg font-bold text-navy-900">Link not found</p>
        <p className="mt-1 text-sm text-navy-500">This link is no longer active. Please contact us for a new one.</p>
      </div>
    </div>
  );

  const byProperty = new Map();
  for (const c of data.certs) {
    const k = c.property || "Property";
    if (!byProperty.has(k)) byProperty.set(k, []);
    byProperty.get(k).push(c);
  }

  return (
    <div className="min-h-screen bg-navy-50 p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-3 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-navy-100 dark:!bg-white">
            <LogoMark className="h-7 w-7" variant="light" />
          </span>
          <div>
            <p className="font-bold text-navy-900">Landlord Compliance London</p>
            <p className="text-xs text-navy-500">Certificates for {data.name}</p>
          </div>
        </div>
        {data.certs.length === 0 && <div className="card p-6 text-sm text-navy-600">No certificates are available yet. They appear here as soon as they are issued.</div>}
        {[...byProperty.entries()].map(([property, certs]) => (
          <div key={property} className="card p-5">
            <h2 className="mb-2 text-sm font-bold text-navy-900">{property}</h2>
            <ul className="divide-y divide-navy-100">
              {certs.map((c) => {
                const left = c.expires ? Math.ceil((new Date(c.expires) - new Date()) / 86400000) : null;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-semibold text-navy-800">{c.services || c.name}</span>
                      <span className="block text-xs text-navy-500">
                        Issued {day(c.date)}
                        {c.expires && <> · <span className={left < 0 ? "font-semibold text-rose-600" : left <= 60 ? "font-semibold text-amber-700" : ""}>{left < 0 ? "Expired" : "Expires"} {day(c.expires)}</span></>}
                      </span>
                    </span>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn-outline py-1.5 text-xs">Download PDF</a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <p className="pb-8 text-center text-xs text-navy-400">
          Need a renewal? Call <a href="tel:07426409342" className="font-semibold text-navy-600">07426 409342</a> or email{" "}
          <a href={`mailto:${invoiceConfig.email}`} className="font-semibold text-navy-600">{invoiceConfig.email}</a>
        </p>
      </div>
    </div>
  );
}
