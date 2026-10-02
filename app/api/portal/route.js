// What an engineer's login is allowed to see — see lib/portalData.js.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { buildPortal } from "@/lib/portalData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await buildPortal(user.email, new URL(request.url).searchParams.get("month"));
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
