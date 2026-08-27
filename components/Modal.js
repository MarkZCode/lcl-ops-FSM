"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

export default function Modal({ open, onClose, title, children, footer, wide }) {
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
      style={{ height: "100dvh" }}
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
        className={`relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-h-[88dvh] sm:rounded-xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-navy-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-navy-100"
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>
        <div className="scroll-area flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div
            className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-navy-100 px-5 py-3"
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
