"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FiMail, FiCheckCircle, FiAlertCircle, FiCornerUpLeft, FiRefreshCw,
  FiSearch, FiX, FiSend, FiInbox, FiPlay, FiCopy, FiExternalLink,
  FiDatabase, FiArrowRight, FiTarget, FiClock, FiZap, FiList,
} from "react-icons/fi";
import PageHeader from "@/components/PageHeader";
import RequirePermission from "@/components/RequirePermission";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";

const MIGRATION_SQL = `-- LCL Ops — Email tracking (send log + chase-email queue). Run once.

create table if not exists email_sends (
  id            text primary key,
  to_email      text not null,
  subject       text,
  status        text not null,
  sent_at       timestamptz not null default now(),
  sent_by       uuid,
  message_id    text,
  prospect_id   text,
  campaign_label text,
  error         text,
  replied_at    timestamptz,
  reply_snippet text,
  data          jsonb not null default '{}'::jsonb
);
create index if not exists email_sends_to_email_idx on email_sends (lower(to_email), sent_at desc);
create index if not exists email_sends_sent_at_idx  on email_sends (sent_at desc);
create index if not exists email_sends_prospect_idx on email_sends (prospect_id);
alter table email_sends enable row level security;
drop policy if exists "auth all email_sends" on email_sends;
create policy "auth all email_sends"
  on email_sends for all to authenticated using (true) with check (true);

create table if not exists email_queue (
  id text primary key,
  prospect_id text,
  to_email text not null,
  subject text not null,
  body text not null,
  from_name text,
  reply_to text,
  bcc text,
  campaign_label text,
  parent_send_id text,
  step_index int not null default 1,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_send_id text,
  cancelled_reason text,
  failure_reason text,
  created_by uuid,
  data jsonb not null default '{}'::jsonb
);
create index if not exists email_queue_due_idx      on email_queue (scheduled_for) where status = 'pending';
create index if not exists email_queue_prospect_idx on email_queue (prospect_id)   where status = 'pending';
create index if not exists email_queue_status_idx   on email_queue (status, scheduled_for desc);
alter table email_queue enable row level security;
drop policy if exists "auth all email_queue" on email_queue;
create policy "auth all email_queue"
  on email_queue for all to authenticated using (true) with check (true);`;

async function authedFetch(url) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || "";
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

