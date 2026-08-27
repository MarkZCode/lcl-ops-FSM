"use client";

// Floating action bar that appears at the bottom of the Team page when
// tasks are selected in the List view. Lets an admin shift big batches
// of auto-assigned prospect chases to a real agent in one click, or
// bulk-complete/bulk-delete when a batch is stale.

import { useState } from "react";
import { FiX, FiUserCheck, FiCheck, FiTrash2, FiChevronDown } from "react-icons/fi";

export default function BulkActionsBar({ count, team, onReassign, onMarkDone, onDelete, onClear }) {
  const [reassignOpen, setReassignOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-navy-700 bg-navy-900 px-4 py-3 shadow-2xl"
      style={{ marginLeft: "max(1rem, env(safe-area-inset-left))", marginRight: "max(1rem, env(safe-area-inset-right))" }}
    >
      <span className="text-sm font-semibold text-white">
        {count} task{count === 1 ? "" : "s"} selected
      </span>

      <div className="relative">
        <button
          onClick={() => setReassignOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <FiUserCheck className="h-3.5 w-3.5" /> Reassign to <FiChevronDown className="h-3 w-3" />
        </button>
        {reassignOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setReassignOpen(false)} />
            <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-navy-700 bg-navy-900 py-1 shadow-2xl">
              <button
                onClick={() => { onReassign(null, "Everyone"); setReassignOpen(false); }}
                className="block w-full px-3 py-2 text-left text-xs font-semibold text-white hover:bg-navy-800"
              >
                Everyone (unassigned)
              </button>
              <div className="my-1 border-t border-navy-700" />
              {team.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onReassign(t.id, t.name); setReassignOpen(false); }}
                  className="block w-full px-3 py-2 text-left text-xs text-navy-200 hover:bg-navy-800"
                >
                  <span className="font-semibold text-white">{t.name}</span>
                  {t.role === "admin" && <span className="ml-1 text-navy-400">(admin)</span>}
                </button>
              ))}
              {team.length === 0 && (
                <p className="px-3 py-2 text-xs text-navy-500">No teammates yet — add agents in Settings.</p>
              )}
            </div>
          </>
        )}
      </div>

      <button
        onClick={onMarkDone}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
      >
        <FiCheck className="h-3.5 w-3.5" /> Mark done
      </button>

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
      >
        <FiTrash2 className="h-3.5 w-3.5" /> Delete
      </button>

      <button onClick={onClear} className="ml-auto rounded-lg p-1.5 text-navy-400 hover:text-white" aria-label="Clear selection">
        <FiX className="h-4 w-4" />
      </button>
    </div>
  );
}
