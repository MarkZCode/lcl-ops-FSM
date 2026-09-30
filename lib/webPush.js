// SERVER-ONLY Web Push sender. Never import from a client component — it
// uses the VAPID private key.
import webpush from "web-push";

// Re-enabled — the earlier "spamming/crashing on open" issue was tied to
// how often/how many pushes fired, not the send mechanism itself. New
// cron-based pushes (e.g. job-day-start) are digest-style: at most ONE
// push per run, never one per item, specifically to avoid that recurring.
const configured = Boolean(
  process.env.VAPID_PRIVATE_KEY &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
);

if (configured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:landlordcompliancelondon@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export const webPushConfigured = configured;

// Sends `payload` (an object — will be JSON-stringified) to one subscription.
// Returns { ok, gone } — `gone` is true on 404/410, meaning the subscription
// is dead and should be deleted (the device unsubscribed, uninstalled, etc).
export async function sendPush(subscription, payload) {
  if (!configured) return { ok: false, error: "Web Push not configured" };
  try {
    // Urgency "high" + a 1-day TTL: Apple and FCM hold "normal" pushes for
    // a device that's asleep or in Low Power Mode, which reads as "nothing
    // arrived". A task assignment is worth waking the phone for.
    const res = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 86400, urgency: "high" }
    );
    return { ok: true, statusCode: res?.statusCode };
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    const detail = String(err.body || "").slice(0, 200);
    return { ok: false, gone, statusCode: err.statusCode, error: `${err.statusCode || ""} ${err.message}${detail ? ` — ${detail}` : ""}`.trim() };
  }
}
