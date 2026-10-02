// Admin-only user management via the Supabase service role. Every method
// verifies the caller is a signed-in admin before doing anything.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireAdmin } from "@/lib/supabaseAdmin";

const normRole = (r) => (r === "admin" || r === "engineer" ? r : "agent");
const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

// The "root admin" is locked from modification by anyone other than themselves.
// Resolution order:
//   1. SUPER_ADMIN_EMAIL env var (if set, that email is root)
//   2. Otherwise: the oldest user with role=admin (i.e. whoever set the system up)
// Cached per-request to avoid re-listing on every check.
async function getRootAdminId() {
  const envEmail = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  const users = data?.users || [];
  if (envEmail) {
    const match = users.find((u) => (u.email || "").toLowerCase() === envEmail);
    if (match) return match.id;
  }
  const admins = users
    .filter((u) => (u.app_metadata?.role || "agent") === "admin")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return admins[0]?.id || null;
}

function rootLocked() {
  return NextResponse.json(
    { error: "This account is the root admin and can only be modified by itself." },
    { status: 403 }
  );
}

export async function GET(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rootId = await getRootAdminId();
  const users = (data.users || []).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || u.email,
    username: u.user_metadata?.username || "",
    avatar_url: u.user_metadata?.avatar_url || "",
    role: normRole(u.app_metadata?.role),
    permissions: u.user_metadata?.permissions || {},
    away_until: typeof u.user_metadata?.away_until === "string" ? u.user_metadata.away_until : "",
    is_super_admin: u.id === rootId,
  }));
  return NextResponse.json({ users });
}

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  const { email, password, name, username, role } = (await request.json()) || {};
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const uname = (username || "").trim().toLowerCase().replace(/\s+/g, "");
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: String(email).trim(),
    password,
    email_confirm: true,
    user_metadata: { name: name?.trim() || email, username: uname },
    app_metadata: { role: normRole(role) },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  const { id, password, role, name, username, avatar_url, permissions, away_until } = (await request.json()) || {};
  if (!id) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  const rootId = await getRootAdminId();
  if (id === rootId && admin.id !== rootId) return rootLocked();
  const patch = {};
  if (password) patch.password = password;
  if (role) patch.app_metadata = { role: normRole(role) };
  if (name != null || username != null || avatar_url != null || permissions != null || away_until != null) {
    // Supabase replaces user_metadata wholesale, so start from the
    // existing record and merge our changes in to avoid wiping fields
    // (e.g. avatar) that aren't part of this particular update.
    const { data: existing, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(id);
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    patch.user_metadata = { ...(existing?.user?.user_metadata || {}) };
    if (name != null) patch.user_metadata.name = name;
    if (username != null) patch.user_metadata.username = (username || "").trim().replace(/\s+/g, ""); // preserve case for display
    if (avatar_url != null) patch.user_metadata.avatar_url = avatar_url;
    if (permissions != null) patch.user_metadata.permissions = permissions;
    // Away through this date: no new tasks are given to them (lib/taskSync.js).
    if (away_until != null) patch.user_metadata.away_until = /^\d{4}-\d{2}-\d{2}$/.test(String(away_until)) ? String(away_until) : "";
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, patch);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  const admin = await requireAdmin(request);
  if (!admin) return forbidden();

  const { id } = (await request.json()) || {};
  if (!id) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }
  const rootId = await getRootAdminId();
  if (id === rootId) return rootLocked();
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
