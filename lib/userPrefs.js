"use client";

// Cross-device user preferences — filter selections, view choices, etc.
//
// Stored in the Supabase user's `user_metadata` blob under `prospects_filters`
// (and future keys as they're added), so switching phone <-> desktop or
// logging out and back in restores exactly what the operator was looking at.
// LocalStorage is kept as a fast paint layer: reads are hydrated from cache
// synchronously so filters don't visually flash on refresh, then the cloud
// value overwrites once it lands.
//
// A single debounced write batches every filter change made within 800ms into
// one auth.updateUser({data:{...}}) call — the API is not rate-limited hard
// but hammering it on every keystroke wastes latency and log volume.

import { supabase } from "./supabase";

const NS = "prospects_filters"; // one namespace, one metadata key
const LS_PREFIX = "lcl_prospects_";

let pending = null;                // { [key]: any } — merged into user_metadata on flush
let flushTimer = null;
const FLUSH_DEBOUNCE_MS = 800;

// Snapshot of the last cloud-fetched prefs (or {} if we haven't hydrated yet).
// Used so a per-key write doesn't wipe unrelated keys we haven't touched.
let cloudCache = null;

async function ensureCloud() {
  if (cloudCache) return cloudCache;
  if (!supabase) return (cloudCache = {});
  try {
    const { data } = await supabase.auth.getUser();
    const meta = data?.user?.user_metadata || {};
    cloudCache = (meta[NS] && typeof meta[NS] === "object") ? { ...meta[NS] } : {};
  } catch {
    cloudCache = {};
  }
  return cloudCache;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
}

async function flush() {
  flushTimer = null;
  if (!pending || !supabase) { pending = null; return; }
  const toWrite = pending; pending = null;
  const current = await ensureCloud();
  const merged = { ...current, ...toWrite };
  cloudCache = merged;
  try {
    await supabase.auth.updateUser({ data: { [NS]: merged } });
  } catch (err) {
    // Not fatal — localStorage still has the latest, so the change is
    // preserved on this device. Next successful write will re-sync.
    console.warn("[userPrefs] flush failed:", err?.message || err);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

// Fast synchronous read from localStorage (used to paint filters instantly on
// mount before the cloud value arrives). `parse` lets Set-typed hooks decode.
export function readLocal(key, parse) {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw == null) return undefined;
    return parse ? parse(raw) : raw;
  } catch {
    return undefined;
  }
}

// Async read from the cloud snapshot — call once on mount after `readLocal`
// to reconcile with what other devices last wrote.
export async function readCloud(key) {
  const cloud = await ensureCloud();
  return cloud[key];
}

// Write both layers. `serialize` is used for the localStorage copy only —
// the cloud copy stores the native value (array/string/number/boolean).
export function write(key, value, serialize) {
  // Local — instant.
  if (typeof window !== "undefined") {
    try {
      const encoded = serialize ? serialize(value) : String(value);
      if (encoded == null || encoded === "") localStorage.removeItem(LS_PREFIX + key);
      else localStorage.setItem(LS_PREFIX + key, encoded);
    } catch { /* fail soft */ }
  }
  // Cloud — batched.
  pending = pending || {};
  pending[key] = value;
  scheduleFlush();
}

export function remove(key) {
  if (typeof window !== "undefined") {
    try { localStorage.removeItem(LS_PREFIX + key); } catch {}
  }
  pending = pending || {};
  pending[key] = null; // explicit null so the cloud entry is cleared too
  scheduleFlush();
}

// Reset the in-memory cloud cache — call this when the auth session changes
// so the next read pulls fresh metadata for the new user.
export function resetCache() {
  cloudCache = null;
  pending = null;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
}
