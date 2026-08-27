// Starts an outbound AI renewal call for a prospect via Vapi.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { buildCallVariables, startVapiCall } from "@/lib/vapi";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(`vapi-call:${user.id}`, LIMITS.vapiCall);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { prospectId, coldLeadId, upliftPct, prospect: prospectFromClient } = body || {};
  if (!prospectId && !coldLeadId) {
    return NextResponse.json({ error: "Missing prospectId or coldLeadId" }, { status: 400 });
  }

  // Resolve which table + record we're calling on.
  const table = coldLeadId ? "leads" : "prospects";
  const id = coldLeadId || prospectId;

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from(table)
    .select("data")
    .eq("id", id)
    .single();

  let record = row?.data;
  if ((fetchErr || !row) && prospectFromClient && prospectFromClient.id === id) {
    record = prospectFromClient;
    await supabaseAdmin.from(table).upsert({ id, data: record });
  }
  if (!record) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  const phone = record.phone || record.ownerPhone || record.tenantPhone;
  if (!phone) {
    return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
  }

  const variables = buildCallVariables(record, upliftPct || 0);
  const result = await startVapiCall({
    phoneNumber: phone,
    variables,
    metadata: coldLeadId ? { coldLeadId } : { prospectId },
  });

  if (result.notConfigured) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  if (result.error) {
    return NextResponse.json({ error: result.error, details: result.details }, { status: 502 });
  }

  const merged = {
    ...record,
    contactLog: [
      { at: new Date().toISOString(), channel: "ai-call", note: "AI call started", callId: result.callId },
      ...(record.contactLog || []),
    ],
    lastContactedAt: new Date().toISOString(),
    stage: record.stage === "new" ? "contacted" : record.stage,
  };
  await supabaseAdmin.from(table).upsert({ id, data: merged });

  return NextResponse.json({ ok: true, callId: result.callId });
}
