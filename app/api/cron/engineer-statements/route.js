// Vercel cron — 1st of each month. Emails every engineer who has an email
// address a summary of LAST month: the jobs they did, what they earned,
// what's been paid and what's outstanding. Uses the same pay calculation as
// Reports → Engineer pay, so the figures match what the office sees.
//
// Off until "Email engineers their monthly statement" is switched on in
// Settings → Auto-notifications. It shows the engineer's own pay only —
// never the price the customer paid.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailRaw } from "@/lib/emailSend";
import { mailboxForPurpose, resolveProvider } from "@/lib/emailProviders";
import { computeEngineerPay } from "@/lib/stats";
import { invoiceConfig } from "@/lib/invoiceConfig";
import { applyCompanyServer } from "@/lib/companyServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });
  await applyCompanyServer();

  const { data: settings } = await supabaseAdmin.from("app_settings").select("data").eq("id", "singleton").maybeSingle();
  if (!settings?.data?.autoNotify?.engineer_statements) {
    return NextResponse.json({ skipped: true, reason: "Monthly engineer statements are switched off" });
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
  const label = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const [{ data: jobRows }, { data: engRows }, { data: payRow }] = await Promise.all([
    supabaseAdmin.from("jobs").select("data"),
    supabaseAdmin.from("engineers").select("data"),
    supabaseAdmin.from("app_settings").select("data").eq("id", "engineer_payments").maybeSingle(),
  ]);
  const jobs = (jobRows || []).map((r) => r.data).filter(Boolean);
  const engineers = (engRows || []).map((r) => r.data).filter(Boolean);
  const pay = computeEngineerPay(jobs, { start, end, label }, engineers, payRow?.data?.items || []);

  const routed = mailboxForPurpose("invoice");
  const sent = [];
  for (const row of pay.rows) {
    const eng = engineers.find((e) => e.id === row.id);
    if (!eng?.email || !row.jobs) continue;
    const lines = (row.jobDetails || []).slice(0, 60).map((d) => `  ${d.jobId}${d.date ? ` · ${d.date}` : ""}${d.description ? ` · ${d.description}` : ""}`);
    const text =
      `Hi ${String(eng.name || "").split(" ")[0]},\n\nHere is your statement for ${label}.\n\n` +
      `Jobs completed: ${row.jobs}\nEarned: ${gbp(row.accrued)}\nPaid so far: ${gbp(row.paid)}\nOutstanding: ${gbp(row.balance)}\n\n` +
      (lines.length ? `Jobs:\n${lines.join("\n")}\n\n` : "") +
      `If anything looks wrong, reply to this email and we'll check it.\n\nKind regards,\nAccounts\n${invoiceConfig.company}`;
    const result = await sendEmailRaw({
      to: eng.email, subject: `Your statement for ${label} — ${invoiceConfig.company}`, text,
      fromName: invoiceConfig.company, provider: resolveProvider(routed.provider), identity: routed.identity,
    });
    if (result.ok) sent.push(eng.name);
  }
  return NextResponse.json({ ok: true, month: label, sent });
}
