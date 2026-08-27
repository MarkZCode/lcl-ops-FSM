// Resolve a username to its email so users can sign in with a username instead
// of their email. Unauthenticated (login hasn't happened yet) — it only ever
// returns an email for an exact username match, nothing else.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimitOr429 } from "@/lib/rateLimit";

export async function POST(request) {
  if (!supabaseAdmin) return NextResponse.json({ notConfigured: true }, { status: 503 });
  // Pre-login route — rate-limit by IP to slow username→email enumeration.
  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const limited = rateLimitOr429(`auth-resolve:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const { username } = (await request.json()) || {};
  const uname = (username || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!uname) return NextResponse.json({ error: "No username." }, { status: 400 });

  // Scan users (small team) for a matching username in user_metadata.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  const match = (data.users || []).find(
    (u) => (u.user_metadata?.username || "").toLowerCase() === uname
  );
  if (!match) return NextResponse.json({ error: "Username not found." }, { status: 404 });
  return NextResponse.json({ email: match.email });
}
