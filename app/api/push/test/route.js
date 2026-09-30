// "Send test notification" — pushes to every device the SIGNED-IN user has
// enabled, and reports back per device what Apple/Google's push service
// said. That splits "our server never sent it" from "the service accepted
// it and the phone didn't show it", which were impossible to tell apart.
// Only ever notifies the caller's own devices.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush, webPushConfigured } from "@/lib/webPush";

export const runtime = "nodejs";

const deviceName = (ua = "") =>
  /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android phone"
    : /Macintosh/.test(ua) ? (/Chrome\//.test(ua) ? "Mac · Chrome" : /Safari\//.test(ua) ? "Mac · Safari" : "Mac")
    : /Windows/.test(ua) ? "Windows PC"
    : "Device";

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!webPushConfigured) return NextResponse.json({ error: "Push isn't configured on the server (VAPID keys missing)." }, { status: 503 });

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,user_id,user_agent,created_at")
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!subs?.length) {
    return NextResponse.json({ ok: true, devices: [], note: "No devices are enabled for your account yet." });
  }

  const devices = [];
  const dead = [];
  for (const sub of subs) {
    const r = await sendPush(sub, {
      title: "LCL Ops test",
      body: "If you can read this, notifications work on this device.",
      url: "/settings",
    });
    if (r.gone) dead.push(sub.id);
    devices.push({
      status: r.statusCode || null,
      device: deviceName(sub.user_agent || ""),
      since: sub.created_at,
      ok: !!r.ok,
      removed: !!r.gone,
      error: r.ok ? null : String(r.error || "rejected").slice(0, 160),
    });
  }
  if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
  // Device type + outcome only — no endpoints or keys in the log.
  console.log("[push-test]", JSON.stringify(devices.map((d) => ({ device: d.device, ok: d.ok, status: d.status, error: d.error }))));
  return NextResponse.json({ ok: true, devices });
}
