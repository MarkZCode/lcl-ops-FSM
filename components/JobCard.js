"use client";

import Link from "next/link";
import { FiMapPin, FiUser, FiClock, FiClipboard } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { fmtDateTime, gbp, jobTags } from "@/lib/format";
import { jobEngineerIds, getUpcomingScheduledVisit } from "@/lib/visits";
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
  const engineers = jobEngineerIds(job).map(engineerById);
  const accent = STATUS_ACCENT[job.status] || "border-l-navy-200";
  const tags = jobTags(job);

  const upcomingVisit = getUpcomingScheduledVisit(job);
  const displayDate = upcomingVisit?.scheduledAt || job.scheduledAt;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className={`card block min-w-0 border-l-4 p-4 transition hover:shadow-md hover:-translate-y-px ${accent}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">{job.id}</p>
          <p className="mt-0.5 truncate text-sm font-bold text-navy-900">{client?.name || "Unknown client"}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end">
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
          {upcomingVisit && ["paid", "invoiced", "completed"].includes(job.status) && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
              Visit Scheduled
            </span>
          )}
        </div>
      </div>

      {/* Service tags */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t.key} className="rounded-lg bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {t.label}
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
          <span>
            {fmtDateTime(displayDate)}
            {upcomingVisit && (
              <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                (Upcoming Visit)
              </span>
            )}
          </span>
        </p>
        <p className="flex items-start gap-2">
          <FiUser className="mt-0.5 shrink-0 text-navy-400" />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            {engineers.map((e) => (
              <span key={e.id} className="inline-flex min-w-0 items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                <span className="truncate">{e.name}</span>
              </span>
            ))}
          </span>
        </p>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-navy-100 pt-3">
        <span className="text-xs text-navy-400">{tags.length} service{tags.length !== 1 ? "s" : ""}</span>
        <span className="text-base font-black text-navy-900">{gbp(job.price)}</span>
      </div>
    </Link>
  );
}
