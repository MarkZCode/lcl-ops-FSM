"use client";

// Client-side Web Push helpers — request permission, subscribe this device,
// and register the subscription with the server so the urgent-outreach
// digest cron can reach it.
import { supabase } from "./supabase";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// iOS Safari only supports Web Push from a home-screen-installed PWA
// (standalone display mode), not from the regular browser tab.
export function isIosNonStandalone() {
  if (typeof window === "undefined") return false;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  return isIos && !isStandalone;
}

export async function getPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

const ENABLED_KEY = "lcl-push-enabled";
const remember = (on) => {
  try { on ? localStorage.setItem(ENABLED_KEY, "1") : localStorage.removeItem(ENABLED_KEY); } catch {}
};
const wanted = () => {
  try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
};

async function saveOnServer(sub) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  if (!token) return false;
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    }),
  });
  return res.ok;
}

// Run on every app open. A device's push address is NOT permanent: Chrome
// rotates it, and "clear cache and reload" (or the Settings cache wipe)
// drops the service worker and its subscription with it. The browser then
// holds a new address — or none — while the server keeps sending to the dead
// one, and the device silently stops getting anything while Settings still
// says "Enabled". This re-sends the current address every time, and if this
// device had notifications on and lost its subscription, quietly
// re-subscribes (permission is already granted, so there's no prompt).
export async function syncPushSubscription() {
  try {
    if (!pushSupported()) return;
    if (Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!wanted()) return;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    if (await saveOnServer(sub)) remember(true);
  } catch {
    // Best effort — next open tries again.
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Push isn't supported in this browser.");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push isn't configured yet.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission denied.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  if (!(await saveOnServer(sub))) throw new Error("Couldn't save subscription on the server.");
  remember(true);
  return sub;
}

export async function disablePush() {
  remember(false);
  const sub = await getPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
