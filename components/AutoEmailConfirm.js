"use client";

// Branded confirmation dialog for auto-triggered emails.
// Replaces the browser's native window.confirm().

import { FiMail, FiX, FiSend } from "react-icons/fi";

export default function AutoEmailConfirm({ open, clientName, email, subject, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-navy-100 px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
            <FiMail className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy-900">Send auto-email?</p>
            <p className="truncate text-xs text-navy-500">{clientName} · {email}</p>
          </div>
          <button onClick={onCancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-400 hover:bg-navy-100">
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-400">Subject</p>
          <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-700">{subject}</p>
          <p className="mt-3 text-xs text-navy-500">
            This email will be sent automatically based on the status change. You can also send it manually from the Email button.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-navy-100 px-5 py-3">
          <button onClick={onCancel} className="btn-outline py-1.5 text-sm">
            Skip
          </button>
          <button onClick={onConfirm} className="btn-primary py-1.5 text-sm">
            <FiSend className="h-3.5 w-3.5" /> Send email
          </button>
        </div>
      </div>
    </div>
  );
}
