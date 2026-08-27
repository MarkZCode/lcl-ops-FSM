// Public job-status link (/share/<token>).
//
// This used to be read straight from the browser with the ANON key, which
// meant two things:
//   1. the `jobs` table had to stay readable without a login for the link to
//      work at all — the single thing blocking the database being locked down;
//   2. the response carried the WHOLE job object to a public page. The UI only
//      renders a status, a total and the service lines, but engineer pay,
//      company margin, the access phone number and internal notes all went
//      down the wire with it, visible to anyone with the link in devtools.
//
// It now runs server-side with the service-role key and returns ONLY the
// fields the page actually shows. The token is the only credential, so what
// it unlocks has to be the minimum.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getJobLines, lineTotal } from "@/lib/format";

export async function GET(_request, { params }) {
  const token = params?.token;
  // A short or empty token would match far too broadly — refuse outright
  // rather than letting a one-character guess enumerate jobs.
  if (!token || String(token).length < 12) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("data")
    .eq("data->>shareToken", token)
    .maybeSingle();

  if (error || !data?.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = data.data;
  // Explicit allow-list. Anything added to a job in future is private by
  // default and has to be named here to become public.
  const safe = {
    id: job.id,
    status: job.status,
    price: job.price,
    certExpiry: job.certExpiry || null,
    lines: getJobLines(job).map((l) => ({
      name: l.code === "CUSTOM" ? l.name : l.name,
      code: l.code,
      qty: l.qty || 1,
      tier: l.tier || null,
      total: lineTotal(l),
    })),
  };

  return NextResponse.json(safe, {
    headers: { "Cache-Control": "no-store" },
  });
}
