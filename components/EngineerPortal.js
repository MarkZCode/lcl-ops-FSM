"use client";

// The engineer's own view — My jobs, Map, My pay. Everything shown comes
// from /api/portal, which returns only this engineer's jobs and pay; this
// screen never reads the office's data.
import { useCallback, useEffect, useState } from "react";
import { FaHardHat } from "react-icons/fa";
import { FiMail, FiMapPin, FiPhone, FiChevronLeft, FiChevronRight, FiArrowRight, FiRefreshCw } from "react-icons/fi";
import { addMonths, format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import PageHeader from "@/components/PageHeader";
import DispatchMap from "@/components/DispatchMap";

const DONE = ["completed", "invoiced", "paid"];
const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;
const when = (job) => { try { return job.scheduledAt ? parseISO(job.scheduledAt) : null; } catch { return null; } };
// Same UK calendar day (a phone abroad, or a server clock, mustn't move a job
// between "Today" and "Coming up").
const ukDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const isSameDay = (a, b) => ukDay(a) === ukDay(b);
const dayLabel = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

export default function EngineerPortal() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("jobs");
  const [month, setMonth] = useState(() => new Date());
  const [mapDay, setMapDay] = useState("");

  const [selectedEngId, setSelectedEngId] = useState("");
  const load = useCallback(async (m, engId) => {
    setError("");
    try {
      const { data: s } = (await supabase?.auth.getSession()) || {};
      const params = new URLSearchParams({ month: format(m, "yyyy-MM") });
      const targetEng = engId !== undefined ? engId : selectedEngId;
      if (targetEng) params.set("engineerId", targetEng);
      const r = await fetch(`/api/portal?${params.toString()}`, { cache: "no-store", headers: { Authorization: `Bearer ${s?.session?.access_token || ""}` } });
      if (!r.ok) throw new Error(r.status === 401 ? "Please sign in again." : "Couldn't load your jobs — check your connection.");
      const json = await r.json();
      setData(json);
      if (json?.engineer?.id && !targetEng) setSelectedEngId(json.engineer.id);
    } catch (e) { setError(String(e.message || e)); }
  }, [selectedEngId]);
  useEffect(() => { load(month); }, [load, month]);

  if (error && !data) {
    return (<><PageHeader icon={FaHardHat} title="My jobs" /><div className="page"><div className="card p-8 text-center text-sm text-navy-600">{error}<div><button type="button" className="btn-outline mt-4" onClick={() => load(month)}><FiRefreshCw /> Try again</button></div></div></div></>);
  }
  if (!data) {
    return (<><PageHeader icon={FaHardHat} title="My jobs" subtitle="Loading your schedule…" /><div className="page"><div className="card p-10 text-center text-sm text-navy-400">Loading…</div></div></>);
  }
  if (!data.linked) {
    return (
      <>
        <PageHeader icon={FaHardHat} title="My jobs" subtitle="Your engineer portal" />
        <div className="page">
          <div className="card mx-auto max-w-lg p-8 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-500"><FiMail className="h-6 w-6" /></span>
            <h2 className="text-lg font-bold text-navy-900">Account not linked yet</h2>
            <p className="mt-2 text-sm text-navy-500">This login isn&rsquo;t linked to an engineer profile yet. Ask the office to set this exact email address on your engineer record:</p>
            <p className="mt-3 inline-block rounded-lg bg-navy-50 px-3 py-1.5 font-mono text-sm font-semibold text-navy-800">{data.email}</p>
          </div>
        </div>
      </>
    );
  }

  const { engineer: me, jobs, pay } = data;
  const now = new Date();
  const open = jobs.filter((j) => !DONE.includes(j.status));
  // Today, plus any earlier job still not marked done — it used to drop out
  // of every list once its day had passed.
  const overdue = (j) => when(j) && when(j) < now && !isSameDay(when(j), now);
  const today = open.filter((j) => when(j) && (isSameDay(when(j), now) || overdue(j))).sort((a, b) => when(a) - when(b));
  const upcoming = open.filter((j) => when(j) && when(j) > now && !isSameDay(when(j), now)).sort((a, b) => when(a) - when(b));
  const waiting = open.filter((j) => !when(j));
  const done = jobs.filter((j) => DONE.includes(j.status)).sort((a, b) => (when(b) || 0) - (when(a) || 0)).slice(0, 10);

  const JobRow = ({ job }) => {
    const d = when(job);
    const finished = DONE.includes(job.status);
    return (
      <li className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{job.id}</p>
            <p className="mt-0.5 text-base font-bold text-navy-900">{job.services.join(", ") || "Job"}</p>
            <p className="mt-0.5 text-sm text-navy-600">{d ? `${dayLabel(d)}${job.window ? ` · ${job.window}` : ""}` : "Date to be agreed"}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${finished ? "bg-brand-50 text-brand-700" : job.confirmed ? "bg-blue-50 text-blue-700" : "bg-amber-100 text-amber-800"}`}>
            {finished ? "Done" : job.status === "in_progress" ? "In progress" : job.confirmed ? "Confirmed" : "Please confirm"}
          </span>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm text-navy-700">
          <FiMapPin className="mt-0.5 shrink-0 text-navy-400" />
          <span className="min-w-0 flex-1">{job.confirmed ? job.address || "Address to follow" : `${job.area || "London"} — confirm the job to see the address`}</span>
          {job.confirmed && (job.address || job.postcode) && !finished && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([job.address, job.postcode].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-navy-200 px-2.5 py-0.5 text-xs font-semibold text-brand-700">Directions</a>
          )}
        </p>
        {overdue(job) && !finished && <p className="mt-1.5 text-xs font-semibold text-amber-700">From {dayLabel(when(job))} — not marked finished yet. Press &ldquo;Update this job&rdquo; if it&rsquo;s done.</p>}
        {job.contacts.map((c, i) => (
          <p key={i} className="mt-1.5 flex items-center gap-2 text-sm text-navy-700">
            <FiPhone className="shrink-0 text-navy-400" />
            <span>{c.name || "Access contact"}{c.phone ? " · " : ""}{c.phone && <a href={`tel:${c.phone}`} className="font-semibold text-brand-700">{c.phone}</a>}</span>
          </p>
        ))}
        {job.accessNotes && <p className="mt-1.5 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs text-navy-700">Access: {job.accessNotes}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-3">
          <span className="text-sm text-navy-500">{job.fee != null ? <>You&rsquo;re paid <strong className="text-navy-900">{gbp(job.fee)}</strong></> : "Pay to be confirmed"}</span>
          {job.token && (
            <a href={`/confirm/${job.token}`} className="btn-primary py-1.5 text-xs">
              {job.confirmed ? "Update this job" : "Confirm or decline"} <FiArrowRight />
            </a>
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

  const dated = [...today, ...upcoming];
  const days = [...new Set(dated.map((j) => ukDay(when(j))))];
  const shownDay = mapDay || days[0] || "";
  const stops = dated.filter((j) => ukDay(when(j)) === shownDay && j.postcode).map((j, i) => ({
    id: j.id, jobId: j.id, postcode: j.postcode, label: j.services.join(", "), time: j.window || "", engineerId: me.id, engineerName: me.name, colour: me.color, n: i + 1, noLink: true,
  }));

  return (
    <>
      <PageHeader icon={FaHardHat} title="My jobs" subtitle={`${me.name} · ${today.length} today · ${upcoming.length} coming up`}
        actions={<button type="button" className="btn-outline" onClick={() => load(month)} aria-label="Refresh"><FiRefreshCw /></button>} />
      <div className="page space-y-5 lg:max-w-[1100px]">
        {data.isAdmin && (data.availableEngineers || []).length > 0 && (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="text-xs font-semibold text-navy-600">Admin view — select engineer:</span>
            <select
              className="input h-9 w-auto text-xs font-semibold text-navy-800"
              value={me.id}
              onChange={(e) => {
                setSelectedEngId(e.target.value);
                load(month, e.target.value);
              }}
            >
              {data.availableEngineers.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="inline-flex rounded-full border border-navy-200 bg-white p-1 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          {[["jobs", "My jobs"], ["map", "Map"], ["pay", "My pay"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-full px-4 py-1.5 font-semibold transition ${tab === k ? "bg-brand-600 text-white" : "text-navy-500 hover:text-navy-800 dark:text-slate-400"}`}>
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
                {days.map((d) => <option key={d} value={d}>{dayLabel(new Date(`${d}T12:00:00Z`))}</option>)}
              </select>
            )}
            <DispatchMap stops={stops} engineerView />
            <p className="text-xs text-navy-400">Jobs appear on the map once you have confirmed them.</p>
          </>
        )}

        {tab === "pay" && (
          <>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-outline !px-2.5" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month"><FiChevronLeft /></button>
              <p className="min-w-[9rem] text-center text-sm font-semibold text-navy-900">{format(month, "MMMM yyyy")}</p>
              <button type="button" className="btn-outline !px-2.5" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month"><FiChevronRight /></button>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${pay.upcoming > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              {[
                ["Earned this month", pay.earned, "For finished work in the month"],
                ...(pay.upcoming > 0 ? [["Upcoming work", pay.upcoming, "Estimated for scheduled jobs"]] : []),
                ["Paid to you", pay.paid, "Payments recorded this month"],
                ["Still to be paid", pay.due, "For this month's work"]
              ].map(([label, v, sub]) => (
                <div key={label} className="card p-4">
                  <p className="text-xs font-semibold text-navy-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-navy-900">{gbp(v)}</p>
                  <p className="mt-0.5 text-xs text-navy-400">{sub}</p>
                </div>
              ))}
            </div>
            <section>
              <h2 className="mb-2 section-label text-sm">Jobs in {format(month, "MMMM")}</h2>
              {pay.jobs.length === 0 ? (
                <div className="card p-6 text-center text-sm text-navy-400">No finished work in this month.</div>
              ) : (
                <ul className="card divide-y divide-navy-100 overflow-hidden p-0">
                  {pay.jobs.map((d, i) => (
                    <li key={`${d.jobId}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy-900">{d.description || d.jobId}</span>
                        <span className="block text-xs text-navy-500">{d.jobId}{d.date ? ` · ${new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}{d.parking ? ` · includes ${gbp(d.parking)} parking` : ""}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold tabular-nums text-navy-900">{gbp(d.amount)}</span>
                        <span className={`text-[11px] font-semibold ${d.isUpcoming ? "text-blue-700" : d.settled ? "text-brand-700" : "text-amber-700"}`}>{d.isUpcoming ? "Upcoming" : d.settled ? "Paid" : "Due"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {pay.payments.length > 0 && (
              <section>
                <h2 className="mb-2 section-label text-sm">Payments to you</h2>
                <ul className="card divide-y divide-navy-100 overflow-hidden p-0">
                  {pay.payments.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
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
