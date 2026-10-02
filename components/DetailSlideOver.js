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

  // Lock body scroll while open, and move the phone's tab bar out of the way
  // so it can't sit on top of this panel's buttons.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.sheetOpen = "1";
    return () => { document.body.style.overflow = prev; delete document.body.dataset.sheetOpen; };
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
          className="flex items-start gap-3 border-b border-navy-100 px-4 pb-3 sm:px-5 sm:pb-4 dark:border-white/10"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-snug text-navy-900 line-clamp-2 sm:truncate dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-navy-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-100 text-navy-600 hover:bg-navy-200 sm:rounded-lg sm:bg-transparent sm:text-navy-500 dark:bg-white/10 dark:text-slate-300" aria-label="Close">
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" style={footer ? undefined : { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>{open && children}</div>
        {footer && (
          <footer className="slide-footer border-t border-navy-100 bg-navy-50 px-4 py-3 sm:px-5 dark:border-white/10 dark:bg-navy-900" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
