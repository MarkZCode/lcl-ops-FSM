"use client";

// Rich task-creation modal used by the /team workspace. Handles:
//   • Assignment to a named user or "Everyone"
//   • Due date + priority + reminder cadence
//   • Linked FSM entity (prospect / client / job / engineer) with typeahead
//     over the client-side store so the picker works instantly with no
//     server round-trip per keystroke.

import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiLink, FiX, FiSearch } from "react-icons/fi";
import Modal from "@/components/Modal";
import { useStore } from "@/lib/store";
import { PRIORITIES, CADENCES, LINK_KINDS } from "@/lib/tasks";
import { useAuth } from "@/lib/auth";
import { getJobLines } from "@/lib/format";
import { statusMeta } from "@/lib/constants";

const LINK_TYPES = [
  { kind: "none",     label: "Not linked" },
  { kind: "prospect", label: "Prospect" },
  { kind: "client",   label: "Client" },
  { kind: "job",      label: "Job" },
  { kind: "engineer", label: "Engineer" },
];

export default function NewTaskModal({ open, onClose, team, prefill, onCreate }) {
  const { prospects, clients, jobs, engineers } = useStore();
  const { user } = useAuth();
  // Who can be given a task: an admin can give one to anyone (agents
  // listed first — they do the work); an agent can only add to their own list.
  const isAdmin = user?.role === "admin";
  const people = isAdmin
    ? [...team.filter((t) => t.role !== "admin"), ...team.filter((t) => t.role === "admin")]
    : team.filter((t) => t.id === user?.id);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [cadence, setCadence] = useState("daily");
  const [linkKind, setLinkKind] = useState("none");
  const [linkedTo, setLinkedTo] = useState(null); // {kind, id, label}
  const [saving, setSaving] = useState(false);

  // Reset on open, apply prefill (used by the Suggested-tasks one-click flow).
  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title || "");
    setNotes(prefill?.notes || "");
    setAssigneeId(prefill?.assigneeId || (isAdmin ? (team.find((t) => t.role === "agent")?.id || "") : user?.id || ""));
    setDueDate(prefill?.dueDate || defaultDueDate(prefill?.dueOffsetDays));
    setPriority(prefill?.priority || "normal");
    setCadence(prefill?.cadence || "daily");
    setLinkKind(prefill?.linkedTo?.kind || "none");
    setLinkedTo(prefill?.linkedTo || null);
  }, [open, prefill]);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onCreate({
      title: title.trim(),
      notes: notes.trim(),
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      priority,
      reminderCadence: cadence,
      linkedTo: linkKind === "none" ? null : linkedTo,
    });
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={prefill?.title ? "Create task" : "New task"}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !title.trim()}>
            <FiPlus /> {saving ? "Creating…" : "Create task"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Task</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call back Janet Postma about EICR quote"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label">Assign to</label>
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              {isAdmin && <option value="">Everyone</option>}
              {people.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.role === "admin" ? " (admin)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Due date</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <div className="mt-1.5 flex gap-1">
              {[["Today", 0], ["Tomorrow", 1], ["Next week", 7]].map(([l, n]) => (
                <button key={l} type="button" onClick={() => setDueDate(dayFromNow(n))}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${dueDate === dayFromNow(n) ? "border-navy-800 bg-navy-800 text-white" : "border-navy-200 text-navy-600"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Reminder cadence</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {CADENCES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCadence(c.key)}
                className={`rounded-xl border p-3 text-left text-xs transition ${
                  cadence === c.key
                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
                    : "border-navy-200 hover:border-navy-300 dark:border-white/10"
                }`}
              >
                <p className="font-bold text-navy-800 dark:text-slate-100">{c.label}</p>
                <p className="mt-1 text-navy-500 dark:text-slate-400">{c.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Link to a record</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {LINK_TYPES.map((t) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => { setLinkKind(t.kind); if (t.kind === "none") setLinkedTo(null); }}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  linkKind === t.kind
                    ? "border-navy-800 bg-navy-800 text-white dark:bg-white/15"
                    : "border-navy-200 text-navy-600 hover:border-navy-300 dark:border-white/10 dark:text-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {linkKind !== "none" && (
            <EntityPicker
              kind={linkKind}
              pool={poolFor(linkKind, { prospects, clients, jobs, engineers })}
              selected={linkedTo}
              onSelect={setLinkedTo}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

// UK calendar date n days from today.
function dayFromNow(n) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + n * 86400000));
}

function defaultDueDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function poolFor(kind, { prospects, clients, jobs, engineers }) {
  if (kind === "prospect") return (prospects || []).map((p) => ({ id: p.id, label: p.nameOnCert || p.ownerName || "—", sub: p.address || "" }));
  if (kind === "client")   return (clients   || []).map((c) => ({ id: c.id, label: c.name || "—", sub: [c.phone, c.company || c.email, (c.properties || [])[0]?.postcode].filter(Boolean).join(" · "), find: [c.phone, c.email, ...(c.properties || []).map((p) => `${p.label} ${p.postcode}`)].join(" ") }));
  // A job is found and shown by WHO it is for and WHERE — nobody remembers
  // job numbers. Newest first.
  if (kind === "job") {
    const byId = new Map((clients || []).map((c) => [c.id, c]));
    return [...(jobs || [])]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .map((j) => {
        const c = byId.get(j.clientId);
        const prop = (c?.properties || []).find((p) => p.id === j.propertyId);
        const where = prop ? [prop.label !== prop.postcode ? prop.label : "", prop.postcode].filter(Boolean).join(", ") : "";
        const services = getJobLines(j).filter((l) => !["PARKING", "CONGESTION"].includes(l.code)).map((l) => l.name).join(", ");
        return {
          id: j.id,
          label: `${c?.name || "No client"} — ${j.id}`,
          sub: [where, services, statusMeta(j.status)?.label || j.status].filter(Boolean).join(" · "),
          find: [c?.phone, c?.email].join(" "),
        };
      });
  }
  if (kind === "engineer") return (engineers || []).map((e) => ({ id: e.id, label: e.name || e.id, sub: e.email || "" }));
  return [];
}

function EntityPicker({ kind, pool, selected, onSelect }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return pool.slice(0, 8);
    return pool
      .filter((r) => `${r.label} ${r.sub} ${r.find || ""}`.toLowerCase().includes(query))
      .slice(0, 20);
  }, [q, pool]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 dark:border-brand-500/40 dark:bg-brand-500/10">
        <FiLink className="h-3.5 w-3.5 text-brand-600 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">{LINK_KINDS[kind]?.label}</span>
          <p className="truncate font-semibold text-navy-900 dark:text-white">{selected.label}</p>
        </div>
        <button type="button" onClick={() => onSelect(null)} className="shrink-0 rounded-md p-1 text-brand-700 hover:bg-brand-100" aria-label="Clear link">
          <FiX className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
        <input
          className="input pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === "job" ? "Search by client name, postcode, address or job number…" : `Search ${LINK_KINDS[kind]?.label.toLowerCase() || "record"}…`}
        />
      </div>
      {results.length > 0 ? (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-navy-100 dark:border-white/10">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect({ kind, id: r.id, label: r.label })}
              className="flex w-full items-center gap-2 border-b border-navy-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-navy-50 dark:border-white/5 dark:hover:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-800 dark:text-slate-100">{r.label}</p>
                {r.sub && <p className="truncate text-xs text-navy-400 dark:text-slate-500">{r.sub}</p>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-center text-xs text-navy-400 py-3">No matches</p>
      )}
    </div>
  );
}
