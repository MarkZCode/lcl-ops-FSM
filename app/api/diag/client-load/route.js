// Where a browser that couldn't load its data reports what it found (see
// diagnoseLoadFailure in lib/store.js). Logged to the function log, where it
// can be read with `vercel logs` — no database write, because the database
// may be exactly the thing that's unreachable. GET is the "is our own
// server reachable" probe. No customer data is accepted or logged: only
// timings, the error text and the browser's user-agent.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const safe = {
    error: String(body.error || "").slice(0, 200),
    online: !!body.online,
    ua: String(body.ua || "").slice(0, 200),
    results: Array.isArray(body.results)
      ? body.results.slice(0, 5).map((r) => ({
          label: String(r.label || "").slice(0, 20),
          ok: !!r.ok,
          ms: Number(r.ms) || 0,
          error: String(r.error || "").slice(0, 120),
        }))
      : [],
  };
  console.log("[client-load-failure]", JSON.stringify(safe));
  return NextResponse.json({ ok: true });
}
