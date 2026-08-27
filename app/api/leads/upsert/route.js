import { NextResponse } from "next/server";
import { supabaseAdmin, requireUser } from "@/lib/supabaseAdmin";
import { rateLimitOr429, LIMITS } from "@/lib/rateLimit";

const MAX_BATCH = 2000;
const MAX_ID = 80;
const MAX_FIELD = 4000;

const isValidId = (id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID;
const truncStr = (v) =>
  typeof v === "string" && v.length > MAX_FIELD ? v.slice(0, MAX_FIELD) : v;

function sanitiseLead(l) {
  const out = { ...l };
  for (const k of ["name", "address", "notes", "email", "source", "category"]) {
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
  const limited = rateLimitOr429(`leads:${user.id}`, LIMITS.prospectUpsert);
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const leads = Array.isArray(body?.leads) ? body.leads : [];
  if (leads.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many leads. Max ${MAX_BATCH} per request.` },
      { status: 413 }
    );
  }
  const rows = leads
    .filter((l) => l && isValidId(l.id))
    .map((l) => {
      const safe = sanitiseLead(l);
      return { id: safe.id, data: safe };
    });
  if (!rows.length) {
    return NextResponse.json({ error: "No leads" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("leads").upsert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
