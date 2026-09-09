import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// How many prospects are due for renewal, as ONE number.
//
// The Dashboard's "Renewals due" KPI is a count of prospects whose certificate
// comes up for renewal in the next 14 days. Computing it in the browser meant
// downloading the ENTIRE prospects table to do it: ~14.5k rows, ~12MB, across
// ~15 paginated requests, every time the dashboard opened — on a phone, over
// mobile data, to render a single integer. It was the largest single cost in
// the app and bought nothing else; the dashboard touches prospects for
// literally nothing besides this count.
//
// Doing it here costs the phone ~30 bytes. The 12MB still moves, but inside
// Vercel's network next to the database rather than down the user's connection.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { requireUser } = await import("@/lib/supabaseAdmin");
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Paginate — the server cap is 1000 rows per request regardless of who asks.
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("prospects")
      .select("data")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // Same rule the client used, kept identical on purpose: a certificate runs
  // for a year from the recorded date, and it's "urgent" once it falls inside
  // the next 14 days (and hasn't already lapsed).
  const now = Date.now();
  const DAY = 86400000;
  let urgent = 0;
  let due60 = 0;
  for (const r of rows) {
    const p = r?.data;
    const base = p?.certRenewalDate || p?.jobDate;
    if (!base) continue;
    const due = new Date(base);
    if (Number.isNaN(due.getTime())) continue;
    due.setFullYear(due.getFullYear() + 1);
    const days = Math.ceil((due.getTime() - now) / DAY);
    if (days < 0) continue;
    if (days <= 14) urgent += 1;
    if (days <= 60) due60 += 1;
  }

  return NextResponse.json(
    { urgent, due60, total: rows.length },
    { headers: { "cache-control": "no-store" } }
  );
}
