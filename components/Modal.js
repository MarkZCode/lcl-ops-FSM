"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiX, FiArrowLeft } from "react-icons/fi";

// `xwide` exists for one case: a table that genuinely needs the room. The
// engineer pay run is nine columns of figures, and at `wide` (672px) it was
// squeezed into a 640px-minimum table with a horizontal scrollbar under it —
// so reading one engineer's period meant scrolling sideways through money.
export default function Modal({ open, onClose, onBack, title, children, footer, wide, xwide }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Render via a portal straight onto <body> so the modal is always
  // positioned relative to the real viewport — no ancestor with a
  // transform/filter/contain (which create their own containing block for
  // `position: fixed`) can ever trap it off-screen or behind other fixed
  // elements like the mobile bottom nav.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      // The measured screen height, not 100dvh — which is short on an
      // iPhone home-screen app (see ViewportHeightFix.js).
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <div
        className="absolute inset-0 bg-navy-950/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-sheet relative z-10 flex max-h-[92%] w-full flex-col rounded-t-[22px] bg-white shadow-xl sm:max-h-[90dvh] sm:rounded-xl ${
          xwide ? "sm:max-w-5xl" : wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        {/* Phone: the grab handle every iOS sheet has. */}
        <span className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-navy-200 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-navy-100 px-4 pb-3 pt-2 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-600 hover:bg-navy-100 dark:text-slate-300 dark:hover:bg-white/10"
                aria-label="Back"
                title="Back"
              >
                <FiArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="min-w-0 truncate text-[17px] font-semibold text-navy-900 sm:text-base dark:text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-100 text-navy-600 hover:bg-navy-200 sm:rounded-lg sm:bg-transparent sm:text-navy-500"
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>
        <div className="scroll-area flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" style={footer ? undefined : { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>{children}</div>
        {footer && (
          <div
            className="modal-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-navy-100 px-4 py-3 sm:px-5"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
