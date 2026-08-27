// Unsubscribe endpoint — marks the send row and persists the email address
// to a suppression list in app_settings so future campaigns skip it.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token"); // same as send_id

  if (!token || !supabaseAdmin) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  try {
    // Look up the send row to get the email address.
    const { data: row } = await supabaseAdmin
      .from("email_sends")
      .select("id, to_email, data")
      .eq("id", token)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    // Mark unsubscribed on the send row.
    await supabaseAdmin
      .from("email_sends")
      .update({
        status: "unsubscribed",
        data: { ...(row.data || {}), unsubAt: new Date().toISOString() },
      })
      .eq("id", token);

    // Add to suppression list stored in app_settings.
    const { data: existing } = await supabaseAdmin
      .from("app_settings")
      .select("data")
      .eq("id", "email_suppressions")
      .maybeSingle();

    const list = existing?.data?.emails || [];
    const email = (row.to_email || "").toLowerCase().trim();
    if (email && !list.includes(email)) {
      await supabaseAdmin
        .from("app_settings")
        .upsert({ id: "email_suppressions", data: { emails: [...list, email] } });
    }

    return NextResponse.json({ ok: true, email: row.to_email });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
