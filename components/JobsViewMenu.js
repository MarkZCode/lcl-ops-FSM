"use client";

// One menu for how the jobs list looks and what you do with it — saved
// views, compact cards, columns, export, selecting several — so the toolbar
// stays a search box, a sort and this.
import { useState } from "react";
import { FiSliders, FiCheck, FiTrash2 } from "react-icons/fi";
import { LIST_COLUMNS } from "@/lib/jobsView";

export default function JobsViewMenu({ views, onApply, onSave, onDelete, compact, onCompact, selecting, onSelecting, onExport, view, columns, onColumns }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-navy-700 hover:bg-navy-50";
  return (
    <div className="relative">
      <button type="button" className="btn-outline h-10" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <FiSliders /> <span className="hidden sm:inline">View</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="menu-pop absolute right-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-navy-200 bg-white py-1 shadow-lg dark:bg-[#141414]">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-navy-400">Saved views</p>
            {views.length === 0 && <p className="px-3 pb-2 text-xs text-navy-400">None yet. Set the filter, search and sort you want, then save it.</p>}
            {views.map((v) => (
              <div key={v.id} className="flex items-center">
                <button type="button" className={`${item} min-w-0 flex-1`} onClick={() => { onApply(v); setOpen(false); }}><span className="truncate">{v.name}</span></button>
                <button type="button" className="px-3 py-2 text-navy-300 hover:text-rose-500" aria-label={`Delete view ${v.name}`} onClick={() => onDelete(v.id)}><FiTrash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button type="button" className={`${item} font-semibold text-brand-600`} onClick={() => { const name = window.prompt("Name this view:"); if (name && name.trim()) onSave(name.trim()); setOpen(false); }}>Save the current view…</button>
            <div className="my-1 border-t border-navy-100" />
            <button type="button" className={item} onClick={() => onCompact(!compact)}>Compact cards {compact && <FiCheck className="text-brand-600" />}</button>
            <button type="button" className={item} onClick={() => { onSelecting(!selecting); setOpen(false); }}>Select several jobs {selecting && <FiCheck className="text-brand-600" />}</button>
            <button type="button" className={item} onClick={() => { onExport(); setOpen(false); }}>Export this list (spreadsheet)</button>
            {view === "list" && (
              <>
                <div className="my-1 border-t border-navy-100" />
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">Columns</p>
                {LIST_COLUMNS.map((c) => (
                  <button key={c.key} type="button" className={item} onClick={() => onColumns(columns.includes(c.key) ? columns.filter((k) => k !== c.key) : [...columns, c.key])}>
                    {c.label} {columns.includes(c.key) && <FiCheck className="text-brand-600" />}
                  </button>
                ))}
              </>
            )}
            <div className="my-1 border-t border-navy-100" />
            <p className="px-3 py-2 text-[11px] text-navy-400">Keys: <kbd>/</kbd> search · <kbd>J</kbd> <kbd>K</kbd> move · <kbd>Enter</kbd> open · <kbd>N</kbd> new job</p>
          </div>
        </>
      )}
    </div>
  );
}
