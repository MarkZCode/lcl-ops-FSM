// Card payment link for a job (Stripe Checkout).
//
// Does nothing until STRIPE_SECRET_KEY is set on the server — it answers
// { notConfigured: true } and the button says so. The link takes the client
// to Stripe's own page; no card details ever touch this app. Marking the
// job paid stays a manual step: there is no webhook here yet, so check the
// Stripe dashboard (or the bank) before pressing Mark as paid.
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ notConfigured: true }, { status: 503 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  let body = {};
  try { body = await request.json(); } catch {}
  const { data } = await supabaseAdmin.from("jobs").select("data").eq("id", String(body.jobId || "")).maybeSingle();
  const job = data?.data;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const pence = Math.round((Number(body.amount) || 0) * 100);
  if (!(pence >= 100)) return NextResponse.json({ error: "Nothing to pay on this job." }, { status: 400 });

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(pence),
    "line_items[0][price_data][product_data][name]": `Landlord Compliance London — ${job.invoiceNumber ? `Invoice ${job.invoiceNumber}` : job.id}`,
    client_reference_id: job.id,
    "metadata[jobId]": job.id,
    success_url: job.shareToken ? `${origin}/share/${job.shareToken}` : "https://landlordcompliancelondon.uk",
    cancel_url: job.shareToken ? `${origin}/share/${job.shareToken}` : "https://landlordcompliancelondon.uk",
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) return NextResponse.json({ error: d?.error?.message || "Stripe refused the request." }, { status: 502 });
  return NextResponse.json({ ok: true, url: d.url });
}
