"use client";

// Recovery from stale JS after a redeployment.
//
// Next.js bakes hashed chunk filenames into the page at load time, and a
// session left open across a deploy keeps asking for the filenames it started
// with. Those eventually stop resolving, and the app dies on whatever it was
// lazily importing at the time — see commit 3b8c0fc, where a superseded chunk
// resurrected a function that no longer exists in the source.
//
// This lived inside components/ErrorBoundary.js, which only covers the tree
// BELOW it. When the failure happens in the root layout — before that boundary
// has mounted — nothing catches it and Next.js paints its own bare
// "Application error: a client-side exception has occurred" screen. app/
// global-error.js now covers that case and shares these helpers, so the two
// paths can't drift apart on how many reloads are allowed or what counts as a
// chunk error.

// How many auto-reloads we allow before giving up and showing the error screen.
export const MAX_CHUNK_RELOADS = 2;
// Minimum gap (ms) between auto-reloads — prevents back-to-back thrashing.
export const MIN_RELOAD_GAP_MS = 15_000;

const KEY = "lcl-chunk-reloads";

export function getChunkReloadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { count: 0, lastAt: 0 };
  } catch { return { count: 0, lastAt: 0 }; }
}
export function setChunkReloadState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
export function clearChunkReloadState() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Is this the "my code is from a deployment that no longer exists" error?
// Matched on message text because the error arrives as a plain Error from the
// module loader, with no structured type to key off.
export function isChunkLoadError(error) {
  const msg = String(error?.message || error?.name || "");
  return /loading chunk|chunkloaderror|failed to fetch dynamically imported module|importing a module script failed/i.test(msg);
}

// Auto-reload once, if we haven't already been round this loop too often or
// too recently. Returns true if a reload was started (caller should stop).
export function tryChunkReload() {
  const state = getChunkReloadState();
  const now = Date.now();
  if (state.count >= MAX_CHUNK_RELOADS) return false;
  if (now - state.lastAt < MIN_RELOAD_GAP_MS) return false;
  setChunkReloadState({ count: state.count + 1, lastAt: now });
  window.location.reload();
  return true;
}

// The escape hatch: drop the service worker and every cache, then reload, so
// the browser has no choice but to fetch the current build.
export async function nukeCacheAndReload() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches?.keys?.() ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  clearChunkReloadState();
  window.location.reload();
}
