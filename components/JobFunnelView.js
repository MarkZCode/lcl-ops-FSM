"use client";

// JobFunnelView — Kanban funnel of jobs grouped by status. Drag a card to
// move it to the next status. Opens PaymentCaptureModal on the
// invoiced → paid transition (handoff §4.7C/D).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiAlertCircle, FiCalendar, FiClock, FiUser, FiClipboard } from "react-icons/fi";
import PipelineKanban from "./PipelineKanban";
import PaymentCaptureModal from "./PaymentCaptureModal";
import { useStore } from "@/lib/store";
import { JOB_STATUSES } from "@/lib/constants";
import { gbp, serviceShort } from "@/lib/format";
import { toast } from "@/lib/toast";

const STATUS_COLORS = {
  quote:       "bg-navy-400",
  scheduled:   "bg-blue-500",
  in_progress: "bg-amber-500",
  completed:   "bg-brand-500",
  invoiced:    "bg-purple-500",
  paid:        "bg-emerald-500",
  cancelled:   "bg-rose-500",
};

const SEVEN_DAYS = 7 * 86400000;

function dayInStatus(j) {
  const history = j.statusHistory;
  if (Array.isArray(history) && history.length) {
    const current = history[history.length - 1];
    if (!current.exitedAt) {
      const ms = Date.now() - new Date(current.enteredAt).getTime();
      return Math.floor(ms / 86400000);
    }
  }
  // Fallback: use updatedAt/scheduledAt if no statusHistory yet (legacy jobs).
  const ref = j.updatedAt || j.scheduledAt || j.createdAt;
  if (!ref) return null;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
}

export default function JobFunnelView({ jobs, clients, onJobCard }) {
  const { updateJob } = useStore();
  const router = useRouter();
  const [pendingPayment, setPendingPayment] = useState(null);

  const stages = useMemo(() =>
    JOB_STATUSES.filter((s) => s.key !== "cancelled").map((s) => ({
      key: s.key, label: s.label, color: STATUS_COLORS[s.key],
    }))
  , []);

  // Pre-map clients for the cards
  const clientMap = useMemo(() => {
    const m = {};
    for (const c of clients || []) m[c.id] = c;
    return m;
  }, [clients]);

  const move = (jobId, newStage) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    // Going to "paid" from any status → require payment-capture details first.
    if (newStage === "paid" && job.status !== "paid") {
      setPendingPayment(job);
      return;
    }
    updateJob(jobId, { status: newStage });
  };

  return (
    <>
      <PipelineKanban
        items={jobs.map((j) => ({ ...j, stage: j.status }))}
        stages={stages}
        onMove={move}
        // Clicking anywhere on the card opens the FULL job details page —
        // same destination as every other job list in the app (JobCard.js,
        // the table view, etc). The printable "offer card" (assign/confirm
        // engineer) is a separate, deliberate action behind its own small
        // button below, not the whole-card click.
        onCardClick={(j) => router.push(`/jobs/${j.id}`)}
        renderCard={(j) => {
          const c = clientMap[j.clientId];
          const days = dayInStatus(j);
          const stuck = days != null && days > 7;
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-navy-900 dark:text-slate-100">{j.id}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {stuck && (
                    <span title={`Stuck ${days}d in ${j.status}`} className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">
                      <FiAlertCircle className="h-2.5 w-2.5" />{days}d
                    </span>
                  )}
                  {onJobCard && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onJobCard(j); }}
                      className="grid h-5 w-5 place-items-center rounded border border-navy-200 text-navy-400 hover:border-brand-300 hover:text-brand-600 dark:border-white/10 dark:text-slate-400"
                      aria-label="Job card"
                      title="Job card (print / assign engineer)"
                    >
                      <FiClipboard className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="truncate text-[11px] text-navy-600 dark:text-slate-300">{c?.name || "—"}</div>
              <div className="flex items-center gap-1 text-[11px] text-navy-500 dark:text-slate-400">
                <span className="truncate">{(j.services || []).map(serviceShort).join(", ") || "—"}</span>
                {j.price != null && <span className="ml-auto font-semibold text-navy-700 dark:text-slate-200">{gbp(j.price)}</span>}
              </div>
              {j.scheduledAt && (
                <div className="flex items-center gap-1 text-[10px] text-navy-400 dark:text-slate-500">
                  <FiCalendar className="h-2.5 w-2.5" />
                  {new Date(j.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              )}
            </div>
          );
        }}
      />

      <PaymentCaptureModal
        open={!!pendingPayment}
        onClose={() => setPendingPayment(null)}
        job={pendingPayment}
        client={clientMap[pendingPayment?.clientId]}
        onSave={(patch) => {
          if (pendingPayment) {
            updateJob(pendingPayment.id, patch);
            toast.success("Job marked as Paid! Next: upload and send the certificate.");
          }
        }}
        onNotPaid={() => {
          toast.info("Invoice marked as not paid yet.");
        }}
      />
    </>
  );
}
