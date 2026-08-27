// One-off Vapi test call to the operator's own number. Does not touch any
// prospect/cold-lead record — exists purely so the user can confirm calls work
// before launching a bulk campaign.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { buildCallVariables, startVapiCall } from "@/lib/vapi";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = rateLimitOr429(`vapi-test:${user.id}`, LIMITS.vapiCall);
  if (limited) return limited;

  const { phone, segment } = await request.json().catch(() => ({}));
  if (!phone) return NextResponse.json({ error: "Missing phone" }, { status: 400 });

  const variables = buildCallVariables(
    { type: "cold", segment: segment || "letting_agent", name: "Test", address: "Test address", phone },
    0
  );
  const result = await startVapiCall({ phoneNumber: phone, variables, metadata: { test: true, byUser: user.id } });
  if (result.notConfigured) return NextResponse.json({ notConfigured: true }, { status: 503 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, callId: result.callId });
}
