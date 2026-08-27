// Public, no-login-required job status page. Accessible via a unique token
// stored on the job (`job.shareToken`). Shows safe info only — no bank details,
// no client phone, no internal notes.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { gbp, fmtDate, serviceName } from "@/lib/format";
import { statusMeta } from "@/lib/constants";
import LogoMark from "@/components/LogoMark";

const STATUS_STEPS = ["quote", "scheduled", "in_progress", "completed", "invoiced", "paid"];
const STATUS_LABELS = { quote: "Quote", scheduled: "Booked", in_progress: "In progress", completed: "Done", invoiced: "Invoice sent", paid: "Paid" };

export default function SharePage() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetched through a server route that returns ONLY the fields below. The
  // browser used to query Supabase directly with the anon key, which both
  // forced the jobs table to stay world-readable and shipped the entire job
  // — engineer pay, margin, access phone, internal notes — to a public page.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setJob(d || null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setJob(null); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return (
    <div className="grid min-h-screen place-items-center bg-navy-900 text-navy-300 text-sm">Loading…</div>
  );

  if (!job) return (
    <div className="grid min-h-screen place-items-center bg-navy-50">
      <div className="text-center">
        <p className="text-lg font-bold text-navy-900">Link not found</p>
        <p className="mt-1 text-sm text-navy-500">This link may have expired or been removed.</p>
      </div>
    </div>
  );

  const meta = statusMeta(job.status);
  const currentStep = STATUS_STEPS.indexOf(job.status);
  const lines = job.lines || [];

  return (
    <div className="min-h-screen bg-navy-50 p-4">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-navy-100 dark:!bg-white">
            <LogoMark className="h-7 w-7" variant="light" />
          </span>
          <div>
            <p className="font-bold text-navy-900">Landlord Compliance London</p>
            <p className="text-xs text-navy-500">07426 409342</p>
          </div>
        </div>

        {/* Status */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-navy-900">{job.id}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.color}`}>{meta.label}</span>
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-1">
            {STATUS_STEPS.map((s, i) => (
              <div key={s} className="flex flex-1 flex-col items-center gap-1">
                <div className={`h-2 w-full rounded-full ${i <= currentStep ? "bg-brand-500" : "bg-navy-100"}`} />
                <span className="text-[8px] leading-tight text-navy-400 sm:text-[9px]">{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Services */}
        <div className="card p-5">
          <h2 className="mb-3 section-label text-sm">Services</h2>
          <ul className="divide-y divide-navy-100">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-navy-800">{l.name}</span>
                <span className="font-semibold text-navy-900">{gbp(l.total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-navy-100 pt-2">
            <span className="text-sm text-navy-500">Total</span>
            <span className="text-base font-bold text-navy-900">{gbp(job.price)}</span>
          </div>
        </div>

        {/* Cert expiry */}
        {job.certExpiry && (
          <div className="card p-4 text-sm">
            <p className="text-navy-500">Certificate expiry: <span className="font-semibold text-navy-900">{fmtDate(job.certExpiry)}</span></p>
          </div>
        )}

        {/* Footer */}
        <p className="pb-8 text-center text-xs text-navy-400">
          Questions? Call us on <a href="tel:07426409342" className="font-semibold text-navy-600">07426 409342</a> or email{" "}
          <a href="mailto:landlordcompliancelondon@gmail.com" className="font-semibold text-navy-600">landlordcompliancelondon@gmail.com</a>
        </p>
      </div>
    </div>
  );
}
