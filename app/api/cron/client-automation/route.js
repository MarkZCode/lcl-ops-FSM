// Vercel cron — daily, mid-afternoon UK. Three small client emails the
// office would otherwise have to remember, each behind its own switch in
// Settings → Auto-notifications and each OFF until someone turns it on:
//
//   • client_reminders — the appointment reminder, the day before, for
//     visits the engineer has confirmed;
//   • review_requests  — the review request, three days after the
//     certificate went out;
//   • quote_chasers    — one follow-up on a quote five days after it was
//     sent, when the client hasn't replied and nobody has chased.
//
// Each uses the saved template of the same name, goes from the same mailbox
// a hand-sent one would, is written on the job, and is never sent twice.
// Skips clients who unsubscribed and jobs marked DND in the notes.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailRaw } from "@/lib/emailSend";
import { mailboxForPurpose, resolveProvider } from "@/lib/emailProviders";
import { applyCompanyServer } from "@/lib/companyServer";
import { invoiceConfig } from "@/lib/invoiceConfig";
import { defaultTemplates, defaultEmailSettings } from "@/lib/settings";
import { renderTemplate, buildContext } from "@/lib/email";
import { blockersForScheduling } from "@/lib/visits";
import { lastSent, quoteSentEvidence, unansweredReply, noteSignals } from "@/lib/nextAction";

export const runtime = "nodejs";
export const maxDuration = 60;
const DAY = 86400_000;
const MAX_PER_RUN = 20;
const londonDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const { data: settings } = await supabaseAdmin.from("app_settings").select("data").eq("id", "singleton").maybeSingle();
  const on = settings?.data?.autoNotify || {};
  if (!on.client_reminders && !on.review_requests && !on.quote_chasers) {
    return NextResponse.json({ skipped: true, reason: "All three are switched off" });
  }
  await applyCompanyServer();
  const emailCfg = { ...defaultEmailSettings, ...(settings.data.email || {}) };
  const templates = { ...defaultTemplates, ...(settings.data.templates || {}) };

  const [{ data: jobRows }, { data: clientRows }, { data: supp }] = await Promise.all([
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("clients").select("id,data"),
    supabaseAdmin.from("app_settings").select("data").eq("id", "email_suppressions").maybeSingle(),
  ]);
  const clients = new Map((clientRows || []).map((r) => [r.id, r.data]));
  const suppressed = new Set(supp?.data?.emails || []);
  const now = Date.now();
  const tomorrow = londonDay(new Date(now + DAY));
  const sent = [];

  const send = async (row, tplKey, title) => {
    const job = row.data;
    const client = clients.get(job.clientId);
    const to = String(client?.email || "").trim().toLowerCase();
    if (!to || suppressed.has(to)) return false;
    const tpl = templates[tplKey];
    if (!tpl) return false;
    const property = (client.properties || []).find((p) => p.id === job.propertyId) || null;
    const ctx = buildContext({ job, client, property, email: emailCfg });
    const sig = emailCfg.signature ? `\n\n${renderTemplate(emailCfg.signature, ctx)}` : "";
    const routed = mailboxForPurpose(tplKey);
    const result = await sendEmailRaw({
      to, subject: renderTemplate(tpl.subject, ctx), text: renderTemplate(tpl.body, ctx) + sig,
      fromName: emailCfg.fromName || invoiceConfig.company,
      provider: resolveProvider(routed.provider), identity: routed.identity,
    });
    if (!result.ok) return false;
    const at = new Date().toISOString();
    // Re-read before writing so a change made meanwhile isn't lost.
    const { data: fresh } = await supabaseAdmin.from("jobs").select("data").eq("id", row.id).maybeSingle();
    const cur = fresh?.data || job;
    await supabaseAdmin.from("jobs").upsert({
      id: row.id,
      data: {
        ...cur,
        ...(tplKey === "followup" ? { quoteChasedAt: at } : {}),
        updatedAt: at,
        activity: [...(cur.activity || []), { id: "act-" + Date.now().toString(36) + sent.length, at, by: "Automatic", type: "email", template: tplKey, title, to }],
      },
    });
    sent.push({ jobId: job.id, kind: tplKey });
    return true;
  };

  for (const row of jobRows || []) {
    if (sent.length >= MAX_PER_RUN) break;
    const job = row.data;
    if (!job || /\bdnd\b|do not (chase|contact|disturb)/i.test(job.notes || "")) continue;

    // The day before a confirmed visit.
    if (on.client_reminders && job.status === "scheduled" && job.scheduledAt && londonDay(new Date(job.scheduledAt)) === tomorrow
        && blockersForScheduling(job).length === 0 && !lastSent(job, "reminder")) {
      await send(row, "reminder", "Appointment reminder sent automatically");
      continue;
    }

    // Three to ten days after the certificate went out.
    const certAt = job.certifiedAt || job.certificateSentAt;
    if (on.review_requests && job.status === "paid" && certAt && !job.reviewSkipped) {
      const d = Math.floor((now - new Date(certAt).getTime()) / DAY);
      if (d >= 3 && d <= 10 && !lastSent(job, "review_request") && !(job.activity || []).some((a) => /review/i.test(a.title || ""))) {
        await send(row, "review_request", "Review request sent automatically");
        continue;
      }
    }

    // One follow-up, five days after the quote, if it has gone quiet.
    if (on.quote_chasers && job.status === "quote" && !job.acceptedAt) {
      const ev = quoteSentEvidence(job);
      const { signals } = noteSignals(job);
      const held = job.quoteHoldUntil && job.quoteHoldUntil >= londonDay(new Date());
      if (ev && !held && !signals.includes("declined") && !signals.includes("client_will_revert") && !unansweredReply(job)
          && !lastSent(job, "followup") && !job.quoteChasedAt) {
        const d = Math.floor((now - new Date(ev.at).getTime()) / DAY);
        if (d >= 5 && d < 30) await send(row, "followup", "Quote follow-up sent automatically");
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}
