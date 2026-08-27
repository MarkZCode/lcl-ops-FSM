"use client";

// Persistent, hard-to-miss banner shown whenever a data load bails out
// (failed fetch, expired session, or a suspicious all-empty response — see
// lib/store.js's loadError). A toast alone was easy to miss: it auto-
// dismisses in a few seconds, and someone could land on (or already be on) a
// page that looks empty with zero indication anything went wrong — exactly
// what happened when a Safari content-blocker silently spoofed empty
// responses from Supabase. This stays on screen until a retry succeeds.
import { useEffect, useState } from "react";
import { FiAlertTriangle, FiRefreshCw, FiX } from "react-icons/fi";
import { useStore } from "@/lib/store";

export default function SyncErrorBanner() {
  const { loadError, retryHydrate } = useStore();
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // A NEW error (different message) un-dismisses the banner — someone
  // shouldn't have a fresh failure silently hidden just because they closed
  // an earlier, unrelated one.
  useEffect(() => { setDismissed(false); }, [loadError]);

  if (!loadError || dismissed) return null;

  return (
    <div className="sticky top-0 z-[60] flex items-center gap-3 border-b border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-200">
      <FiAlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{loadError}</span>
      <button
        className="btn-outline h-8 shrink-0 border-rose-300 px-3 text-xs text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:text-rose-200 dark:hover:bg-rose-900/40"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          try { await retryHydrate?.(); } finally { setRetrying(false); }
        }}
      >
        <FiRefreshCw className={retrying ? "animate-spin" : ""} /> {retrying ? "Retrying…" : "Retry"}
      </button>
      <button
        className="shrink-0 rounded p-1 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <FiX className="h-4 w-4" />
      </button>
    </div>
  );
}
