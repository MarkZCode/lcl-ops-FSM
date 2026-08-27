// Click tracker — records the click then redirects to the original URL.
// No auth — the `id` must map to a real send row.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const url = searchParams.get("url");

  // Validate the redirect target to prevent open-redirect abuse.
  // Only follow http/https URLs; reject anything else.
  let safeUrl = "/";
  try {
    const parsed = new URL(url || "");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      safeUrl = parsed.toString();
    }
  } catch {
    safeUrl = "/";
  }

  // Anti-open-redirect: only follow the external URL when the id maps to a
  // real send row. Without this, anyone could mint
  // lcl-ops.vercel.app/api/track/click?url=<phishing-site> links that carry
  // our domain's trust. Unknown/missing ids go to the homepage instead.
  let validSend = false;
  if (id && supabaseAdmin) {
    try {
      const { data: row } = await supabaseAdmin
        .from("email_sends")
        .select("id, data")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        validSend = true;
        const now = new Date().toISOString();
        const clicks = Array.isArray(row.data?.clicks) ? row.data.clicks : [];
        clicks.push({ url: safeUrl, at: now });
        await supabaseAdmin
          .from("email_sends")
          .update({
            data: {
              ...(row.data || {}),
              clickedAt: row.data?.clickedAt || now, // first click only
              clicks,
            },
            status: "clicked",
          })
          .eq("id", id);
      }
    } catch {}
  }

  return NextResponse.redirect(validSend ? safeUrl : new URL("/", request.url), { status: 302 });
}
