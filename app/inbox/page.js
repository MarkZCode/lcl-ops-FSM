"use client";

// Inbox — live Gmail feed.
// Hits /api/gmail/inbox on mount and on demand. No DB persistence; what you
// see is the current state of the mailbox. Click a row → slide-over with
// the full message body (fetched on demand from /api/gmail/message).

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
        actions={
          <button onClick={() => load()} disabled={refreshing}
            className="btn-secondary flex items-center gap-2">
            <FiRefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      <div className="p-4 sm:p-8">
        {notConfigured ? (
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
                {filtered.map((m) => <Row key={m.id} m={m} me={me} onOpen={setActive} />)}
              </ul>
            )}
          </>
        )}
      </div>

      <MessageDrawer message={active} onClose={() => setActive(null)} />
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
      <span className={`rounded-full px-1.5 text-[10px] font-bold ${
        active ? "bg-white/20" : "bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-slate-300"
      }`}>{count}</span>
    </button>
  );
}

function Row({ m, me, onOpen }) {
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
        </div>
      </button>
    </li>
  );
}

function MessageDrawer({ message, onClose }) {
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
        <a href={`https://mail.google.com/mail/u/0/#all/${message.id}`} target="_blank" rel="noreferrer"
          className="btn-secondary inline-flex items-center gap-2">
          <FiMail /> Open in Gmail
        </a>
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
