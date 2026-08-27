// Minimal team-member list for pickers (e.g. task assignee) — any signed-in
// user can call this, unlike /api/admin/users which is admin-only and
// returns full account detail. Only id/name/role are exposed here.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";

const normRole = (r) => (r === "admin" || r === "engineer" ? r : "agent");

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const users = (data.users || [])
    .map((u) => ({
      id: u.id,
      name: u.user_metadata?.name || u.email,
      role: normRole(u.app_metadata?.role),
    }))
    .filter((u) => u.role !== "engineer") // engineers don't use the Tasks feature
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ users });
}
