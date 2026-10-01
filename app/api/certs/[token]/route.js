// A client's certificates, by link (/certs/<token>) — no login.
//
// One link per client (client.portalToken) that always shows the current
// certificates for every property they have with us: what it is, where,
// when it expires, and the PDF. Only PDFs on jobs that are finished are
// listed, and only these fields leave the server — no prices, no notes, no
// phone numbers, no engineer details.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serviceShort, isAddonCode } from "@/lib/format";

export const runtime = "nodejs";

const isPdf = (f) => f?.type === "application/pdf" || f?.contentType === "application/pdf" || /\.pdf$/i.test(f?.name || "");

export async function GET(_req, { params }) {
  const token = params?.token;
  if (!token || String(token).length < 16 || !supabaseAdmin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: cRow } = await supabaseAdmin.from("clients").select("id,data").eq("data->>portalToken", token).maybeSingle();
  const client = cRow?.data;
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: jobRows } = await supabaseAdmin.from("jobs").select("data").eq("data->>clientId", cRow.id);
  const props = new Map((client.properties || []).map((p) => [p.id, p]));
  const certs = [];
  for (const r of jobRows || []) {
    const j = r.data;
    if (!j || !["completed", "invoiced", "paid"].includes(j.status)) continue;
    const p = props.get(j.propertyId);
    for (const f of j.attachments || []) {
      if (!isPdf(f) || !f.url) continue;
      if (f.check?.postcode === "missing") continue; // flagged as possibly the wrong file — never published
      certs.push({
        id: f.id,
        name: f.name,
        url: f.url,
        services: (j.services || []).filter((c) => !isAddonCode(c)).map(serviceShort).join(", "),
        property: [p?.label, p?.postcode].filter(Boolean).join(", "),
        date: j.completedAt || j.scheduledAt || f.addedAt,
        expires: j.certExpiry || null,
      });
    }
  }
  certs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return NextResponse.json({ name: client.name, certs }, { headers: { "Cache-Control": "no-store" } });
}
