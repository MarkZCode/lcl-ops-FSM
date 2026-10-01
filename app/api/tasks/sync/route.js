// Bring the task board in line with what the jobs need right now.
// The app calls this every few minutes while someone has it open; the
// server ignores calls that arrive within two minutes of the last run.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabaseAdmin";
import { runTaskSync } from "@/lib/taskSync";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runTaskSync());
}
