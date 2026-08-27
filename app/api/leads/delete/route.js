import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

const CHUNK = 200;

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = rateLimitOr429(`leads:${user.id}`, LIMITS.prospectUpsert);
  if (limited) return limited;

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (body?.all === true) {
    const { error } = await supabaseAdmin.from("leads").delete().neq("id", "__none__");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: "all" });
  }

  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "No ids" }, { status: 400 });

  for (let i = 0; i < ids.length; i += CHUNK) {
    const { error } = await supabaseAdmin.from("leads").delete().in("id", ids.slice(i, i + CHUNK));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deleted: ids.length });
}
