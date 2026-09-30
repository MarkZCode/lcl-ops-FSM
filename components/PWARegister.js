"use client";

import { useEffect } from "react";

// Registers the service worker so LCL Ops can be installed to the home
// screen and keeps working (with a friendly offline page) without a
// connection. Silent no-op if the browser doesn't support it.
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // avoid caching during dev

    // When a new service worker takes over (i.e. a new deploy was picked
    // up), reload once so the installed app shows the latest version
    // instead of a stale cached shell.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    let registration = null;
    const checkForUpdate = () => {
      // Only meaningful once we actually have a registration. Errors here
      // are silent-safe — worst case, the next check (focus/interval) tries
      // again; there is no scenario where retrying causes harm.
      registration?.update().catch(() => {});
    };

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        registration = reg;
        checkForUpdate();
        // Keep this device's push address current on the server (see
        // syncPushSubscription) — a few seconds in, once login has settled.
        setTimeout(() => {
          import("@/lib/push").then((m) => m.syncPushSubscription()).catch(() => {});
        }, 5000);
      }).catch(() => {});
    };
    window.addEventListener("load", onLoad);

    // Re-check on every tab/app focus and visibility change — NOT just on a
    // true fresh page load. This is what "why do I have to reset it every
    // time" was actually missing: a browser tab or an installed Safari Web
    // App left open for hours (or one the OS suspends instead of fully
    // quitting) never fires a fresh `load` event again, so it would only
    // ever get the version it started with until someone manually
    // intervened. Now coming back to it re-checks for a new deploy the same
    // way the data-refresh effect in lib/store.js re-checks for new data.
    const onVisible = () => {
      if (document.visibilityState !== "hidden") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", checkForUpdate);
    // 5-minute backstop, matching the spirit of the data-refresh interval —
    // catches devices where focus/visibility events are unreliable.
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", checkForUpdate);
      clearInterval(interval);
    };
  }, []);

  return null;
}
