// Persists one or more prospects server-side (service role), bypassing RLS.
// Used for client-created records (e.g. the "Add Prospect" modal) so they
// reliably save even if the browser session can't write directly.
import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

const MAX_BATCH = 2000;
const MAX_ID = 80;
const MAX_FIELD = 4000;

const isValidId = (id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID;
const truncStr = (v) =>
  typeof v === "string" && v.length > MAX_FIELD ? v.slice(0, MAX_FIELD) : v;

// Cap obvious long-text fields so a malicious payload can't bloat the row.
function sanitiseProspect(p) {
  const out = { ...p };
  for (const k of ["address", "description", "ownerName", "nameOnCert", "contactEmail"]) {
    if (out[k]) out[k] = truncStr(out[k]);
  }
  return out;
}

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ notConfigured: true }, { status: 503 });
  }
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(`prospects:${user.id}`, LIMITS.prospectUpsert);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const prospects = Array.isArray(body?.prospects) ? body.prospects : [];
  if (prospects.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many prospects. Max ${MAX_BATCH} per request.` },
      { status: 413 }
    );
  }
  const rows = prospects
    .filter((p) => p && isValidId(p.id))
    .map((p) => {
      const safe = sanitiseProspect(p);
      return { id: safe.id, data: safe };
    });
  if (!rows.length) {
    return NextResponse.json({ error: "No prospects" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("prospects").upsert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
