// Vercel cron — daily. Two unrelated morning chores that each need a look
// at everything once a day:
//
//  1. RENEWAL QUOTES. A certificate that runs out within 60 days gets its
//     renewal quote created ready to send — same client, same property,
//     same services — and linked to the job it renews. Only when "Create
//     renewal quotes automatically" is on in Settings → Auto-notifications,
//     never twice for the same job, and not when the property already has
//     open work for that service. It creates the quote; it does not send it.
//
//  2. ENGINEER PAPERWORK. A push to the office when an engineer's Gas Safe
//     card, NICEIC/NAPIT registration or insurance is 30, 14, 7, 3 or 1 days
//     from expiring, or expired today.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RENEWAL_MONTHS } from "@/lib/constants";
import { getJobLines, makeServiceLine, isAddonCode } from "@/lib/format";
import { quotePrice } from "@/lib/enquiry";
import { docTypeLabel } from "@/lib/engineerDocs";
import { pushToAll, flushHeldPushes } from "@/lib/pushAll";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = 86400_000;
const MAX_QUOTES_PER_RUN = 10;
const DOC_ALERT_DAYS = new Set([30, 14, 7, 3, 1, 0]);

export async function GET(request) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ skipped: true, reason: "Supabase not configured" });

  const now = new Date();
  const nowIso = now.toISOString();
  const [{ data: settings }, { data: jobRows }, { data: engRows }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("data").eq("id", "singleton").maybeSingle(),
    supabaseAdmin.from("jobs").select("id,data"),
    supabaseAdmin.from("engineers").select("id,data"),
  ]);
  const jobs = (jobRows || []).map((r) => r.data).filter(Boolean);

  // ── 1. Renewal quotes ──
  const created = [];
  if (settings?.data?.autoNotify?.renewal_quotes) {
    const taken = new Set(jobs.map((j) => j.id));
    const open = jobs.filter((j) => ["quote", "scheduled", "in_progress"].includes(j.status));
    const due = jobs
      .filter((j) => ["completed", "invoiced", "paid"].includes(j.status) && j.certExpiry && !j.renewalJobId && !j.recurringNextId)
      .map((j) => ({ j, days: Math.ceil((new Date(j.certExpiry).getTime() - now.getTime()) / DAY) }))
      .filter((x) => x.days >= 0 && x.days <= 60)
      .sort((a, b) => a.days - b.days);

    for (const { j, days } of due) {
      if (created.length >= MAX_QUOTES_PER_RUN) break;
      const renewing = getJobLines(j).filter((l) => !l.cancelled && !isAddonCode(l.code) && RENEWAL_MONTHS[l.code]);
      if (!renewing.length) continue;
      const codes = new Set(renewing.map((l) => l.code));
      const already = open.some((o) => o.clientId === j.clientId && o.propertyId === j.propertyId && getJobLines(o).some((l) => codes.has(l.code)));
      if (already) continue;

      const stamp = Date.now().toString(36);
      const lines = renewing.map((l, i) => ({
        id: `ln-${l.code}-${stamp}-${i}`, code: l.code, name: l.name, unit: l.unit, qty: l.qty || 1,
        ...(l.tier ? { tier: l.tier } : {}),
        ...(l.bedroomCount ? { bedroomCount: l.bedroomCount } : {}),
      }));
      lines.push(makeServiceLine("PARKING", `ln-PARKING-${stamp}`));
      let id;
      do { id = "JOB-" + Math.floor(1000 + Math.random() * 9000); } while (taken.has(id));
      taken.add(id);

      const quote = {
        id, status: "quote", engineerId: "unassigned", scheduledAt: null,
        clientId: j.clientId, propertyId: j.propertyId || null,
        lineItems: lines,
        services: lines.map((l) => l.code),
        quantities: Object.fromEntries(lines.map((l) => [l.code, l.qty || 1])),
        ...(j.gasAppliances ? { gasAppliances: j.gasAppliances } : {}),
        price: quotePrice(lines),
        notes: "",
        certExpiry: null,
        source: "renewal",
        recurringFromId: j.id,
        nameOnCert: j.nameOnCert || "",
        accessName: j.accessName || "", accessPhone: j.accessPhone || "",
        accessContacts: j.accessContacts || [],
        activity: [{ id: "act-" + stamp, at: nowIso, by: "Auto-renewal", type: "note", title: `Renewal quote created automatically`, detail: `The certificate from ${j.id} expires in ${days} day${days === 1 ? "" : "s"}.` }],
        statusHistory: [{ status: "quote", enteredAt: nowIso, exitedAt: null, by: "Auto-renewal" }],
        createdAt: nowIso, updatedAt: nowIso,
      };
      const { error } = await supabaseAdmin.from("jobs").upsert({ id, data: quote });
      if (error) continue;
      await supabaseAdmin.from("jobs").upsert({ id: j.id, data: { ...j, renewalJobId: id, updatedAt: nowIso } });
      open.push(quote);
      created.push({ id, from: j.id, days });
    }
    if (created.length) {
      await pushToAll({
        title: `${created.length} renewal quote${created.length === 1 ? "" : "s"} ready to send`,
        body: created.slice(0, 4).map((c) => `${c.id} (expires in ${c.days}d)`).join(", "),
        url: "/jobs?status=quote",
      }, { kind: "renewals" });
    }
  }

  // ── 2. Engineer paperwork ──
  const alerts = [];
  for (const row of engRows || []) {
    const e = row.data;
    if (!e || e.active === false) continue;
    for (const d of e.documents || []) {
      if (!d?.expiresAt) continue;
      const days = Math.ceil((new Date(d.expiresAt).getTime() - now.getTime()) / DAY);
      if (DOC_ALERT_DAYS.has(days)) alerts.push(`${e.name}: ${docTypeLabel(d.type)} ${days === 0 ? "expires today" : `expires in ${days} day${days === 1 ? "" : "s"}`}`);
    }
  }
  if (alerts.length) {
    await pushToAll({ title: "Engineer paperwork expiring", body: alerts.slice(0, 5).join("\n"), url: "/engineers" }, { kind: "paperwork" });
  }

  // ── 3. Anything held back overnight (quiet hours) goes out now. ──
  const held = await flushHeldPushes();

  return NextResponse.json({ ok: true, renewalQuotes: created, paperworkAlerts: alerts.length, heldPushes: held.flushed });
}
