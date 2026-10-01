// SERVER-ONLY. One push to EVERY device that has notifications switched on,
// whoever it belongs to — for the things the whole office needs to know the
// moment they happen (a new enquiry has just become a quote).
//
// Two courtesies on top of "send to everyone":
//   • each person can switch a kind of push off for themselves (Settings);
//   • between 9pm and 7am UK time a non-urgent push is held and delivered
//     in the morning, instead of buzzing phones overnight. A new enquiry is
//     urgent and always goes straight away.
//
// Never throws: a push that fails must not undo the thing it's announcing.
import { supabaseAdmin } from "./supabaseAdmin";
import { sendPush, webPushConfigured } from "./webPush";
import { PUSH_KINDS, QUIET_FROM, QUIET_UNTIL } from "./pushKinds";

const QUEUE_ID = "push_queue";

function ukHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(now));
}
export function isQuietHours(now = new Date()) {
  const h = ukHour(now);
  return h >= QUIET_FROM || h < QUIET_UNTIL;
}

// user id → set of kinds they've switched off.
async function optOuts() {
  const map = new Map();
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users || []) {
      const off = u.user_metadata?.push_off;
      if (Array.isArray(off) && off.length) map.set(u.id, new Set(off));
    }
  } catch {}
  return map;
}

async function deliver(payload, kind) {
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,user_id");
  if (error) throw new Error(error.message);
  const off = kind ? await optOuts() : new Map();
  const targets = (subs || []).filter((s) => !off.get(s.user_id)?.has(kind));
  const results = await Promise.all(targets.map((sub) => sendPush(sub, payload)));
  const dead = targets.filter((_, i) => results[i].gone).map((s) => s.id);
  if (dead.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", dead);
  const sent = results.filter((r) => r.ok).length;
  console.log("[push-all]", JSON.stringify({ title: payload.title, kind: kind || null, devices: targets.length, sent, pruned: dead.length }));
  return { sent, pruned: dead.length };
}

// `kind` is one of PUSH_KINDS' keys. Without one the push is treated as
// urgent and can't be opted out of.
export async function pushToAll(payload, { kind } = {}) {
  if (!supabaseAdmin || !webPushConfigured) return { sent: 0, skipped: true };
  try {
    const meta = PUSH_KINDS.find((k) => k.key === kind);
    if (meta && !meta.urgent && isQuietHours()) {
      const { data: row } = await supabaseAdmin.from("app_settings").select("data").eq("id", QUEUE_ID).maybeSingle();
      const items = [...(row?.data?.items || []), { payload, kind, at: new Date().toISOString() }].slice(-50);
      await supabaseAdmin.from("app_settings").upsert({ id: QUEUE_ID, data: { items } });
      return { sent: 0, held: true };
    }
    return await deliver(payload, kind);
  } catch (err) {
    console.log("[push-all] failed", String(err.message || err).slice(0, 200));
    return { sent: 0, error: String(err.message || err) };
  }
}

// Deliver whatever was held overnight. Called by the morning cron.
export async function flushHeldPushes() {
  if (!supabaseAdmin || !webPushConfigured || isQuietHours()) return { flushed: 0 };
  try {
    const { data: row } = await supabaseAdmin.from("app_settings").select("data").eq("id", QUEUE_ID).maybeSingle();
    const items = row?.data?.items || [];
    if (!items.length) return { flushed: 0 };
    await supabaseAdmin.from("app_settings").upsert({ id: QUEUE_ID, data: { items: [] } });
    for (const it of items) await deliver(it.payload, it.kind);
    return { flushed: items.length };
  } catch (err) {
    return { flushed: 0, error: String(err.message || err) };
  }
}
