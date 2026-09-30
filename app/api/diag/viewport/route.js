// Temporary: where a phone reports its real screen/viewport geometry (see
// components/ViewportProbe.js), to diagnose the mobile bottom nav sitting
// 62pt above the screen edge on some pages and clipped below it on others.
// Logged to the function log for `vercel logs` — no database, no customer
// data: only numbers, the path and the user-agent.
import { NextResponse } from "next/server";

const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);

function clean(value, depth = 0) {
  if (depth > 3 || value == null) return null;
  if (typeof value === "number") return num(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) out[String(k).slice(0, 30)] = clean(v, depth + 1);
    return out;
  }
  return null;
}

export async function POST(request) {
  let body = {};
  try { body = JSON.parse(await request.text()); } catch { /* ignore */ }
  console.log("[viewport-probe]", JSON.stringify(clean(body)));
  return NextResponse.json({ ok: true });
}
