// SERVER-ONLY Supabase client using the service-role key. Never import this in
// a client component — it has full database/storage/auth admin powers.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

export const JOB_FILES_BUCKET = "job-files";

// Verify a request's bearer token belongs to any signed-in user.
export async function requireUser(request) {
  if (!supabaseAdmin) return null;
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Verify a request's bearer token belongs to a signed-in admin.
export async function requireAdmin(request) {
  const user = await requireUser(request);
  if (!user || user.app_metadata?.role !== "admin") return null;
  return user;
}