function EmailLogInner() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [data, setData] = useState(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("sends"); // 'sends' | 'queue'

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSetupRequired(false);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (status) params.set("status", status);
      const res = await authedFetch(`/api/email-log?${params.toString()}`);
      const json = await res.json();
      if (json?.setupRequired) {
        setSetupRequired(true);
      } else if (!res.ok) {
        setError(json.error || "Could not load email log");
      } else {
        setData(json);
      }
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const processNow = async () => {
    setProcessing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || "";
      const res = await fetch("/api/email-queue/process", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Could not run the queue");
      } else if (!json.processed) {
        toast.success("No chase emails due right now.");
      } else {
        toast.success(`Worker ran — sent ${json.sent}, cancelled ${json.cancelled}, failed ${json.failed}`);
      }
      load();
    } catch (err) {
      toast.error("Worker error: " + String(err?.message || err));
    } finally {
      setProcessing(false);
    }
  };

  const [checkingReplies, setCheckingReplies] = useState(false);
  const checkReplies = async () => {
    setCheckingReplies(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || "";
      const res = await fetch("/api/gmail/poll", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (json.notConfigured) {
        toast.error("Gmail isn't connected yet — see Settings for setup.");
      } else if (!res.ok) {
        toast.error(json.error || "Could not check inbox");
      } else {
        toast.success(`Scanned ${json.scanned} · matched ${json.matched} reply${json.matched === 1 ? "" : "s"}`);
        load();
      }
    } catch (err) {
      toast.error("Check failed: " + String(err?.message || err));
    } finally {
      setCheckingReplies(false);
    }
  };

  const supabaseProjectRef = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
    return m ? m[1] : null;
  }, []);

  const sqlEditorUrl = supabaseProjectRef
    ? `https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new`
    : "https://supabase.com/dashboard";

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(MIGRATION_SQL);
      toast.success("Migration SQL copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select the SQL and copy manually.");
    }
  };

  // ---------- SETUP REQUIRED ----------
  if (setupRequired) {
    return (
      <>
        <PageHeader
          title="Email log"
          subtitle="One-time setup needed before the first email"
          back={{ href: "/campaigns", label: "Back to Campaigns" }}
          actions={
            <button className="btn-secondary flex items-center gap-2" onClick={load}>
              <FiRefreshCw /> Re-check
            </button>
          }
        />
        <div className="p-4 sm:p-8">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-700/40 dark:bg-amber-950/30">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500 text-white">
                <FiDatabase className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-amber-900 dark:text-amber-200">
                  One-time database setup
                </h2>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                  The email-tracking table doesn&rsquo;t exist yet. Three steps, about 30 seconds:
                </p>
              </div>
            </div>

            <ol className="space-y-3 text-sm text-amber-900 dark:text-amber-200">
              <li className="flex items-start gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200 text-xs font-bold text-amber-900">1</span>
                <div className="flex-1">
                  <p className="font-semibold">Copy the migration SQL</p>
                  <button
                    onClick={copySql}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100"
                  >
                    <FiCopy /> Copy SQL to clipboard
                  </button>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200 text-xs font-bold text-amber-900">2</span>
                <div className="flex-1">
                  <p className="font-semibold">Open Supabase SQL Editor → paste → Run</p>
                  <a
                    href={sqlEditorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100"
                  >
                    <FiExternalLink /> Open SQL Editor for your project
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200 text-xs font-bold text-amber-900">3</span>
                <div className="flex-1">
                  <p className="font-semibold">Come back and click Re-check</p>
                  <button
                    onClick={load}
                    className="mt-1 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                  >
                    <FiRefreshCw /> Re-check now
                  </button>
                </div>
              </li>
            </ol>

            <details className="mt-5">
              <summary className="cursor-pointer text-xs font-semibold text-amber-800 dark:text-amber-300">
                View the SQL
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-amber-900/90 p-3 text-[11px] leading-relaxed text-amber-100">{MIGRATION_SQL}</pre>
            </details>
          </div>
        </div>
      </>
    );
  }

  // ---------- NORMAL VIEW ----------
  const quota = data?.quota;
  const pct = quota ? Math.min(100, Math.round((quota.sentToday / quota.dailyCap) * 100)) : 0;
  const quotaColor =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-brand-500";

  const filtered = (data?.sends || []).filter((s) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      s.to_email?.toLowerCase().includes(needle) ||
      s.subject?.toLowerCase().includes(needle) ||
      s.campaign_label?.toLowerCase().includes(needle) ||
      s.prospect_id?.toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <PageHeader
        title="Email log"
        subtitle="Daily quota, send history, and reply tracking"
        back={{ href: "/campaigns", label: "Back to Campaigns" }}
        actions={
          <>
            <Link href="/prospects" className="btn-primary flex items-center gap-2">
              <FiSend /> Start a campaign
            </Link>
            <button className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading}>
              <FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </>
        }
      />

      <div className="p-4 sm:p-8 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {/* HOW EMAIL WORKS — workflow explainer (always visible) */}
        <WorkflowCard />

        {/* Quota meter */}
        {quota && (
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-navy-500">
                  Today&rsquo;s sends
                </h2>
                <p className="mt-0.5 text-2xl font-bold text-navy-900 dark:text-slate-100">
                  {quota.sentToday}
                  <span className="text-base font-normal text-navy-400"> / {quota.dailyCap}</span>
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-navy-500">Remaining</p>
                <p className="text-2xl font-bold text-navy-900 dark:text-slate-100">{quota.remaining}</p>
              </div>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-100 dark:bg-white/10">
              <div className={`h-full transition-all ${quotaColor}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30">
                <p className="font-bold text-emerald-700 dark:text-emerald-300">{quota.breakdown.sent}</p>
                <p className="text-navy-500">Sent today</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950/30">
                <p className="font-bold text-blue-700 dark:text-blue-300">{quota.breakdown.replied}</p>
                <p className="text-navy-500">Replied today</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2 dark:bg-rose-950/30">
                <p className="font-bold text-rose-700 dark:text-rose-300">{quota.breakdown.failed}</p>
                <p className="text-navy-500">Failed today</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-navy-400">
              Gmail&rsquo;s daily cap resets at midnight UTC. We cap at {quota.dailyCap} (Gmail&rsquo;s ~500 limit
              minus headroom) to stay clear of spam flags.
            </p>
          </div>
        )}

        {/* 30-day stats */}
        {data?.stats30d && (
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-navy-500">Last 30 days</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Sent" value={data.stats30d.sent} color="text-navy-900 dark:text-slate-100" />
              <Stat label="Replied" value={data.stats30d.replied} color="text-blue-700 dark:text-blue-300" />
              <Stat label="Reply rate" value={`${data.stats30d.replyRate}%`} color="text-emerald-700 dark:text-emerald-300" />
            </div>
          </div>
        )}

        {/* Tabs: Sends / Queue */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTab("sends")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === "sends" ? "bg-navy-900 text-white" : "bg-white text-navy-700 border border-navy-200 dark:bg-navy-800 dark:border-white/10 dark:text-slate-200"}`}
          >
            <FiList /> Sent ({data?.sends?.length || 0})
          </button>
          <button
            onClick={() => setTab("queue")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === "queue" ? "bg-navy-900 text-white" : "bg-white text-navy-700 border border-navy-200 dark:bg-navy-800 dark:border-white/10 dark:text-slate-200"}`}
          >
            <FiClock /> In queue ({(data?.queueCounts?.pending || 0) + (data?.queueCounts?.sending || 0)})
          </button>
          {tab === "queue" && (data?.queueCounts?.pending || 0) + (data?.queueCounts?.sending || 0) > 0 && (
            <button
              onClick={processNow}
              disabled={processing}
              className="btn-primary flex items-center gap-2 text-xs disabled:opacity-60"
            >
              <FiZap className={processing ? "animate-pulse" : ""} /> {processing ? "Running…" : "Process now"}
            </button>
          )}
          <button
            onClick={checkReplies}
            disabled={checkingReplies}
            className="btn-secondary flex items-center gap-2 text-xs disabled:opacity-60"
            title="Poll Gmail inbox for replies and update the log"
          >
            <FiCornerUpLeft className={checkingReplies ? "animate-pulse" : ""} />
            {checkingReplies ? "Checking…" : "Check replies"}
          </button>
        </div>

        {/* Filters (only for Sends tab) */}
        {tab === "sends" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-60">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <input
                className="input pl-9"
                placeholder="Search recipient, subject, campaign, prospect id…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="replied">Replied</option>
              <option value="failed">Failed</option>
            </select>
            {(q || status) && (
              <button className="btn-secondary" onClick={() => { setQ(""); setStatus(""); }}>
                <FiX /> Clear
              </button>
            )}
            <span className="ml-auto text-sm text-navy-500">{filtered.length} rows</span>
          </div>
        )}

        {/* Send log table */}
        {tab === "sends" && (
        <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-navy-600 dark:bg-navy-800/50 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">To</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Campaign</th>
                <th className="px-4 py-3 font-semibold">Reply</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-navy-400">No sends yet.</p>
                    <Link href="/prospects" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
                      Start your first campaign in Prospects <FiArrowRight />
                    </Link>
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-navy-100 dark:border-white/5">
                  <td className="px-4 py-3 text-navy-600 dark:text-slate-300 whitespace-nowrap">
                    {fmtDateTime(s.sent_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy-900 dark:text-slate-100">{s.to_email}</div>
                    {s.prospect_id && (
                      <Link href={`/prospects?focus=${s.prospect_id}`} className="text-xs text-brand-600 hover:underline">
                        {s.prospect_id}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs truncate text-navy-700 dark:text-slate-200" title={s.subject}>
                      {s.subject || "—"}
                    </div>
                    {s.error && (
                      <div className="max-w-xs truncate text-xs text-rose-500" title={s.error}>
                        {s.error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-navy-500 dark:text-slate-400">
                    {s.campaign_label || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.reply_snippet ? (
                      <div className="max-w-xs truncate text-xs text-navy-700 dark:text-slate-200" title={s.reply_snippet}>
                        {s.reply_snippet}
                      </div>
                    ) : <span className="text-navy-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Queue table */}
        {tab === "queue" && (
          <QueueTable data={data} loading={loading} />
        )}
      </div>
    </>
  );
}

function QueueTable({ data, loading }) {
  if (data?.queueAvailable === false) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
        The <code className="rounded bg-amber-100 px-1 text-xs dark:bg-amber-900/40">email_queue</code> table doesn&rsquo;t exist yet.
        Re-run the migration shown in the setup card (the page now creates both tables in one go).
      </div>
    );
  }
  const queue = data?.queue || [];
  if (!queue.length && !loading) {
    return (
      <div className="rounded-xl border border-dashed border-navy-200 p-10 text-center dark:border-white/10">
        <FiClock className="mx-auto mb-2 text-2xl text-navy-400" />
        <p className="text-sm text-navy-500">
          No chase emails scheduled. Tick <strong>Schedule a follow-up chase</strong> on your next campaign
          to queue them automatically.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white dark:border-white/10 dark:bg-navy-900">
      <table className="w-full text-sm">
        <thead className="bg-navy-50 text-left text-navy-600 dark:bg-navy-800/50 dark:text-slate-300">
          <tr>
            <th className="px-4 py-3 font-semibold">Scheduled for</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">To</th>
            <th className="px-4 py-3 font-semibold">Subject</th>
            <th className="px-4 py-3 font-semibold">Campaign</th>
            <th className="px-4 py-3 font-semibold">Step</th>
            <th className="px-4 py-3 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((q) => (
            <tr key={q.id} className="border-t border-navy-100 dark:border-white/5">
              <td className="px-4 py-3 text-navy-600 dark:text-slate-300 whitespace-nowrap">
                {fmtDateTime(q.scheduled_for)}
              </td>
              <td className="px-4 py-3"><QueueStatusPill status={q.status} /></td>
              <td className="px-4 py-3 text-navy-900 dark:text-slate-100">{q.to_email}</td>
              <td className="px-4 py-3">
                <div className="max-w-xs truncate text-navy-700 dark:text-slate-200" title={q.subject}>
                  {q.subject}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-navy-500 dark:text-slate-400">{q.campaign_label || "—"}</td>
              <td className="px-4 py-3 text-xs text-navy-500">#{q.step_index}</td>
              <td className="px-4 py-3 text-xs">
                {q.cancelled_reason && <span className="text-blue-600">Cancelled: {q.cancelled_reason}</span>}
                {q.failure_reason && <span className="text-rose-600" title={q.failure_reason}>{q.failure_reason.slice(0, 60)}</span>}
                {!q.cancelled_reason && !q.failure_reason && <span className="text-navy-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueueStatusPill({ status }) {
  const map = {
    pending: { bg: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", label: "Pending" },
    sending: { bg: "bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300", label: "Sending…" },
    sent: { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", label: "Sent" },
    cancelled: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", label: "Cancelled" },
    failed: { bg: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", label: "Failed" },
  };
  const c = map[status] || { bg: "bg-navy-100 text-navy-700", label: status };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${c.bg}`}>
      {c.label}
    </span>
  );
}

