// Runs through the working day and flips a job (or, on a split job, the
// individual visit) from Scheduled to In progress the moment its booked
// appointment time actually arrives — a 1pm job reads "in progress" at 1pm,
// not at 5am (job-day-start's old behaviour) and not whenever someone next
// happens to open the app (the client-side sweep in lib/store.js, which
// covers the common case but only while a tab is actually open).
//
// Uses the exact same autoStartDueVisits() logic the client uses, so a job
// reaches the same state here as it would if a browser had been open the
// whole time — no separate rule to keep in sync.
//
// Secured by CRON_SECRET, same pattern as the other cron routes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autoStartDueVisits } from "@/lib/visits";

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const { data: jobRows } = await supabaseAdmin.from("jobs").select("id,data");
  const now = new Date();

  const updates = [];
  for (const row of jobRows || []) {
    const job = row.data;
    const patch = autoStartDueVisits(job, now);
    if (patch) updates.push({ id: row.id, data: { ...job, ...patch } });
  }

  if (!updates.length) {
    return NextResponse.json({ ok: true, started: 0 });
  }

  const { error } = await supabaseAdmin.from("jobs").upsert(updates);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, started: updates.length, ids: updates.map((u) => u.id) });
}
