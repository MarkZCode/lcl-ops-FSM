// File storage via Supabase Storage. Uploads/deletes run server-side with the
// service-role key, so the browser never needs storage write access.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser, JOB_FILES_BUCKET } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

// 9 MB cap on uploads — matches the client-side limit and protects the
// service from someone POSTing a 500 MB base64 blob.
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(`storage:${user.id}`, LIMITS.upload);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { base64, filename, contentType, folder } = body || {};
  if (!base64 || !filename) {
    return NextResponse.json({ error: "Missing base64 or filename" }, { status: 400 });
  }
  // Reject obvious traversal attempts in folder name (folder is used in path)
  if (folder && /[\\/]\.\.|^\.\.|[\\/]\.\.[\\/]/.test(folder)) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }
  // base64 length ≈ bytes × 4/3 — cheap pre-decode size check
  if (typeof base64 !== "string" || base64.length > Math.ceil(MAX_UPLOAD_BYTES * 1.4)) {
    return NextResponse.json({ error: "File too large (max 9 MB)" }, { status: 413 });
  }

  const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder || "jobs"}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safe}`;

  const buffer = Buffer.from(base64, "base64");
  const { error } = await supabaseAdmin.storage
    .from(JOB_FILES_BUCKET)
    .upload(path, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from(JOB_FILES_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

export async function DELETE(request) {
  if (!supabaseAdmin) return NextResponse.json({ ok: true });
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (body?.path) {
    await supabaseAdmin.storage.from(JOB_FILES_BUCKET).remove([body.path]);
  }
  return NextResponse.json({ ok: true });
}