function WorkflowCard() {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/30 dark:bg-brand-950/30">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
        <FiMail /> How the email system works
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WorkflowStep
          n={1}
          icon={FiTarget}
          title="Send from Prospects"
          body="Filter to a cohort, open Email campaign, write once, send to all. Throttled one-at-a-time — no spam flags. Server caps at 400/day."
          cta={{ href: "/prospects", label: "Open Prospects" }}
        />
        <WorkflowStep
          n={2}
          icon={FiClock}
          title="Chase auto-queues"
          body="Tick 'Schedule a chase' and a follow-up is queued for each recipient (default 3 days). The worker fires them on time, respecting the daily cap."
        />
        <WorkflowStep
          n={3}
          icon={FiInbox}
          title="Replies cancel & tag"
          body="When someone replies: their email_sends row is marked Replied, any pending chases for them are cancelled, and their stage auto-bumps to Interested."
        />
        <WorkflowStep
          n={4}
          icon={FiPlay}
          title="Observe here"
          body="Daily quota, reply rate, every send searchable, scheduled chases visible. Manual 'Process now' button if you don't want to wait for the cron."
        />
      </div>
    </div>
  );
}

function WorkflowStep({ n, icon: Icon, title, body, cta }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-brand-100 dark:bg-navy-900/60 dark:ring-brand-500/20">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
          {n}
        </span>
        <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <h3 className="text-sm font-bold text-navy-900 dark:text-slate-100">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-navy-600 dark:text-slate-400">{body}</p>
      {cta && (
        <Link href={cta.href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          {cta.label} <FiArrowRight />
        </Link>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border border-navy-100 p-3 text-center dark:border-white/10">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-navy-500">{label}</p>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    sent: { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", icon: FiCheckCircle, label: "Sent" },
    replied: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", icon: FiCornerUpLeft, label: "Replied" },
    failed: { bg: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", icon: FiAlertCircle, label: "Failed" },
  };
  const c = map[status] || { bg: "bg-navy-100 text-navy-700", icon: FiMail, label: status };
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${c.bg}`}>
      <Icon className="h-3 w-3" /> {c.label}
    </span>
  );
}

export default function EmailLogPage() {
  return (
    <RequirePermission perm="prospects">
      <EmailLogInner />
    </RequirePermission>
  );
}
