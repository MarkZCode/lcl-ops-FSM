"use client";

// Every client conversation in one list — emails, WhatsApp messages and
// calls, as logged on their jobs — with the ones waiting on us at the top.
// This is the "who haven't we answered?" view; the Gmail tab beside it is
// the raw mailbox.
import { useMemo, useState } from "react";
import Link from "next/link";
import { FiSearch, FiCheck, FiMail, FiPhone, FiMessageCircle } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { unansweredReply } from "@/lib/nextAction";
import { statusMeta } from "@/lib/constants";
import { toast } from "@/lib/toast";

const span = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
const ICON = { email: FiMail, whatsapp: FiMessageCircle, call: FiPhone };

export default function Conversations() {
  const { jobs, clients, updateJob } = useStore();
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("all");
  const [only, setOnly] = useState("all");

  const rows = useMemo(() => {
    const out = [];
    for (const j of jobs) {
      const msgs = (j.activity || []).filter((a) => ["email", "whatsapp", "call"].includes(a.type) || a.direction === "in");
      if (!msgs.length) continue;
      const last = msgs.reduce((a, b) => (new Date(b.at) > new Date(a.at) ? b : a));
      const waiting = unansweredReply(j);
      const client = clients.find((c) => c.id === j.clientId);
      out.push({
        job: j, client, last, waiting,
        waitMs: waiting ? Date.now() - new Date(waiting.at).getTime() : 0,
        text: msgs.map((m) => `${m.title || ""} ${m.detail || ""}`).join(" ").toLowerCase(),
        channels: new Set(msgs.map((m) => m.type)),
      });
    }
    return out.sort((a, b) => (b.waiting ? 1 : 0) - (a.waiting ? 1 : 0) || (a.waiting ? b.waitMs - a.waitMs : new Date(b.last.at) - new Date(a.last.at)));
  }, [jobs, clients]);

  const shown = rows.filter((r) => {
    if (only === "waiting" && !r.waiting) return false;
    if (channel !== "all" && !r.channels.has(channel)) return false;
    const n = q.trim().toLowerCase();
    return !n || `${r.client?.name || ""} ${r.job.id} ${r.text}`.toLowerCase().includes(n);
  });
  const waiting = rows.filter((r) => r.waiting);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input className="input w-full pl-9" placeholder="Search every message…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input h-10 w-auto" value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Which conversations">
          <option value="all">All conversations</option>
          <option value="waiting">Waiting on us</option>
        </select>
        <select className="input h-10 w-auto" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
          <option value="all">Any channel</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="call">Calls</option>
        </select>
        <span className={`text-sm ${waiting.length ? "font-semibold text-rose-600" : "text-navy-500"}`}>
          {waiting.length ? `${waiting.length} waiting on us · longest ${span(Math.max(...waiting.map((r) => r.waitMs)))}` : "Nobody is waiting on a reply"}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center text-sm text-navy-500">No conversations match.</div>
      ) : (
        <ul className="divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-navy-900">
          {shown.slice(0, 200).map((r) => {
            const Icon = ICON[r.last.type] || FiMail;
            const inbound = r.last.direction === "in";
            const first = String(r.last.detail || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^subject:/i.test(l))[0] || "";
            return (
              <li key={r.job.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${r.waiting ? "bg-rose-100 text-rose-600" : "bg-navy-100 text-navy-600"}`}><Icon className="h-4 w-4" /></span>
                <Link href={`/jobs/${r.job.id}`} className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-sm font-semibold text-navy-900">{r.client?.name || "Unknown client"}</span>
                    <span className="text-xs text-navy-500">{r.job.id} · {statusMeta(r.job.status)?.label || r.job.status}</span>
                    {r.waiting && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Waiting {span(r.waitMs)}</span>}
                  </span>
                  <span className="block truncate text-sm text-navy-700">{inbound ? "They said: " : "We said: "}{r.last.title}{first ? ` — ${first}` : ""}</span>
                  <span className="block text-[11px] text-navy-400">{new Date(r.last.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </Link>
                {r.waiting && (
                  <button type="button" className="btn-outline shrink-0 py-1 text-xs" title="Nothing needs sending — stop flagging this" onClick={() => { updateJob(r.job.id, { replyHandledAt: new Date().toISOString() }); toast("Marked as handled"); }}>
                    <FiCheck /> Handled
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
