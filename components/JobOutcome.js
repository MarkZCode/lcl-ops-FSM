"use client";

import Link from "next/link";
import {
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiPlus,
  FiCornerUpRight,
} from "react-icons/fi";
import { useStore } from "@/lib/store";

const OUTCOMES = [
  { key: "pass", label: "Passed", Icon: FiCheckCircle, on: "border-emerald-500 bg-emerald-500 text-white" },
  { key: "fail", label: "Failed", Icon: FiXCircle, on: "border-rose-500 bg-rose-500 text-white" },
  { key: "advisory", label: "Advisory / warning", Icon: FiAlertTriangle, on: "border-amber-500 bg-amber-500 text-white" },
];

export default function JobOutcome({ job, onCreateFollowUp }) {
  const { jobs, clients = [], updateJob } = useStore();
  const outcome = job.outcome || "";
  const parent = job.relatedJobId ? jobs.find((j) => j.id === job.relatedJobId) : null;
  const children = jobs.filter((j) => j.relatedJobId === job.id);

  return (
    <section className="card p-5">
      <h2 className="mb-3 section-label text-sm">
        Outcome &amp; follow-up
      </h2>

      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((o) => {
          const active = outcome === o.key;
          return (
            <button
              key={o.key}
              onClick={() => updateJob(job.id, { outcome: active ? "" : o.key })}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                active ? o.on : "border-navy-200 bg-white text-navy-600 hover:border-navy-300"
              }`}
            >
              <o.Icon /> {o.label}
            </button>
          );
        })}
      </div>

      {(outcome === "fail" || outcome === "advisory") && (
        <button
          className="btn-outline mt-3"
          onClick={() => onCreateFollowUp(outcome === "fail" ? "remedial" : "followup")}
        >
          <FiPlus />
          {outcome === "fail"
            ? "Create remedial job"
            : "Create follow-up / replacement job"}
        </button>
      )}

      {parent && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-navy-500">
          <FiCornerUpRight className="text-navy-400" /> Follow-up of{" "}
          <Link href={`/jobs/${parent.id}`} className="font-semibold text-brand-600 hover:underline">
            {parent.id}
          </Link>
          {(() => {
            const pcl = clients.find((cl) => cl.id === parent.clientId);
            return pcl?.name ? <span className="font-medium text-navy-800 dark:text-slate-200">({pcl.name})</span> : null;
          })()}
        </p>
      )}

      {children.length > 0 && (
        <div className="mt-3 text-xs text-navy-500">
          <span className="font-semibold text-navy-600">Follow-up jobs:</span>{" "}
          {children.map((c, i) => {
            const ccl = clients.find((cl) => cl.id === c.clientId);
            return (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/jobs/${c.id}`} className="font-semibold text-brand-600 hover:underline">
                  {c.id}
                </Link>
                {ccl?.name && <span className="font-medium text-navy-800 dark:text-slate-200"> ({ccl.name})</span>}
                {c.relationType ? ` [${c.relationType}]` : ""}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
