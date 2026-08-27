"use client";

import { Component } from "react";

const MAX_AUTO_RETRIES = 2;
// How many auto-reloads we allow before giving up and showing the error screen.
const MAX_CHUNK_RELOADS = 2;
// Minimum gap (ms) between auto-reloads — prevents back-to-back thrashing.
const MIN_RELOAD_GAP_MS = 15_000;

function getChunkReloadState() {
  try {
    const raw = localStorage.getItem("lcl-chunk-reloads");
    return raw ? JSON.parse(raw) : { count: 0, lastAt: 0 };
  } catch { return { count: 0, lastAt: 0 }; }
}
function setChunkReloadState(state) {
  try { localStorage.setItem("lcl-chunk-reloads", JSON.stringify(state)); } catch {}
}
function clearChunkReloadState() {
  try { localStorage.removeItem("lcl-chunk-reloads"); } catch {}
}

async function nukeCacheAndReload() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches?.keys?.() ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  clearChunkReloadState();
  window.location.reload();
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, chunkLoopDetected: false };
    this.retryCount = 0;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] caught:", error?.message);

    // ChunkLoadError = stale JS chunks after a redeployment. A hard reload
    // fetches the new HTML + asset manifest and fixes it. We allow up to
    // MAX_CHUNK_RELOADS auto-reloads (tracked in localStorage so the guard
    // survives tab close/reopen). If we've already hit the limit, stop
    // reloading and show a "Clear cache" button instead.
    const msg = String(error?.message || error?.name || "");
    const isChunkError = /loading chunk|chunkloaderror|failed to fetch dynamically imported module|importing a module script failed/i.test(msg);
    if (isChunkError) {
      const state = getChunkReloadState();
      const now = Date.now();
      const tooSoon = (now - state.lastAt) < MIN_RELOAD_GAP_MS;
      const tooMany = state.count >= MAX_CHUNK_RELOADS;

      if (!tooMany && !tooSoon) {
        setChunkReloadState({ count: state.count + 1, lastAt: now });
        window.location.reload();
        return;
      }
      // Reload loop detected — surface the escape hatch UI.
      this.setState({ chunkLoopDetected: true });
      return;
    }

    // Non-chunk errors: silently retry a couple of times (handles transient
    // hydration mismatches while the data store is loading).
    if (this.retryCount < MAX_AUTO_RETRIES) {
      this.retryCount += 1;
      this.willRetry = true;
      setTimeout(() => this.setState({ error: null }), 350);
    } else {
      this.willRetry = false;
    }
  }

  render() {
    if (this.state.error) {
      // Chunk reload loop — show a clear-cache escape hatch instead of reloading again.
      if (this.state.chunkLoopDetected) {
        return (
          <div className="grid min-h-screen place-items-center bg-navy-900 px-6">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-amber-100">
                <span className="text-2xl">⚠️</span>
              </div>
              <h1 className="mb-1 text-base font-bold text-navy-900">App update needed</h1>
              <p className="text-sm text-navy-500 mb-5">
                Your browser has a cached version of LCL Ops that&apos;s out of date.
                Tap below to clear it and load the latest version.
              </p>
              <button
                className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 active:bg-brand-800"
                onClick={nukeCacheAndReload}
              >
                Clear cache &amp; reload
              </button>
            </div>
          </div>
        );
      }

      if (this.willRetry) {
        return (
          <div className="grid min-h-screen place-items-center bg-navy-900 text-navy-300 text-sm">
            Loading…
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-navy-50 p-8">
          <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow">
            <h1 className="mb-2 text-lg font-bold text-rose-700">Something went wrong</h1>
            <p className="text-sm text-navy-600">
              This page hit a snag loading. Reloading usually fixes it — if it
              keeps happening, send the details below to support.
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-navy-400">Technical details</summary>
              <pre className="mt-2 overflow-auto rounded bg-rose-50 p-3 text-xs text-rose-800 whitespace-pre-wrap">
                {this.state.error?.message}
                {"\n\n"}
                {this.state.error?.stack?.slice(0, 800)}
              </pre>
            </details>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
                onClick={() => { clearChunkReloadState(); window.location.reload(); }}
              >
                Reload page
              </button>
              <button
                className="rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-600 hover:bg-navy-50"
                onClick={() => {
                  this.retryCount = 0;
                  this.setState({ error: null, chunkLoopDetected: false });
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
