// Campaign stats — aggregate email_sends by campaign_label.
// Returns: [{ label, sent, opened, clicked, unsubscribed, failed, lastSentAt }]
import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ campaigns: [] });

  try {
    // Fetch all rows grouped by campaign_label. We load up to 5000 rows and
    // aggregate in-process — avoids needing a Postgres view or custom function.
    const { data, error } = await supabaseAdmin
      .from("email_sends")
      .select("id, campaign_label, status, sent_at, data")
      .not("campaign_label", "is", null)
      .order("sent_at", { ascending: false })
      .limit(5000);

    if (error) throw error;

    // Aggregate per label.
    const map = new Map();
    for (const row of data || []) {
      const label = row.campaign_label || "Unlabelled";
      if (!map.has(label)) {
        map.set(label, { label, sent: 0, opened: 0, clicked: 0, unsubscribed: 0, failed: 0, lastSentAt: null });
      }
      const agg = map.get(label);
      agg.sent++;
      if (row.data?.openedAt) agg.opened++;
      if (row.data?.clickedAt) agg.clicked++;
      if (row.data?.unsubAt || row.status === "unsubscribed") agg.unsubscribed++;
      if (row.status === "failed") agg.failed++;
      if (!agg.lastSentAt || row.sent_at > agg.lastSentAt) agg.lastSentAt = row.sent_at;
    }

    const campaigns = Array.from(map.values()).sort(
      (a, b) => new Date(b.lastSentAt) - new Date(a.lastSentAt)
    );

    return NextResponse.json({ campaigns });
  } catch (err) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
