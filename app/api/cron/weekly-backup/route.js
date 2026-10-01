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
import zlib from "zlib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailRaw } from "@/lib/emailSend";
import { mailboxForPurpose, resolveProvider } from "@/lib/emailProviders";
import { invoiceConfig } from "@/lib/invoiceConfig";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

async function all(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select("id,data").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []).map((r) => r.data).filter(Boolean));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Inline base64 files (from before uploads moved to storage) would make the
// backup too big to email. Keep the record, drop the bytes.
const slim = (_k, v) => (typeof v === "string" && v.length > 20000 && v.startsWith("data:") ? "[inline file removed from backup]" : v);

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  try {
    const [jobs, clients, engineers] = await Promise.all([all("jobs"), all("clients"), all("engineers")]);
    const stamp = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), jobs, clients, engineers }, slim);
    const gz = zlib.gzipSync(Buffer.from(json, "utf8"));
    if (gz.length > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ ok: false, error: "Backup is too large to email", bytes: gz.length }, { status: 500 });
    }

    const to = process.env.BACKUP_EMAIL || invoiceConfig.accountsEmail || process.env.GMAIL_USER;
    const routed = mailboxForPurpose("invoice");
    const result = await sendEmailRaw({
      to,
      subject: `LCL Ops weekly backup — ${stamp}`,
      text:
        `Attached is this week's backup of LCL Ops: ${jobs.length} jobs, ${clients.length} clients and ${engineers.length} engineers.\n\n` +
        `Keep this email. The attachment is a compressed file (.json.gz) holding client details — don't forward it.\n\n` +
        `Sent automatically every Monday.`,
      fromName: "LCL Ops",
      attachments: [{ filename: `lcl-ops-backup-${stamp}.json.gz`, base64: gz.toString("base64"), contentType: "application/gzip" }],
      provider: resolveProvider(routed.provider),
      identity: routed.identity,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error || "send failed" }, { status: 502 });
    return NextResponse.json({ ok: true, to, jobs: jobs.length, clients: clients.length, engineers: engineers.length, bytes: gz.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
