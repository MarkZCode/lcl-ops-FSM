// Vercel cron — Mondays 06:00 UTC. Emails a copy of the business's data to
// the company's own accounts mailbox, so a copy exists outside the database
// every week without anyone remembering to download one.
//
// What's in it: every job, client and engineer, as one gzipped JSON file.
// Uploaded files (certificates, photos) are referenced by their link, not
// embedded — old inline images are dropped so the file stays emailable.
// Where it goes: BACKUP_EMAIL if set, otherwise the accounts mailbox. It is
// never sent anywhere else.
import { NextResponse } from "next/server";
import { sendBackupEmail } from "@/lib/backupEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await sendBackupEmail();
  return NextResponse.json(r, { status: r.ok ? 200 : r.status || 500 });
}
