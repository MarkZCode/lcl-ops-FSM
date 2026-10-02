// "Send the backup now" — the same email the Monday cron sends, on demand.
// Admins only. It goes to the accounts mailbox, never to an address supplied
// in the request.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabaseAdmin";
import { sendBackupEmail } from "@/lib/backupEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const r = await sendBackupEmail();
  return NextResponse.json(r, { status: r.ok ? 200 : r.status || 500 });
}
