"use client";

// The dashboard's operations board: every pile of work that is waiting on
// someone, as a number you can open. Answers "what is waiting, and on whom"
// without going through the job list.
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { blockersForScheduling } from "@/lib/visits";
import { jobBalance } from "@/lib/payments";
import { gbp, getJobLines, isAddonCode } from "@/lib/format";

const DAY = 86400_000;
const isPdf = (f) => f?.type === "application/pdf" || f?.contentType === "application/pdf" || /\.pdf$/i.test(f?.name || "");
const ukDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(d));

export default function OpsBoard() {
  const { jobs: allJobs, engineerById } = useStore();
  const myEngId = useMyEngineerId();
  const router = useRouter();

  const tiles = useMemo(() => {
    const jobs = myEngId ? allJobs.filter((j) => jobBelongsToEngineer(j, myEngId)) : allJobs;
    const now = Date.now();
    const tomorrow = ukDate(now + DAY);
    const live = jobs.filter((j) => j.status !== "cancelled");
    const real = (j) => getJobLines(j).some((l) => !isAddonCode(l.code));
    const done = (j) => ["completed", "invoiced", "paid"].includes(j.status);
    const pdfs = (j) => (j.attachments || []).filter(isPdf);
    const sent = (j) => !!(j.certificateSentAt || j.certifiedAt || (j.activity || []).some((a) => a.template === "certificate"));
    const hasEng = (j) => j.engineerId && j.engineerId !== "unassigned";
    const name = (id) => engineerById(id)?.name || "the engineer";
    const pick = (f) => live.filter(f);
    const t = (key, label, list, tone = "navy", note = "") => ({ key, label, list, tone, note });

    return [
      t("tomorrow", "Tomorrow's jobs", pick((j) => j.scheduledAt && ukDate(j.scheduledAt) === tomorrow && !done(j))),
      t("engineer", "Awaiting an engineer", pick((j) => !done(j) && real(j) && !hasEng(j) && (j.acceptedAt || j.scheduledAt)), "amber"),
      t("offer", "Engineer hasn't confirmed", pick((j) => !done(j) && hasEng(j) && j.scheduledAt && blockersForScheduling(j, name).length > 0), "amber"),
      t("access", "Access not confirmed", pick((j) => j.status === "scheduled" && j.scheduledAt && new Date(j.scheduledAt).getTime() - now < 3 * DAY && new Date(j.scheduledAt).getTime() > now && !j.accessConfirmedAt), "amber"),
      t("deadline", "Deadline within 5 days", pick((j) => j.deadline && !done(j) && new Date(`${j.deadline}T23:59:59Z`).getTime() - now < 5 * DAY), "rose"),
      t("noaccess", "No-access, not rebooked", pick((j) => j.noAccessCount > 0 && !done(j) && (!j.scheduledAt || new Date(j.scheduledAt).getTime() < now)), "rose"),
      t("docpending", "Certificates pending", pick((j) => done(j) && real(j) && !pdfs(j).length && !j.certifiedAt), "amber"),
      t("unsent", "Certificates ready, not sent", pick((j) => done(j) && pdfs(j).length && j.certCheckedAt && !sent(j)), "amber"),
      t("corrections", "Corrections open", pick((j) => (j.amendments || []).some((a) => !a.resolvedAt)), "rose"),
      t("remedial", "Remedials outstanding", pick((j) => j.outcome === "fail" && !jobs.some((c) => c.relatedJobId === j.id && ["completed", "invoiced", "paid"].includes(c.status))), "rose"),
      t("unpaid", "Payment pending", pick((j) => j.status === "invoiced"), "navy", gbp(live.filter((j) => j.status === "invoiced").reduce((s, j) => s + jobBalance(j), 0))),
      t("mismatch", "Payment mismatches", pick((j) => j.paymentMismatch && !j.paymentMismatch.resolvedAt), "rose"),
    ];
  }, [allJobs, myEngId, engineerById]);

  // A tile opens the Jobs list showing exactly that pile.
  const openPile = (x) => {
    try { sessionStorage.setItem("lcl-jobs-pile", JSON.stringify({ label: x.label, ids: x.list.map((j) => j.id) })); } catch {}
    router.push("/jobs?pile=1");
  };
  const tone = { navy: "text-navy-900", amber: "text-amber-700", rose: "text-rose-600" };

  return (
    <section className="card p-5">
      <h2 className="mb-3 section-label text-sm">Operations — what&apos;s waiting</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tiles.map((x) => (
          <button
            key={x.key}
            type="button"
            disabled={!x.list.length}
            onClick={() => openPile(x)}
            className="rounded-lg border border-navy-100 p-3 text-left transition enabled:hover:border-brand-300 disabled:cursor-default"
          >
            <span className={`block text-2xl font-bold tnum ${x.list.length ? tone[x.tone] : "text-navy-300"}`}>{x.list.length}</span>
            <span className="block text-xs font-semibold text-navy-600">{x.label}</span>
            {x.note && x.list.length > 0 && <span className="block text-[11px] text-navy-400">{x.note}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
