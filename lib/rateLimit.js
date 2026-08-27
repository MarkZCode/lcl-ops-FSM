// In-memory sliding-window rate limiter. Keyed by an arbitrary string
// (typically user id + endpoint name) and reset by garbage-collecting old
// entries on each call. Suitable for a single Vercel serverless instance —
// abuse from a distributed attacker would slip past, but it does block the
// realistic threats here (a compromised account spamming AI calls or emails).
//
// For stronger guarantees, swap this for an Upstash/Redis-backed limiter
// without changing the call sites. The shape stays the same.

const BUCKETS = new Map(); // key -> number[] of unix-ms timestamps

function prune(key, windowMs, now) {
  const arr = BUCKETS.get(key) || [];
  const cutoff = now - windowMs;
  const fresh = arr.filter((t) => t > cutoff);
  if (fresh.length) BUCKETS.set(key, fresh);
  else BUCKETS.delete(key);
  return fresh;
}

/**
 * Returns { ok, remaining, resetMs }. If ok=false the request should be
 * rejected with 429. Call this AT THE TOP of every protected route, before
 * doing any work.
 */
export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const fresh = prune(key, windowMs, now);
  if (fresh.length >= limit) {
    const resetMs = Math.max(0, fresh[0] + windowMs - now);
    return { ok: false, remaining: 0, resetMs };
  }
  fresh.push(now);
  BUCKETS.set(key, fresh);
  return { ok: true, remaining: limit - fresh.length, resetMs: windowMs };
}

import { NextResponse } from "next/server";

/**
 * Helper: combines a rate-limit check + a standardised 429 response.
 * Returns null on success, or a NextResponse you should return immediately.
 */
export function rateLimitOr429(key, opts) {
  const r = checkRateLimit(key, opts);
  if (r.ok) return null;
  return NextResponse.json(
    {
      error: "Too many requests — please wait a moment and try again.",
      retryAfterSeconds: Math.ceil(r.resetMs / 1000),
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(r.resetMs / 1000)) },
    }
  );
}

// Common presets keyed to the realistic abuse risk per endpoint.
export const LIMITS = {
  // Expensive (costs money or hits external API quotas)
  vapiCall: { limit: 30, windowMs: 60 * 60 * 1000 },        // 30 AI calls / hour / user
  sendEmail: { limit: 60, windowMs: 60 * 60 * 1000 },       // 60 emails / hour / user
  sendWhatsApp: { limit: 60, windowMs: 60 * 60 * 1000 },    // 60 WA messages / hour / user
  // Heavy IO
  upload: { limit: 120, windowMs: 60 * 60 * 1000 },         // 120 file uploads / hour
  import: { limit: 10, windowMs: 10 * 60 * 1000 },          // 10 bulk imports / 10 min
  // Cheap but spammable
  prospectUpsert: { limit: 300, windowMs: 60 * 60 * 1000 }, // 300 / hour
};
