"use client";

// The engineer's own view. Three things and nothing else:
//   • My jobs — today, coming up and recently done, with what each one is,
//     where it is, who lets them in, and what they are paid for it;
//   • Map     — their day on the same London map the office sees;
//   • My pay  — what they earned in a month, what has been paid, what is due.
//
// It never shows what the customer was charged, another engineer's work, or
// anything from the office side. An engineer login is linked to its engineer
// record by email (see lib/scope.js).
import { useMemo, useState } from "react";
import { FaHardHat } from "react-icons/fa";
import { FiMail, FiMapPin, FiPhone, FiChevronLeft, FiChevronRight, FiArrowRight } from "react-icons/fi";
import { addMonths, format, isSameDay, parseISO } from "date-fns";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useMyEngineerId, jobBelongsToEngineer } from "@/lib/scope";
import { gbp, getJobLines, isAddonCode } from "@/lib/format";
import { getPeriodRange, computeEngineerPay, jobBreakdownForEngineer } from "@/lib/stats";
import { lineEngineerId, blockersForScheduling } from "@/lib/visits";
import { certLabel, lineSizeLabel, windowStr, accessContacts } from "@/lib/jobCard";
import PageHeader from "@/components/PageHeader";
import DispatchMap from "@/components/DispatchMap";

