// SERVER-ONLY. One push to EVERY device that has notifications switched on,
// whoever it belongs to — for the things the whole office needs to know the
// moment they happen (a new enquiry has just become a quote).
//
// Never throws: a push that fails must not undo the thing it's announcing.
import { supabaseAdmin } from "./supabaseAdmin";
import { sendPush, webPushConfigured } from "./webPush";

export async function pushToAll(payload) {
  if (!supabaseAdmin || !webPushConfigured) return { sent: 0, skipped: true };
  try {
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth");
    if (error) throw new Error(error.message);
    const results = await Promise.all((subs || []).map((sub) => sendPush(sub, payload)));
    const dead = (subs || []).filter((_, i) => results[i].gone).map((s) => s.id);
    if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
    const sent = results.filter((r) => r.ok).length;
    console.log("[push-all]", JSON.stringify({ title: payload.title, devices: (subs || []).length, sent, pruned: dead.length }));
    return { sent, pruned: dead.length };
  } catch (err) {
    console.log("[push-all] failed", String(err.message || err).slice(0, 200));
    return { sent: 0, error: String(err.message || err) };
  }
}
