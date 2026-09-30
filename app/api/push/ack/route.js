// The service worker's "I got a push" report (see public/sw.js). Logged
// only — device type, whether showNotification worked, notification
// permission and the worker version. No personal data.
import { NextResponse } from "next/server";

export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { /* ignore */ }
  const ua = String(b.ua || "");
  const device = /iPhone/.test(ua) ? "iPhone" : /Macintosh/.test(ua) ? (/Chrome\//.test(ua) ? "Mac · Chrome" : "Mac · Safari") : "other";
  console.log("[push-ack]", JSON.stringify({
    device,
    shown: String(b.shown || "").slice(0, 160),
    visible: b.visible ?? null,
    permission: String(b.permission || ""),
    sw: String(b.sw || "").slice(0, 20),
  }));
  return NextResponse.json({ ok: true });
}