const DONE = ["completed", "invoiced", "paid"];
const when = (job) => { try { return job.scheduledAt ? parseISO(job.scheduledAt) : null; } catch { return null; } };
const dayLabel = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export default function PortalPage() {
  const { user } = useAuth();
  const { jobs: allJobs, clients, engineers, engineerPayments, updateJob, hydrated } = useStore();
  const myEngId = useMyEngineerId();
  const me = engineers.find((e) => e.id === myEngId);
  const [tab, setTab] = useState("jobs");
  const [month, setMonth] = useState(() => new Date());
  const [mapDay, setMapDay] = useState("");

  const jobs = useMemo(
    () => (myEngId ? allJobs.filter((j) => j.status !== "cancelled" && jobBelongsToEngineer(j, myEngId)) : []),
    [allJobs, myEngId]
  );
  const now = new Date();
  const today = jobs.filter((j) => when(j) && isSameDay(when(j), now) && !DONE.includes(j.status)).sort((a, b) => when(a) - when(b));
  const upcoming = jobs.filter((j) => when(j) && when(j) > now && !isSameDay(when(j), now) && !DONE.includes(j.status)).sort((a, b) => when(a) - when(b));
  const waiting = jobs.filter((j) => !when(j) && !DONE.includes(j.status));
  const done = jobs.filter((j) => DONE.includes(j.status)).sort((a, b) => (when(b) || 0) - (when(a) || 0)).slice(0, 10);

  const range = useMemo(() => getPeriodRange("month", month), [month]);
  const pay = useMemo(() => computeEngineerPay(allJobs, range, engineers, engineerPayments), [allJobs, range, engineers, engineerPayments]);
  const myPay = pay.rows.find((r) => r.id === myEngId);
  // What I'm paid for a job, whichever month it falls in.
  const feeFor = (job) => {
    try {
      const d = me ? jobBreakdownForEngineer(job, me) : null;
      const n = d ? (Number(d.labour) || 0) + (Number(d.vat) || 0) + (Number(d.parkingReimbursed) || 0) : 0;
      return n > 0 ? n : null;
    } catch { return null; }
  };

  const propertyOf = (job) => clients.find((c) => c.id === job.clientId)?.properties?.find((p) => p.id === job.propertyId) || null;
  const myServices = (job) => getJobLines(job)
    .filter((l) => !isAddonCode(l.code) && !l.cancelled && lineEngineerId(job, l) === myEngId)
    .map((l) => { const s = lineSizeLabel(l, job); return `${l.code === "CUSTOM" ? l.name : certLabel(l.code)}${s ? ` (${s})` : ""}`; });

  const openLink = (job) => {
    const token = job.confirmToken || newToken();
    if (!job.confirmToken) updateJob(job.id, { confirmToken: token });
    window.location.href = `/confirm/${token}`;
  };

  if (!hydrated) {
    return (<><PageHeader icon={FaHardHat} title="My jobs" subtitle="Loading your schedule…" /><div className="page"><div className="card p-10 text-center text-sm text-navy-400">Loading…</div></div></>);
  }
  if (!myEngId) {
    return (
      <>
        <PageHeader icon={FaHardHat} title="My jobs" subtitle="Your engineer portal" />
        <div className="page">
          <div className="card mx-auto max-w-lg p-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-500"><FiMail className="h-6 w-6" /></span>
            <h2 className="text-lg font-bold text-navy-900">Account not linked yet</h2>
            <p className="mt-2 text-sm text-navy-500">This login isn&rsquo;t linked to an engineer profile yet. Ask the office to set this exact email address on your engineer record:</p>
            <p className="mt-3 inline-block rounded-lg bg-navy-50 px-3 py-1.5 font-mono text-sm font-semibold text-navy-800">{user?.email}</p>
          </div>
        </div>
      </>
    );
  }

  const JobRow = ({ job }) => {
    const client = clients.find((c) => c.id === job.clientId);
    const p = propertyOf(job);
    const confirmed = blockersForScheduling(job).length === 0 || ["in_progress", ...DONE].includes(job.status);
    const fee = feeFor(job);
    const d = when(job);
    const contacts = confirmed ? accessContacts(job, client) : [];
    return (
      <li className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{job.id}</p>
            <p className="mt-0.5 text-base font-bold text-navy-900">{myServices(job).join(", ") || "Job"}</p>
            <p className="mt-0.5 text-sm text-navy-600">{d ? `${dayLabel(d)}${windowStr(job) ? ` · ${windowStr(job)}` : ""}` : "Date to be agreed"}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${DONE.includes(job.status) ? "bg-brand-50 text-brand-700" : confirmed ? "bg-blue-50 text-blue-700" : "bg-amber-100 text-amber-800"}`}>
            {DONE.includes(job.status) ? "Done" : job.status === "in_progress" ? "In progress" : confirmed ? "Confirmed" : "Please confirm"}
          </span>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-navy-700">
          <FiMapPin className="mt-0.5 shrink-0 text-navy-400" />
          {/* The full address once the job is confirmed; the area before. */}
          {confirmed ? [p?.label, p?.postcode].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") || "Address to follow" : `${String(p?.postcode || "").split(" ")[0] || "London"} — confirm the job to see the address`}
        </p>
        {contacts.map((c, i) => (
          <p key={i} className="mt-1.5 flex items-center gap-2 text-sm text-navy-700">
            <FiPhone className="shrink-0 text-navy-400" />
            <span>{c.name || "Access contact"}{c.phone ? " · " : ""}{c.phone && <a href={`tel:${c.phone}`} className="font-semibold text-brand-700">{c.phone}</a>}</span>
          </p>
        ))}
        {confirmed && p?.accessNotes && <p className="mt-1.5 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs text-navy-700">Access: {p.accessNotes}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-3">
          <span className="text-sm text-navy-500">{fee != null ? <>You&rsquo;re paid <strong className="text-navy-900">{gbp(fee)}</strong></> : "Pay to be confirmed"}</span>
          {!DONE.includes(job.status) && (
            <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => openLink(job)}>
              {confirmed ? "Update this job" : "Confirm or decline"} <FiArrowRight />
            </button>
          )}
        </div>
      </li>
    );
  };
  const Group = ({ title, rows, empty }) => (
    <section>
      <h2 className="mb-2 section-label text-sm">{title} <span className="ml-1 rounded-full bg-navy-100 px-1.5 text-[11px] font-bold text-navy-600">{rows.length}</span></h2>
      {rows.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{rows.map((j) => <JobRow key={j.id} job={j} />)}</ul> : <div className="card p-6 text-center text-sm text-navy-400">{empty}</div>}
    </section>
  );

  // The map: one day of my jobs.
  const days = [...new Set([...today, ...upcoming].map((j) => format(when(j), "yyyy-MM-dd")))];
  const shownDay = mapDay || days[0] || "";
  const stops = [...today, ...upcoming].filter((j) => format(when(j), "yyyy-MM-dd") === shownDay).map((j, i) => {
    const p = propertyOf(j);
    return { id: j.id, jobId: j.id, postcode: String(p?.postcode || "").trim().toUpperCase(), label: myServices(j).join(", "), time: windowStr(j) || "", engineerId: myEngId, engineerName: me?.name || "Me", colour: me?.color || "#0f766e", n: i + 1 };
  });

  return (
    <>
      <PageHeader icon={FaHardHat} title="My jobs" subtitle={`${me?.name || ""} · ${today.length} today · ${upcoming.length} coming up`} />
      <div className="page space-y-5 lg:max-w-[1100px]">
        <div className="inline-flex rounded-full border border-navy-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          {[["jobs", "My jobs"], ["map", "Map"], ["pay", "My pay"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1.5 font-semibold transition ${tab === k ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900" : "text-navy-500 hover:text-navy-800 dark:text-slate-400"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "jobs" && (
          <>
            <Group title="Today" rows={today} empty="Nothing booked for today." />
            {waiting.length > 0 && <Group title="Offered — date to be agreed" rows={waiting} empty="" />}
            <Group title="Coming up" rows={upcoming} empty="Nothing coming up yet." />
            <Group title="Recently done" rows={done} empty="No finished jobs yet." />
          </>
        )}

        {tab === "map" && (
          <>
            {days.length > 1 && (
              <select className="input h-10 w-auto" value={shownDay} onChange={(e) => setMapDay(e.target.value)} aria-label="Which day">
                {days.map((d) => <option key={d} value={d}>{dayLabel(parseISO(d))}</option>)}
              </select>
            )}
            <DispatchMap stops={stops} />
          </>
        )}

        {tab === "pay" && (
          <>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-outline !px-2.5" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month"><FiChevronLeft /></button>
              <p className="min-w-[9rem] text-center text-sm font-semibold text-navy-900">{format(month, "MMMM yyyy")}</p>
              <button type="button" className="btn-outline !px-2.5" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month"><FiChevronRight /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[["Earned this month", myPay?.accrued || 0, "For work done in the month"], ["Paid to you", myPay?.paid || 0, "Payments recorded this month"], ["Still to be paid", myPay?.balance || 0, "For this month's work"]].map(([label, v, sub]) => (
                <div key={label} className="card p-4">
                  <p className="text-xs font-semibold text-navy-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-navy-900">{gbp(v)}</p>
                  <p className="mt-0.5 text-xs text-navy-400">{sub}</p>
                </div>
              ))}
            </div>
            <section>
              <h2 className="mb-2 section-label text-sm">Jobs in {format(month, "MMMM")}</h2>
              {(myPay?.jobDetails || []).length === 0 ? (
                <div className="card p-6 text-center text-sm text-navy-400">No finished work in this month.</div>
              ) : (
                <ul className="card divide-y divide-navy-100 overflow-hidden p-0">
                  {myPay.jobDetails.map((d, i) => (
                    <li key={`${d.jobId}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy-900">{d.description || d.jobId}</span>
                        <span className="block text-xs text-navy-500">{d.jobId}{d.date ? ` · ${new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}{d.parkingReimbursed ? ` · includes ${gbp(d.parkingReimbursed)} parking` : ""}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold tabular-nums text-navy-900">{gbp((Number(d.labour) || 0) + (Number(d.vat) || 0) + (Number(d.parkingReimbursed) || 0))}</span>
                        <span className={`text-[11px] font-semibold ${d.settled ? "text-brand-700" : "text-amber-700"}`}>{d.settled ? "Paid" : "Due"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {(myPay?.payments || []).length > 0 && (
              <section>
                <h2 className="mb-2 section-label text-sm">Payments to you</h2>
                <ul className="card divide-y divide-navy-100 overflow-hidden p-0">
                  {myPay.payments.map((p, i) => (
                    <li key={p.id || i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="text-navy-700">{p.date ? new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "Payment"}{p.reference ? ` · ${p.reference}` : ""}</span>
                      <strong className="tabular-nums text-navy-900">{gbp(p.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="text-xs text-navy-400">Anything look wrong? Message the office and we&rsquo;ll check it.</p>
          </>
        )}
      </div>
    </>
  );
}
