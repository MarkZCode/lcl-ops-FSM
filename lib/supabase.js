"use client";

// Supabase client. Reads the project URL + anon key from public env vars so the
// browser can talk to the database. If they're not set, `supabase` is null and
// the app falls back to localStorage (so nothing breaks before it's configured).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// Every request this client makes goes through this fetch — a single,
// central choke point instead of scattering per-call timeout logic across
// the app (which is how earlier attempts at this missed spots and drifted).
//
// The bug this fixes: browsers put NO default timeout on fetch(). A request
// that stalls mid-flight (flaky network path, a proxy/VPN silently dropping
// packets, or — the leading suspect here — Safari's small per-origin
// connection pool getting saturated so a new request just queues forever
// waiting for a slot) hangs indefinitely: no error, no completion, nothing
// for any try/catch to ever catch.
//
// An earlier fix wrapped these calls in Promise.race() against a timeout
// promise — that changes what the APPLICATION CODE waits for, but does
// NOT cancel the underlying fetch. The zombie request keeps running and
// keeps occupying a connection slot in the browser's pool, so a retry (or
// the next unrelated request) immediately queues behind the exact same
// stuck connection and hangs again. AbortController is the only mechanism
// that actually tells the browser "stop this, free the slot" — that's the
// real fix, not just giving up on waiting.
const FETCH_TIMEOUT_MS = 15_000;
function timeoutFetch(...args) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`)), FETCH_TIMEOUT_MS);
  const [input, init = {}] = args;
  // Respect a caller-supplied signal too (e.g. a component unmounting) —
  // abort on whichever fires first.
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener("abort", () => controller.abort(callerSignal.reason), { once: true });
  }
  return fetch(input, { cache: "no-store", ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const _client = supabaseConfigured ? createClient(url, anonKey, {
  global: { fetch: timeoutFetch },
}) : null;

// When the Realtime WebSocket opens, the Supabase server may try to restore
// subscriptions from a previous session (e.g. "notification-bell-global" from
// old code). We don't use any Realtime channels now, so wipe them immediately.
if (_client) {
  try {
    _client.realtime.onOpen(() => {
      try {
        _client.getChannels().forEach(ch => {
          try { _client.removeChannel(ch); } catch {}
        });
      } catch {}
    });
  } catch {}
}

export const supabase = _client;

// Storage bucket used for job files (certificates, payment proofs, photos).
export const JOB_FILES_BUCKET = "job-files";
