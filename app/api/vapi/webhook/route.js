// Receives call-status webhooks from Vapi and logs the outcome onto the prospect.
// Configure this URL as the assistant's serverUrl in the Vapi dashboard, with a
// shared secret header (x-vapi-secret) matching VAPI_WEBHOOK_SECRET.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = body?.message || {};
  if (message.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true });
  }

  const prospectId = message.call?.metadata?.prospectId;
  if (!prospectId) {
    return NextResponse.json({ ok: true });
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("prospects")
    .select("data")
    .eq("id", prospectId)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ ok: true });
  }

  const prospect = row.data;
  const summary = message.analysis?.summary || message.summary || "Call ended";
  const merged = {
    ...prospect,
    contactLog: [
      { at: new Date().toISOString(), channel: "ai-call", note: summary, endedReason: message.endedReason },
      ...(prospect.contactLog || []),
    ],
    lastContactedAt: new Date().toISOString(),
    stage: prospect.stage === "new" ? "contacted" : prospect.stage,
  };
  await supabaseAdmin.from("prospects").upsert({ id: prospectId, data: merged });

  return NextResponse.json({ ok: true });
}
