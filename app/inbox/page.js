"use client";

// Inbox — live Gmail feed.
// Hits /api/gmail/inbox on mount and on demand. No DB persistence; what you
// see is the current state of the mailbox. Click a row → slide-over with
// the full message body (fetched on demand from /api/gmail/message).

import Link from "next/link";
import Conversations from "@/components/Conversations";
import { useStore } from "@/lib/store";
import { statusMeta } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { uploadFile } from "@/lib/uploads";
import { renderTemplate, buildContext } from "@/lib/email";

// Client-facing templates worth offering in a reply (not outreach ones).
const JOB_REPLY_TEMPLATES = ["quote", "followup", "booking", "reminder", "invoice", "receipt", "certificate", "renewal", "review_request"];
import { useEffect, useMemo, useState } from "react";
import {
  FiInbox, FiSend, FiSearch, FiRefreshCw, FiX, FiMail, FiArrowDown, FiArrowUp, FiStar, FiAlertCircle,
} from "react-icons/fi";
import PageHeader from "@/components/PageHeader";
import DetailSlideOver from "@/components/DetailSlideOver";
import RequirePermission from "@/components/RequirePermission";
import { supabase } from "@/lib/supabase";
import DOMPurify from "dompurify";

// The gmail routes require a signed-in user's JWT.
async function authHeaders() {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token || "";
  return { Authorization: `Bearer ${token}` };
}

function relativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const delta = (Date.now() - d.getTime()) / 1000;
  if (delta < 60) return "just now";
  if (delta < 3600) return Math.floor(delta / 60) + "m";
  if (delta < 86400) return Math.floor(delta / 3600) + "h";
  if (delta < 86400 * 7) return Math.floor(delta / 86400) + "d";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtFull(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function InboxInner() {
  const [box, setBox] = useState("all"); // all | inbox | sent
  // Two views: every client conversation as logged on the jobs (default —
  // it shows who is waiting on us), or the raw Gmail mailbox.
  const [mode, setMode] = useState("conversations");
  const { clients, jobs, logActivity, updateJob, templates, email: emailSettings } = useStore();
  // Which client an address belongs to, and their most recent open job.
  const jobFor = (email) => {
    const e = String(email || "").toLowerCase();
    if (!e) return null;
    const c = clients.find((x) => String(x.email || "").toLowerCase() === e || String(x.billingEmail || "").toLowerCase() === e || (x.contacts || []).some((k) => String(k.email || "").toLowerCase() === e));
    if (!c) return null;
    const mine = jobs.filter((j) => j.clientId === c.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return { client: c, job: mine.find((j) => !["paid", "cancelled"].includes(j.status)) || mine[0] || null };
  };
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [messages, setMessages] = useState([]);
  const [me, setMe] = useState("");
  const [active, setActive] = useState(null); // selected message for slide-over

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr(null);
    try {
      const r = await fetch(`/api/gmail/inbox?box=${box}&limit=50`, { cache: "no-store", headers: await authHeaders() });
      if (r.status === 503) {
        const j = await r.json().catch(() => ({}));
        if (j.notConfigured) { setNotConfigured(true); setMessages([]); return; }
      }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
      const j = await r.json();
      setNotConfigured(false);
      setMessages(j.messages || []);
      setMe(j.me || "");
    } catch (e) {
      setErr(e.message || "Could not load inbox");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [box]);
  // Auto-refresh every 60s, silently.
  useEffect(() => {
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
    /* eslint-disable-next-line */
  }, [box]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return messages;
    return messages.filter((m) => `${m.subject} ${m.from?.name} ${m.from?.email} ${m.to?.name} ${m.to?.email} ${m.snippet}`.toLowerCase().includes(n));
  }, [messages, q]);

  const counts = useMemo(() => {
    const c = { all: messages.length, inbox: 0, sent: 0, unread: 0 };
    for (const m of messages) {
      if (m.kind === "inbox") c.inbox++;
      else if (m.kind === "sent") c.sent++;
      if (m.unread) c.unread++;
    }
    return c;
  }, [messages]);

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Live Gmail feed — incoming and outgoing"
        back={{ label: "Back" }}
        actions={
          <button onClick={() => load()} disabled={refreshing}
            className="btn-secondary flex items-center gap-2">
            <FiRefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      <div className="px-4 pt-4 sm:px-8">
        <div className="inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
          <TabBtn label="Client conversations" active={mode === "conversations"} onClick={() => setMode("conversations")} />
          <TabBtn label="Gmail mailbox" active={mode === "gmail"} onClick={() => setMode("gmail")} />
        </div>
      </div>

      <div className="p-4 sm:p-8">
        {mode === "conversations" ? (
          <Conversations />
        ) : notConfigured ? (
          <NotConfigured />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-navy-200 bg-white p-0.5 dark:border-white/10 dark:bg-navy-900">
                <TabBtn label="All" count={counts.all} active={box === "all"} onClick={() => setBox("all")} />
                <TabBtn label="Inbox" count={counts.inbox} active={box === "inbox"} onClick={() => setBox("inbox")} icon={<FiArrowDown className="h-3.5 w-3.5" />} />
                <TabBtn label="Sent" count={counts.sent} active={box === "sent"} onClick={() => setBox("sent")} icon={<FiArrowUp className="h-3.5 w-3.5" />} />
              </div>
              <div className="relative flex-1 max-w-md">
                <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                <input className="input pl-9 w-full" placeholder="Search subject, sender, body…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-700"><FiX /></button>}
              </div>
              <span className="ml-auto text-sm text-navy-500 dark:text-slate-400">
                {filtered.length} of {messages.length}
                {counts.unread > 0 && <> · <strong className="text-brand-600">{counts.unread} unread</strong></>}
              </span>
            </div>

            {err && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                <FiAlertCircle /> {err}
              </div>
            )}

            {loading ? (
              <SkeletonList />
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-navy-900">
                {filtered.map((m) => <Row key={m.id} m={m} me={me} onOpen={setActive} linked={jobFor(m.kind === "inbox" ? m.from?.email : m.to?.email)} />)}
              </ul>
            )}
          </>
        )}
      </div>

      <MessageDrawer
        message={active}
        onClose={() => setActive(null)}
        linked={active ? jobFor(active.kind === "inbox" ? active.from?.email : active.to?.email) : null}
        jobs={jobs}
        templates={templates}
        emailSettings={emailSettings}
        onSaveAttachment={async (job, message, att) => {
          // Fetch the file from Gmail, store it like any other job document.
          try {
            const r = await fetch(`/api/gmail/attachment?id=${message.id}&att=${encodeURIComponent(att.id)}`, { cache: "no-store", headers: await authHeaders() });
            const d = await r.json();
            if (!r.ok || !d.base64) throw new Error(d.error || "Couldn't fetch the file.");
            const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
            const up = await uploadFile(new File([bytes], att.name, { type: att.type }), `jobs/${job.id}`);
            updateJob(job.id, { attachments: [{ id: "att-" + Date.now().toString(36), ...up, addedAt: new Date().toISOString(), fromEmail: message.id }, ...(job.attachments || [])] });
            toast.success(`${att.name} saved to ${job.id}.`);
          } catch (e) { toast.error(String(e.message || e)); }
        }}
        onReplied={(job, message, text) => {
          if (job) logActivity(job.id, { type: "email", title: `Reply sent from the inbox — Re: ${message.subject || ""}`, detail: text, to: message.from?.email });
        }}
        onFile={(job, message, text) => {
          if ((job.activity || []).some((a) => a.meta?.messageId === message.id)) { toast("That email is already on the job."); return; }
          logActivity(job.id, {
            type: "email", direction: message.kind === "inbox" ? "in" : undefined,
            title: message.kind === "inbox" ? "Email from client (filed from the inbox)" : "Email sent (filed from the inbox)",
            detail: `Subject: ${message.subject || ""}\n\n${String(text || message.snippet || "").slice(0, 4000)}`,
            at: message.date, by: message.from?.email || "", meta: { messageId: message.id },
          });
          toast.success(`Filed on ${job.id}.`);
        }}
      />
    </>
  );
}

