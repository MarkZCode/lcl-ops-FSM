"use client";

import { useEffect, useRef, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";

// Notices when the app has been redeployed underneath a long-lived session.
//
// This runs as an installed PWA, so a session can stay open for days. Next.js
// bakes the chunk filenames into the page at load time, and Vercel keeps
// serving old chunks forever — so after a deploy that session carries on
// requesting its ORIGINAL files and running the code it started with. It
// silently mixes old and new behaviour (old JS against a new API, old chunks
// for routes visited later) and any bug present in that older build keeps
// biting long after it's been fixed. That's what produced the
// "getEngineerIdsSet is not defined" crash on Engineers: the session was
// loading a chunk from a superseded deployment while the live one was clean.
//
// Deliberately does NOT auto-reload: this app holds unsaved state (a
// half-written job, an open payment modal), and yanking the page out from
// under someone mid-edit to fix a problem they can't see is worse than the
// staleness. It offers, and stays out of the way until asked.
const POLL_MS = 5 * 60 * 1000;

export default function VersionWatcher() {
  const seen = useRef(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // Nothing to check while offline, and no point waking the network for a
      // tab nobody is looking at.
      if (cancelled || stale || document.hidden || !navigator.onLine) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = await res.json();
        if (!id || cancelled) return;
        if (seen.current == null) {
          seen.current = id;
        } else if (id !== seen.current) {
          setStale(true);
        }
      } catch {
        // Offline or a blip — this is a background nicety, never an error.
      }
    };

    check();
    const t = setInterval(check, POLL_MS);
    // Coming back to the app is the moment a reload costs least, and the most
    // likely moment for a deploy to have happened since you last looked.
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [stale]);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-navy-200 bg-white px-4 py-2.5 shadow-lg dark:border-white/10 dark:bg-navy-800">
        <p className="text-xs text-navy-700 dark:text-slate-200">
          A new version of LCL Ops is available.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary shrink-0 px-3 py-1.5 text-xs"
        >
          <FiRefreshCw className="h-3.5 w-3.5" /> Reload
        </button>
      </div>
    </div>
  );
}
