"use client";

// DetailSlideOver — right-side panel for contact detail views (Prospects,
// Letting Agents, Cold Leads, Engineer Recruits, Clients).
// Replaces the per-page Modal pattern with a consistent slide-in.
//
// Layout slots: title (header), subtitle (small), actions (header right),
// children (body), footer (sticky bottom button row).

import { useEffect } from "react";
import { FiX } from "react-icons/fi";

export default function DetailSlideOver({ open, onClose, title, subtitle, actions, footer, children, width = "max-w-xl" }) {
  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-navy-950/40 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full ${width} flex-col bg-white shadow-2xl transition-transform dark:bg-navy-950 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header
          className="flex items-start gap-3 border-b border-navy-100 px-5 pb-4 dark:border-white/10"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-navy-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-navy-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-navy-500 hover:bg-navy-100 dark:text-slate-400 dark:hover:bg-white/10" aria-label="Close">
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{open && children}</div>
        {footer && (
          <footer className="border-t border-navy-100 bg-navy-50 px-5 py-3 dark:border-white/10 dark:bg-navy-900">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