function TabBtn({ label, count, active, onClick, icon }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "bg-navy-900 text-white dark:bg-white/10" : "text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/5"
      }`}>
      {icon}
      {label}
      {count != null && (
        <span className={`rounded-full px-1.5 text-[10px] font-bold ${
          active ? "bg-white/20" : "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300"
        }`}>{count}</span>
      )}
    </button>
  );
}

function Row({ m, me, onOpen, linked }) {
  const isInbound = m.kind === "inbox";
  const other = isInbound ? m.from : m.to;
  const display = other?.name || other?.email || "—";
  return (
    <li>
      <button onClick={() => onOpen(m)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-navy-50 dark:hover:bg-white/5">
        <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
          isInbound
            ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
            : "bg-navy-100 text-navy-600 dark:bg-white/10 dark:text-slate-300"
        }`}>
          {isInbound ? <FiArrowDown className="h-4 w-4" /> : <FiArrowUp className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`truncate text-sm ${m.unread ? "font-bold text-navy-900 dark:text-white" : "font-semibold text-navy-800 dark:text-slate-100"}`}>
              {display}
            </span>
            {m.starred && <FiStar className="h-3 w-3 shrink-0 text-amber-500" />}
            {m.unread && <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">New</span>}
            <span className="ml-auto shrink-0 text-[11px] text-navy-400 dark:text-slate-500" title={fmtFull(m.date)}>{relativeTime(m.date)}</span>
          </div>
          <div className={`truncate text-sm ${m.unread ? "font-semibold text-navy-800 dark:text-slate-200" : "text-navy-700 dark:text-slate-300"}`}>
            {m.subject || "(no subject)"}
          </div>
          <div className="mt-0.5 truncate text-xs text-navy-500 dark:text-slate-400">{m.snippet}</div>
          {linked?.job && (
            <div className="mt-1 text-[11px] font-semibold text-brand-700">{linked.client.name} · {linked.job.id} · {statusMeta(linked.job.status)?.label || linked.job.status}</div>
          )}
        </div>
      </button>
    </li>
  );
}

