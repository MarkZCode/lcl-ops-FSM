"use client";

import Link from "next/link";
import { FiMapPin, FiUser, FiClock, FiClipboard } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { serviceShort, fmtDateTime, gbp } from "@/lib/format";
import StatusBadge from "./StatusBadge";

// Left-border accent colour per job status
const STATUS_ACCENT = {
  quote:       "border-l-navy-300",
  scheduled:   "border-l-blue-400",
  in_progress: "border-l-amber-400",
  completed:   "border-l-brand-500",
  invoiced:    "border-l-purple-400",
  paid:        "border-l-emerald-500",
  cancelled:   "border-l-rose-400",
};

export default function JobCard({ job, onJobCard }) {
  const { clientById, engineerById } = useStore();
  const client = clientById(job.clientId);
  const property = client?.properties.find((p) => p.id === job.propertyId);
  const engineer = engineerById(job.engineerId);
  const accent = STATUS_ACCENT[job.status] || "border-l-navy-200";

  return (
    <Link
      href={`/jobs/${job.id}`}
      // min-w-0: as a grid/flex item the card would otherwise size to its own
      // content and burst out of its track — measured at 377px inside a 335px
      // column, which is what clipped the status badge and price off the right
      // edge of every job card on a phone.
      className={`card block min-w-0 border-l-4 p-4 transition hover:shadow-md hover:-translate-y-px ${accent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">{job.id}</p>
          <p className="mt-0.5 truncate text-sm font-bold text-navy-900">{client?.name || "Unknown client"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onJobCard && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onJobCard(job); }}
              className="grid h-7 w-7 place-items-center rounded-lg border border-navy-200 text-navy-400 hover:border-brand-300 hover:text-brand-600"
              aria-label="Job card"
              title="Job card"
            >
              <FiClipboard className="h-3.5 w-3.5" />
            </button>
          )}
          <StatusBadge status={job.status} size="sm" />
        </div>
      </div>

      {/* Service tags */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {(job.services || []).map((code) => (
          <span key={code} className="rounded-lg bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {serviceShort(code)}
          </span>
        ))}
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5 text-xs text-navy-500">
        {property && (
          <p className="flex items-center gap-2 min-w-0">
            <FiMapPin className="shrink-0 text-brand-400" />
            <span className="truncate min-w-0">{property.label}, {property.postcode}</span>
          </p>
        )}
        <p className="flex items-center gap-2">
          <FiClock className="shrink-0 text-navy-400" />
          {fmtDateTime(job.scheduledAt)}
        </p>
        <p className="flex items-center gap-2">
          <FiUser className="shrink-0 text-navy-400" />
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: engineer.color }} />
            {engineer.name}
          </span>
        </p>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-navy-100 pt-3">
        <span className="text-xs text-navy-400">{(job.services || []).length} service{(job.services || []).length !== 1 ? "s" : ""}</span>
        <span className="text-base font-black text-navy-900">{gbp(job.price)}</span>
      </div>
    </Link>
  );
}
