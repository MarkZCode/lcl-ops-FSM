// What an engineer's login is allowed to see — see lib/portalData.js.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { buildPortal } from "@/lib/portalData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const engineerId = url.searchParams.get("engineerId");
  const role = user.app_metadata?.role || "engineer";
  const data = await buildPortal(user.email, month, { engineerId, role });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
