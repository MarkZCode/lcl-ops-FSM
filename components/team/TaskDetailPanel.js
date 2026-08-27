"use client";

// Right-side slide-over showing a single task's full detail with:
//   • Header meta (assignee, due, priority, cadence, linked entity)
//   • Editable notes
//   • Timeline of updates + status changes (append-only)
//   • Comment box to add an update
//   • Quick action row (mark in-progress / done, delete)

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FiUser, FiUsers, FiCalendar, FiLink, FiBell, FiCheck, FiPlay,
  FiTrash2, FiSend, FiClock, FiExternalLink, FiMoon,
} from "react-icons/fi";
import DetailSlideOver from "@/components/DetailSlideOver";
import { useAuth } from "@/lib/auth";
import {
  priorityMeta, statusMeta, cadenceMeta, daysUntilDue, LINK_KINDS, SOURCE_LABELS,
  SNOOZE_OPTIONS, snoozeTask,
} from "@/lib/tasks";

export default function TaskDetailPanel({ task, onClose, onSave, onDelete }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    setNotes(task?.notes || "");
    setNotesDirty(false);
    setComment("");
  }, [task?.id]);

  if (!task) return <DetailSlideOver open={false} onClose={onClose} />;

  const p = priorityMeta(task.priority);
  const s = statusMeta(task.status);
  const c = cadenceMeta(task.reminderCadence);
  const daysLeft = daysUntilDue(task);

  const setStatus = (nextStatus) => {
    onSave({
      ...task,
      status: nextStatus,
      completedAt: nextStatus === "done" ? new Date().toISOString() : null,
      completedBy: nextStatus === "done" ? { id: user.id, name: user.name || user.email } : null,
      updates: [
        ...(task.updates || []),
        { at: new Date().toISOString(), by: { id: user.id, name: user.name || user.email }, kind: "status", text: `Marked ${statusMeta(nextStatus).label.toLowerCase()}` },
      ],
    });
  };

  const saveNotes = () => {
    if (!notesDirty) return;
    onSave({ ...task, notes });
    setNotesDirty(false);
  };

  const postComment = () => {
    const text = comment.trim();
    if (!text) return;
    onSave({
      ...task,
      updates: [
        ...(task.updates || []),
        { at: new Date().toISOString(), by: { id: user.id, name: user.name || user.email }, kind: "note", text },
      ],
    });
    setComment("");
  };

  return (
    <DetailSlideOver
      open={!!task}
      onClose={onClose}
      title={task.title}
      subtitle={`Created by ${task.createdBy?.name || "—"} · ${new Date(task.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
      width="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {task.status !== "done" && (
            <button className="btn-primary" onClick={() => setStatus("done")}>
              <FiCheck /> Mark done
            </button>
          )}
          {task.status === "open" && (
            <button className="btn-outline" onClick={() => setStatus("in_progress")}>
              <FiPlay /> Start
            </button>
          )}
          {task.status !== "done" && (
            <SnoozeMenu onSnooze={(days) => onSave(snoozeTask(task, days, { id: user.id, name: user.name || user.email }))} />
          )}
          {task.status === "done" && (
            <button className="btn-outline" onClick={() => setStatus("open")}>Reopen</button>
          )}
          <button className="btn-outline ml-auto text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => onDelete(task)}>
            <FiTrash2 /> Delete
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Meta strip */}
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Meta icon={task.assigneeId ? FiUser : FiUsers} label="Assigned" value={task.assigneeName || "Everyone"} />
          <Meta
            icon={FiCalendar}
            label="Due"
            value={task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
            tone={daysLeft != null && daysLeft < 0 ? "rose" : daysLeft != null && daysLeft <= 2 ? "amber" : "default"}
            sub={daysLeft == null ? null : daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `${daysLeft}d left`}
          />
          <Meta icon={FiBell} label="Cadence" value={c.label.replace(" (3× / day)", "")} />
          <Meta icon={FiClock} label="Status" value={s.label} chipClass={s.chip} />
        </div>

        {/* Priority + source */}
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${p.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} /> {p.label} priority
          </span>
          {task.source && task.source !== "manual" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100 px-2.5 py-1 text-xs font-semibold text-navy-600 dark:bg-white/10 dark:text-slate-400">
              Auto · {SOURCE_LABELS[task.source] || task.source}
            </span>
          )}
        </div>

        {/* Linked FSM entity */}
        {task.linkedTo && (
          <Link
            href={LINK_KINDS[task.linkedTo.kind]?.path(task.linkedTo.id) || "#"}
            className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 hover:border-brand-400 dark:border-brand-500/40 dark:bg-brand-500/10"
          >
            <FiLink className="h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                Linked {LINK_KINDS[task.linkedTo.kind]?.label || task.linkedTo.kind}
              </p>
              <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{task.linkedTo.label}</p>
            </div>
            <FiExternalLink className="h-4 w-4 shrink-0 text-brand-500" />
          </Link>
        )}

        {/* Notes */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0">Notes</label>
            {notesDirty && (
              <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={saveNotes}>
                Save
              </button>
            )}
          </div>
          <textarea
            className="input resize-none text-sm"
            rows={4}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
            placeholder="Add context, links, checklist…"
          />
        </div>

        {/* Comments / update thread */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-500 dark:text-slate-400">Activity</h3>
          {(task.updates || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-navy-200 py-4 text-center text-xs text-navy-400 dark:border-white/10">
              No updates yet. Add the first one below.
            </p>
          ) : (
            <ul className="space-y-2">
              {[...(task.updates || [])].reverse().map((u, i) => (
                <li key={i} className="rounded-xl border border-navy-100 bg-navy-50/50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-navy-800 dark:text-slate-200">{u.by?.name || "—"}</span>
                    <span className="text-[10px] text-navy-400">
                      {new Date(u.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-sm ${u.kind === "status" ? "italic text-navy-500" : "text-navy-800 dark:text-slate-200"}`}>
                    {u.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <input
              className="input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
              placeholder="Add an update…"
            />
            <button className="btn-primary shrink-0" onClick={postComment} disabled={!comment.trim()}>
              <FiSend /> Post
            </button>
          </div>
        </div>
      </div>
    </DetailSlideOver>
  );
}

const TONES = {
  default: "bg-navy-50 text-navy-700 dark:bg-white/5 dark:text-slate-300",
  amber:   "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  rose:    "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

function Meta({ icon: Icon, label, value, sub, tone = "default", chipClass }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${TONES[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      {sub && <p className="text-[11px] opacity-70">{sub}</p>}
      {chipClass && <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${chipClass}`}>&nbsp;</span>}
    </div>
  );
}

function SnoozeMenu({ onSnooze }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn-outline" onClick={() => setOpen((v) => !v)}>
        <FiMoon /> Snooze
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-1 w-40 overflow-hidden rounded-xl border border-navy-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-navy-900">
            {SNOOZE_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => { setOpen(false); onSnooze(o.key); }}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-navy-700 hover:bg-navy-50 dark:text-slate-200 dark:hover:bg-white/5"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
