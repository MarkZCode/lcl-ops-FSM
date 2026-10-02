"use client";

// The dashboard's operations board: every pile of work that is waiting on
// someone, as a number you can open. Answers "what is waiting, and on whom"
// without going through the job list.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { blockersForScheduling } from "@/lib/visits";
import { jobBalance } from "@/lib/payments";
import { gbp, getJobLines, isAddonCode } from "@/lib/format";

const DAY = 86400_000;
const isPdf = (f) => f?.type === "application/pdf" || f?.contentType === "application/pdf" || /\.pdf$/i.test(f?.name || "");
const ukDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(d));

export default function OpsBoard() {
  const { jobs: allJobs, clients, engineerById } = useStore();
  const myEngId = useMyEngineerId();
  const [openKey, setOpenKey] = useState(null);

  const tiles = useMemo(() => {
    const jobs = myEngId ? allJobs.filter((j) => jobBelongsToEngineer(j, myEngId)) : allJobs;
    const now = Date.now();
    const today = ukDate(now);
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
      t("today", "Today's jobs", pick((j) => j.scheduledAt && ukDate(j.scheduledAt) === today && !done(j))),
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

  const open = tiles.find((x) => x.key === openKey);
  const clientName = (id) => clients.find((c) => c.id === id)?.name || "";
  const tone = { navy: "text-navy-900", amber: "text-amber-700", rose: "text-rose-600" };

  return (
    <section className="card p-5">
      <h2 className="mb-3 section-label text-sm">Operations — what&apos;s waiting</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tiles.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setOpenKey(openKey === x.key ? null : x.key)}
            className={`rounded-lg border p-3 text-left transition ${openKey === x.key ? "border-brand-400 bg-brand-50/60" : "border-navy-100 hover:border-navy-300"}`}
          >
            <span className={`block text-2xl font-bold tnum ${x.list.length ? tone[x.tone] : "text-navy-300"}`}>{x.list.length}</span>
            <span className="block text-xs font-semibold text-navy-600">{x.label}</span>
            {x.note && x.list.length > 0 && <span className="block text-[11px] text-navy-400">{x.note}</span>}
          </button>
        ))}
      </div>
      {open && (
        <div className="mt-3 rounded-lg border border-navy-100">
          <p className="border-b border-navy-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-500">{open.label}</p>
          {open.list.length === 0 ? (
            <p className="px-3 py-3 text-sm text-navy-500">Nothing here.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-navy-100 overflow-auto">
              {open.list.slice(0, 50).map((j) => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-navy-50">
                    <span className="min-w-0 truncate"><strong className="text-navy-900">{j.id}</strong> <span className="text-navy-600">· {clientName(j.clientId)}</span></span>
                    <span className="shrink-0 text-xs text-navy-500">{j.scheduledAt ? new Date(j.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
