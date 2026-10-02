// SERVER-ONLY. Builds the backup (every job, client and engineer as one
// gzipped JSON file) and emails it, with last week's figures on top, to the
// company's own accounts mailbox. Used by the Monday cron and by the
// "Send the backup now" button in Settings.
import zlib from "zlib";
import { supabaseAdmin } from "./supabaseAdmin";
import { sendEmailRaw } from "./emailSend";
import { mailboxForPurpose, resolveProvider } from "./emailProviders";
import { invoiceConfig } from "./invoiceConfig";
import { applyCompanyServer } from "./companyServer";
import { jobBalance } from "./payments";

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

export async function sendBackupEmail() {
  if (!supabaseAdmin) return { ok: false, status: 503, error: "Database not configured" };
  try {
    await applyCompanyServer();
    const [jobs, clients, engineers] = await Promise.all([all("jobs"), all("clients"), all("engineers")]);
    const stamp = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), jobs, clients, engineers }, slim);
    const gz = zlib.gzipSync(Buffer.from(json, "utf8"));
    if (gz.length > MAX_ATTACHMENT_BYTES) {
      return { ok: false, status: 500, error: "Backup is too large to email", bytes: gz.length };
    }

    // Last week in five figures, at the top of the same Monday email.
    const weekAgo = Date.now() - 7 * 86400_000;
    const inWeek = (iso) => iso && new Date(iso).getTime() >= weekAgo;
    const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;
    const live = jobs.filter((j) => j.status !== "cancelled");
    const figures = [
      `New jobs: ${jobs.filter((j) => inWeek(j.createdAt)).length}`,
      `Quotes accepted: ${jobs.filter((j) => inWeek(j.acceptedAt)).length}`,
      `Invoiced: ${gbp(live.filter((j) => inWeek(j.invoicedAt)).reduce((s, j) => s + (Number(j.price) || 0), 0))}`,
      `Paid: ${gbp(live.filter((j) => inWeek(j.paidAt)).reduce((s, j) => s + (Number(j.price) || 0), 0))}`,
      `Owed to us now: ${gbp(live.filter((j) => j.status === "invoiced").reduce((s, j) => s + jobBalance(j), 0))}`,
    ].join("\n");

    // Who owes what — oldest first.
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const days = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
    const owed = live.filter((j) => j.status === "invoiced" && jobBalance(j) > 0)
      .sort((a, b) => new Date(a.invoicedAt || 0) - new Date(b.invoicedAt || 0))
      .slice(0, 20)
      .map((j) => `${j.id} · ${clientName.get(j.clientId) || "—"} · ${gbp(jobBalance(j))} · ${j.invoicedAt ? `${days(j.invoicedAt)} days` : "date unknown"}`);
    // Things that have gone quiet or are about to lapse.
    const stuck = live.filter((j) => ["quote", "scheduled", "in_progress", "completed"].includes(j.status) && (j.acceptedAt || j.status !== "quote") && days(j.updatedAt || j.createdAt || new Date().toISOString()) >= 14)
      .slice(0, 15).map((j) => `${j.id} · ${clientName.get(j.clientId) || "—"} · ${j.status} · no change in ${days(j.updatedAt || j.createdAt)} days`);
    const paperwork = [];
    for (const e of engineers) {
      for (const d of e.documents || []) {
        if (!d.expiresAt) continue;
        const left = Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 86400_000);
        if (left <= 30) paperwork.push(`${e.name} · ${d.label || d.type} · ${left < 0 ? `expired ${-left} days ago` : `expires in ${left} days`}`);
      }
    }
    const section = (title, rows, none) => `${title}\n${rows.length ? rows.join("\n") : none}\n\n`;
    const attention =
      section("WHO OWES WHAT", owed, "Nothing outstanding.") +
      section("JOBS WITH NO CHANGE IN TWO WEEKS", stuck, "None.") +
      section("ENGINEER PAPERWORK EXPIRING", paperwork, "Nothing within 30 days.");

    const to = process.env.BACKUP_EMAIL || invoiceConfig.accountsEmail || process.env.GMAIL_USER;
    const routed = mailboxForPurpose("invoice");
    const result = await sendEmailRaw({
      to,
      subject: `LCL Ops — last week's figures and backup, ${stamp}`,
      text:
        `LAST WEEK\n${figures}\n\n` + attention +
        `Attached is this week's backup of LCL Ops: ${jobs.length} jobs, ${clients.length} clients and ${engineers.length} engineers.\n\n` +
        `Keep this email. The attachment is a compressed file (.json.gz) holding client details — don't forward it.\n\n` +
        `Sent automatically every Monday.`,
      fromName: "LCL Ops",
      attachments: [{ filename: `lcl-ops-backup-${stamp}.json.gz`, base64: gz.toString("base64"), contentType: "application/gzip" }],
      provider: resolveProvider(routed.provider),
      identity: routed.identity,
    });
    if (!result.ok) return { ok: false, status: 502, error: result.error || "send failed" };
    return { ok: true, to, jobs: jobs.length, clients: clients.length, engineers: engineers.length, bytes: gz.length };
  } catch (err) {
    return { ok: false, status: 500, error: String(err.message || err) };
  }
}
