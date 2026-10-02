// Put back records that are in a backup file but no longer in the system.
// Add-back only: a record that still exists is never touched, so a restore
// can't overwrite newer work. Admins only.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;
const TABLES = new Set(["jobs", "clients", "engineers"]);

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const table = body?.table;
  const rows = (Array.isArray(body?.rows) ? body.rows : []).filter((r) => r && typeof r === "object" && typeof r.id === "string" && r.id);
  if (!TABLES.has(table) || !rows.length || rows.length > 300) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const ids = rows.map((r) => r.id);
  const { data: existing, error: readErr } = await supabaseAdmin.from(table).select("id").in("id", ids);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  const have = new Set((existing || []).map((r) => r.id));
  const missing = rows.filter((r) => !have.has(r.id));
  if (missing.length) {
    const { error } = await supabaseAdmin.from(table).upsert(missing.map((r) => ({ id: r.id, data: r })), { onConflict: "id", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // They were deleted on purpose once; take them off the shared deleted
    // list or every device would remove them again on its next load.
    const { data: t } = await supabaseAdmin.from("app_settings").select("data").eq("id", "deleted_ids").maybeSingle();
    const map = t?.data && typeof t.data === "object" ? t.data : null;
    if (map?.[table]) {
      let changed = false;
      for (const r of missing) if (map[table][r.id]) { delete map[table][r.id]; changed = true; }
      if (changed) await supabaseAdmin.from("app_settings").upsert({ id: "deleted_ids", data: map });
    }
  }
  return NextResponse.json({ ok: true, added: missing.map((r) => r.id), skipped: rows.length - missing.length });
}