function MessageDrawer({ message, onClose, linked, jobs = [], onFile, onSaveAttachment, onReplied, templates = {}, emailSettings = {} }) {
  const [pick, setPick] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState("");
  useEffect(() => { setReply(""); setPick(""); }, [message?.id]);
  // Start the reply from a saved template, filled in from the linked job
  // where there is one. The signature is added once, at the end.
  const startFrom = (key) => {
    const tpl = templates[key];
    if (!tpl) return;
    const ctx = buildContext({ job: linked?.job || null, client: linked?.client || { name: message.from?.name || "" }, property: linked?.client?.properties?.find((p) => p.id === linked?.job?.propertyId) || null, email: emailSettings });
    const sig = emailSettings.signature ? `\n\n${renderTemplate(emailSettings.signature, ctx)}` : "";
    setReply(renderTemplate(tpl.body, ctx) + sig);
  };
  const sendReply = async () => {
    const to = message.from?.email;
    if (!to || reply.trim().length < 2) return;
    setSending(true);
    try {
      const r = await fetch("/api/send-email", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: /^re:/i.test(message.subject || "") ? message.subject : `Re: ${message.subject || ""}`, text: reply, fromName: emailSettings.fromName, replyTo: emailSettings.replyTo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Couldn't send (${r.status}).`);
      onReplied?.(linked?.job || null, message, reply);
      toast.success(`Reply sent to ${to}.`);
      setReply("");
    } catch (e) { toast.error(String(e.message || e)); }
    setSending(false);
  };
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!message) { setFull(null); return; }
    let cancelled = false;
    setLoading(true);
    authHeaders()
      .then((headers) => fetch(`/api/gmail/message?id=${message.id}`, { cache: "no-store", headers }))
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setFull(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [message?.id]);

  if (!message) return <DetailSlideOver open={false} onClose={onClose} />;
  const isInbound = message.kind === "inbox";
  const other = isInbound ? message.from : message.to;

  return (
    <DetailSlideOver
      open={!!message}
      onClose={onClose}
      title={message.subject || "(no subject)"}
      subtitle={`${isInbound ? "From" : "To"} ${other?.name || other?.email || "—"} · ${fmtFull(message.date)}`}
      actions={
        <span className={`badge ${isInbound ? "badge-brand" : "badge-navy"}`}>
          {isInbound ? "Inbound" : "Sent"}
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <a href={`https://mail.google.com/mail/u/0/#all/${message.id}`} target="_blank" rel="noreferrer"
            className="btn-secondary inline-flex items-center gap-2">
            <FiMail /> Open in Gmail
          </a>
          {/* Put this email on a job's record — the job it matches, or one
              you choose by reference. */}
          {linked?.job ? (
            <>
              <button type="button" className="btn-outline" onClick={() => onFile(linked.job, message, full?.text)}>File on {linked.job.id}</button>
              <Link href={`/jobs/${linked.job.id}`} className="btn-outline">Open {linked.job.id}</Link>
            </>
          ) : (
            <>
              <input className="input h-10 w-32" placeholder="JOB-1234" value={pick} onChange={(e) => setPick(e.target.value.toUpperCase())} aria-label="Job reference to file this email on" />
              <button type="button" className="btn-outline" disabled={!jobs.some((j) => j.id === pick.trim())} onClick={() => onFile(jobs.find((j) => j.id === pick.trim()), message, full?.text)}>File on job</button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <section className="rounded-xl bg-navy-50 p-3 text-xs dark:bg-white/5">
          <div className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-1">
            <span className="font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">From</span>
            <span className="truncate text-navy-800 dark:text-slate-100">{full?.from || `${message.from?.name || ""} <${message.from?.email || ""}>`}</span>
            <span className="font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">To</span>
            <span className="truncate text-navy-800 dark:text-slate-100">{full?.to || `${message.to?.name || ""} <${message.to?.email || ""}>`}</span>
            {full?.cc && (<>
              <span className="font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Cc</span>
              <span className="truncate text-navy-800 dark:text-slate-100">{full.cc}</span>
            </>)}
          </div>
        </section>

        {loading ? (
          <div className="space-y-2">
            <div className="skeleton h-4" />
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-4/6" />
          </div>
        ) : full?.text ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-navy-800 dark:text-slate-200">{full.text}</pre>
        ) : full?.html ? (
          // Inbound email HTML is attacker-controlled — sanitize before rendering
          // or a crafted email could run JS in the operator's session.
          <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(full.html, { FORBID_TAGS: ["style", "form", "input"], ADD_ATTR: ["target"] }) }} />
        ) : (
          <p className="text-sm text-navy-500 dark:text-slate-400">{message.snippet || "No preview available."}</p>
        )}

        {/* Files that came with the email — save one straight onto the job. */}
        {(full?.attachments || []).length > 0 && (
          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Attachments</p>
            <ul className="space-y-1.5">
              {full.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 px-3 py-2 text-sm dark:border-white/10">
                  <span className="min-w-0 truncate text-navy-800 dark:text-slate-100">{a.name} <span className="text-xs text-navy-400">· {Math.max(1, Math.round((a.size || 0) / 1024))} KB</span></span>
                  {linked?.job ? (
                    <button type="button" className="btn-outline shrink-0 py-1 text-xs" disabled={saving === a.id} onClick={async () => { setSaving(a.id); await onSaveAttachment(linked.job, message, a); setSaving(""); }}>
                      {saving === a.id ? "Saving…" : `Save to ${linked.job.id}`}
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-navy-400">Link the sender to a client to save it</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Reply from here, starting from a saved template if one fits. */}
        {isInbound && message.from?.email && (
          <section className="border-t border-navy-100 pt-4 dark:border-white/10">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-500 dark:text-slate-400">Reply to {message.from.email}</p>
              <select className="input h-8 w-auto py-0 text-xs" value="" onChange={(e) => { startFrom(e.target.value); e.target.value = ""; }} aria-label="Start from a template">
                <option value="">Start from a template…</option>
                {JOB_REPLY_TEMPLATES.filter((k) => templates[k]).map((k) => <option key={k} value={k}>{templates[k].name}</option>)}
              </select>
            </div>
            <textarea className="input resize-y text-sm" rows={6} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your reply…" />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-navy-400">{linked?.job ? `Will be logged on ${linked.job.id}.` : "Not linked to a job — it won't be logged on one."}</span>
              <button type="button" className="btn-primary" disabled={sending || reply.trim().length < 2} onClick={sendReply}>{sending ? "Sending…" : "Send reply"}</button>
            </div>
          </section>
        )}
      </div>
    </DetailSlideOver>
  );
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-navy-900">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="skeleton h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy-200 p-12 text-center dark:border-white/10">
      <FiInbox className="mx-auto mb-3 text-2xl text-navy-300 dark:text-slate-600" />
      <p className="text-sm text-navy-500 dark:text-slate-400">No messages match this view.</p>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="mb-2 flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
        <FiAlertCircle /> Gmail isn&rsquo;t connected yet
      </div>
      <p className="text-amber-900 dark:text-amber-200">
        Set <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code> and <code>GMAIL_REFRESH_TOKEN</code> on the
        deployment, then refresh this page. (The Sent &amp; Reply-matching infra in <code>/api/gmail/poll</code> uses the same credentials.)
      </p>
    </div>
  );
}

export default function InboxPage() {
  return (
    <RequirePermission perm="prospects">
      <InboxInner />
    </RequirePermission>
  );
}
