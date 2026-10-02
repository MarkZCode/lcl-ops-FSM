"use client";

// The top strip of the dashboard: what changed since you last looked, this
// week's money against the target, how fast new enquiries are being
// answered today, and your own open tasks. Four small figures, one row.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { gbp } from "@/lib/format";
import { jobBalance, jobReceived } from "@/lib/payments";
import { firstResponseAt, enquiryWaitMs, waitLabel } from "@/lib/quoteChecks";

const LAST_KEY = "lcl-dash-last";
const startOfWeek = () => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
};

export default function DashboardBrief() {
  const { jobs, rules } = useStore();
  const { user } = useAuth();
  const [last, setLast] = useState(null);
  const [myTasks, setMyTasks] = useState(null);

  // "Last looked" is the previous visit to this page on this device. It is
  // read once, then moved forward, so the strip keeps showing the same
  // changes until you leave and come back.
  useEffect(() => {
    try {
      const prev = localStorage.getItem(LAST_KEY);
      setLast(prev ? Number(prev) : Date.now() - 86400_000);
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch { setLast(Date.now() - 86400_000); }
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return;
    let off = false;
    supabase.from("tasks").select("data").then(({ data }) => {
      if (off) return;
      const mine = (data || []).map((r) => r.data).filter((t) => t && t.status !== "done" && t.assigneeId === user.id && t.linkedTo?.kind === "job");
      setMyTasks({ open: mine.length, urgent: mine.filter((t) => t.priority === "urgent").length, late: mine.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now()).length });
    }).catch(() => {});
    return () => { off = true; };
  }, [user?.id]);

  const d = useMemo(() => {
    const since = last || Date.now();
    const after = (iso, t) => iso && new Date(iso).getTime() > t;
    const wk = startOfWeek();
    const live = jobs.filter((j) => j.status !== "cancelled");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const answeredToday = jobs
      .filter((j) => ["website", "email"].includes(j.source) && after(j.createdAt, today.getTime()))
      .map((j) => { const f = firstResponseAt(j); return f ? new Date(f).getTime() - new Date(j.createdAt).getTime() : null; })
      .filter((x) => x != null && x >= 0);
    const waiting = jobs.map((j) => enquiryWaitMs(j)).filter((x) => x != null);
    return {
      newEnquiries: jobs.filter((j) => after(j.createdAt, since)).length,
      accepted: jobs.filter((j) => after(j.acceptedAt, since)).length,
      paid: jobs.filter((j) => after(j.paidAt, since)).length,
      replies: jobs.reduce((n, j) => n + (j.activity || []).filter((a) => a.direction === "in" && a.handledBy !== "enquiry" && after(a.at, since)).length, 0),
      invoicedWeek: live.filter((j) => after(j.invoicedAt, wk)).reduce((s, j) => s + (Number(j.price) || 0), 0),
      receivedWeek: live.reduce((s, j) => s + (after(j.paidAt, wk) && !(j.payments || []).length ? Number(j.price) || 0 : (j.payments || []).filter((p) => after(`${p.date}T12:00:00`, wk)).reduce((a, p) => a + (Number(p.amount) || 0), 0)), 0),
      owed: live.filter((j) => j.status === "invoiced").reduce((s, j) => s + jobBalance(j), 0),
      avgReply: answeredToday.length ? answeredToday.reduce((a, b) => a + b, 0) / answeredToday.length : null,
      waiting: waiting.length, longestWait: waiting.length ? Math.max(...waiting) : null,
    };
  }, [jobs, last]);

  const target = Number(rules?.weeklyTarget) || 0;
  const pct = target ? Math.min(100, Math.round((d.invoicedWeek / target) * 100)) : 0;
  const changes = [
    d.newEnquiries && `${d.newEnquiries} new job${d.newEnquiries === 1 ? "" : "s"}`,
    d.replies && `${d.replies} client message${d.replies === 1 ? "" : "s"}`,
    d.accepted && `${d.accepted} quote${d.accepted === 1 ? "" : "s"} accepted`,
    d.paid && `${d.paid} payment${d.paid === 1 ? "" : "s"} in`,
  ].filter(Boolean);
  const cell = "min-w-0 px-4 py-3";

  return (
    <div className="panel grid grid-cols-1 divide-y divide-navy-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      <div className={cell}>
        <p className="metric-label">Since you last looked</p>
        <p className="mt-1 text-sm font-semibold text-navy-900">{changes.length ? changes.join(" · ") : "Nothing new"}</p>
        {last && <p className="mt-0.5 text-[11px] text-navy-400">{new Date(last).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p>}
      </div>
      <div className={cell}>
        <p className="metric-label">This week</p>
        <p className="mt-1 text-sm text-navy-700"><strong className="tnum text-navy-900">{gbp(d.invoicedWeek)}</strong> invoiced · <strong className="tnum text-navy-900">{gbp(d.receivedWeek)}</strong> received</p>
        {target > 0 ? (
          <div className="mt-1.5" title={`${pct}% of the ${gbp(target)} weekly target`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-navy-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
            <p className="mt-0.5 text-[11px] text-navy-400">{pct}% of {gbp(target)} target · {gbp(d.owed)} owed</p>
          </div>
        ) : (
          <p className="mt-0.5 text-[11px] text-navy-400">{gbp(d.owed)} owed to us</p>
        )}
      </div>
      <Link href="/jobs?status=quote%3Anew" className={`${cell} transition-colors hover:bg-navy-50`}>
        <p className="metric-label">First reply to enquiries today</p>
        <p className={`mt-1 text-sm font-semibold ${d.avgReply != null && d.avgReply > (Number(rules?.sla?.wa_reply) || 15) * 60000 ? "text-rose-600" : "text-navy-900"}`}>{d.avgReply != null ? `${waitLabel(d.avgReply)} on average` : "None answered yet"}</p>
        <p className="mt-0.5 text-[11px] text-navy-400">{d.waiting ? `${d.waiting} waiting · longest ${waitLabel(d.longestWait)}` : "Nobody waiting"}</p>
      </Link>
      <Link href="/team?tab=board" className={`${cell} transition-colors hover:bg-navy-50`}>
        <p className="metric-label">Your job tasks</p>
        <p className="mt-1 text-sm font-semibold text-navy-900">{myTasks ? `${myTasks.open} open` : "—"}{myTasks?.urgent ? ` · ${myTasks.urgent} urgent` : ""}</p>
        <p className={`mt-0.5 text-[11px] ${myTasks?.late ? "font-semibold text-rose-600" : "text-navy-400"}`}>{myTasks?.late ? `${myTasks.late} past their time` : "Nothing overdue"}</p>
      </Link>
    </div>
  );
}
