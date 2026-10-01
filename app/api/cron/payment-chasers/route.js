// Vercel cron — daily. Emails a payment reminder for invoices still unpaid
// 7, 14 and 30 days after they were sent: one email per stage, never two
// for the same stage, and nothing at all unless "Chase unpaid invoices
// automatically" is switched on in Settings → Auto-notifications.
//
// Skips: jobs with no client email, clients who unsubscribed, jobs with no
// balance left, and any job where the office wrote "DND" in the notes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailRaw } from "@/lib/emailSend";
import { mailboxForPurpose, resolveProvider } from "@/lib/emailProviders";
import { invoiceConfig } from "@/lib/invoiceConfig";
import { jobBalance } from "@/lib/payments";
import { pushToAll } from "@/lib/pushAll";

export const runtime = "nodejs";
export const maxDuration = 60;

const STAGES = [{ n: 1, days: 7 }, { n: 2, days: 14 }, { n: 3, days: 30 }];
const MAX_PER_RUN = 15;
const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const { data: settings } = await supabaseAdmin.from("app_settings").select("data").eq("id", "singleton").maybeSingle();
  if (!settings?.data?.autoNotify?.payment_chasers) {
    return NextResponse.json({ skipped: true, reason: "Automatic payment chasers are switched off" });
  }
  const emailCfg = settings.data.email || {};

  const [{ data: jobRows }, { data: clientRows }, { data: supp }] = await Promise.all([
    supabaseAdmin.from("jobs").select("id,data").eq("data->>status", "invoiced"),
    supabaseAdmin.from("clients").select("id,data"),
    supabaseAdmin.from("app_settings").select("data").eq("id", "email_suppressions").maybeSingle(),
  ]);
  const clients = new Map((clientRows || []).map((r) => [r.id, r.data]));
  const suppressed = new Set(supp?.data?.emails || []);
  const now = Date.now();
  const routed = mailboxForPurpose("invoice");
  const sent = [];

  for (const row of jobRows || []) {
    if (sent.length >= MAX_PER_RUN) break;
    const job = row.data;
    if (!job?.invoicedAt) continue;
    if (/\bdnd\b|do not (chase|contact)/i.test(job.notes || "")) continue;
    const days = Math.floor((now - new Date(job.invoicedAt).getTime()) / 86400_000);
    const stage = [...STAGES].reverse().find((s) => days >= s.days);
    if (!stage || (job.paymentChaseStage || 0) >= stage.n) continue;
    const balance = jobBalance(job);
    if (!(balance > 0)) continue;
    const client = clients.get(job.clientId);
    const to = String(client?.billingEmail || client?.email || "").trim().toLowerCase();
    if (!to || suppressed.has(to)) continue;

    const ref = job.invoiceNumber ? `invoice ${job.invoiceNumber}` : `invoice ${job.id}`;
    const first = String(client.billingName || client.name || "").trim().split(/\s+/)[0] || "there";
    const b = invoiceConfig.bank;
    const text =
      `Hi ${first},\n\n` +
      (stage.n === 1
        ? `Just a friendly reminder that ${ref} for ${gbp(balance)} is still showing as unpaid.`
        : stage.n === 2
          ? `We don't appear to have received payment for ${ref} yet — ${gbp(balance)} is outstanding, ${days} days after it was sent.`
          : `${ref} for ${gbp(balance)} is now ${days} days overdue. Please arrange payment, or let us know if there's a problem with it.`) +
      `\n\nBank transfer details:\nAccount holder: ${b.accountHolder}\nSort code: ${b.sortCode}\nAccount number: ${b.accountNumber}\nReference: ${job.invoiceNumber || job.id}\n\n` +
      `If you've already paid, thank you — please ignore this, or reply with the payment date so we can match it.\n\n` +
      `Kind regards,\nAccounts\n${invoiceConfig.company}\n${invoiceConfig.phone}`;

    const result = await sendEmailRaw({
      to, subject: `Payment reminder — ${ref}`, text,
      fromName: emailCfg.fromName || invoiceConfig.company,
      replyTo: emailCfg.replyTo && !/co\.uk/i.test(emailCfg.replyTo) ? emailCfg.replyTo : undefined,
      provider: resolveProvider(routed.provider), identity: routed.identity,
    });
    if (!result.ok) continue;

    const at = new Date().toISOString();
    // Re-read before writing: someone may have marked it paid meanwhile.
    const { data: fresh } = await supabaseAdmin.from("jobs").select("data").eq("id", row.id).maybeSingle();
    const cur = fresh?.data || job;
    if (cur.status !== "invoiced") continue;
    await supabaseAdmin.from("jobs").upsert({
      id: row.id,
      data: {
        ...cur,
        paymentChaseStage: stage.n,
        paymentChasedAt: at,
        updatedAt: at,
        activity: [...(cur.activity || []), { id: "act-" + Date.now().toString(36) + sent.length, at, by: "Auto-chaser", type: "email", template: "invoice", title: `Payment reminder sent automatically (${days} days)`, detail: text, to }],
      },
    });
    sent.push({ jobId: job.id, days, stage: stage.n });
  }

  if (sent.length) {
    await pushToAll({ title: "Payment reminders sent", body: `${sent.length} unpaid invoice${sent.length === 1 ? "" : "s"} chased automatically: ${sent.map((s) => s.jobId).slice(0, 4).join(", ")}`, url: "/jobs?status=invoiced" });
  }
  return NextResponse.json({ ok: true, sent });
}
