// Open-tracking pixel — returns a 1×1 transparent GIF and marks the email as opened.
// No auth needed (email clients load images without cookies/tokens), but the `id`
// must match a real email_sends row so random IDs have no effect.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Smallest valid 1×1 transparent GIF (43 bytes).
const PIXEL = Buffer.from(
  "47494638396101000100800000ffffff00000021f90400000000002c00000000010001000002024401003b",
  "hex"
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id && supabaseAdmin) {
    // Fire-and-forget — never delay the image response for a DB write.
    supabaseAdmin
      .from("email_sends")
      .select("id, data")
      .eq("id", id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!row) return;
        // Only stamp the first open; don't overwrite with later re-opens.
        if (row.data?.openedAt) return;
        return supabaseAdmin
          .from("email_sends")
          .update({ data: { ...(row.data || {}), openedAt: new Date().toISOString() }, status: "opened" })
          .eq("id", id);
      })
      .catch(() => {});
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
