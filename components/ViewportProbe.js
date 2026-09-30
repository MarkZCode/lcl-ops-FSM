"use client";

// Temporary diagnostic — remove once the mobile bottom-nav geometry is fixed.
//
// Screenshots showed the bottom nav ending ~62pt above the screen edge on
// Jobs, and sitting 62pt lower but clipped on the Dashboard. Several fixes
// were made from screenshots alone and none held, so this measures the real
// geometry on the real phone instead: every viewport height the browser
// reports, where a `position:fixed; bottom:0` element actually lands, the
// safe-area insets, and the nav's own box. Sends only numbers + path + UA to
// /api/diag/viewport (function log only).

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MAX_REPORTS = 12;

function probeBox(css) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:0;width:1px;visibility:hidden;pointer-events:none;${css}`;
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  el.remove();
  return { top: r.top, bottom: r.bottom, height: r.height, pt: cs.paddingTop, pb: cs.paddingBottom };
}

function measure(pathname, tag) {
  const nav = document.querySelector("[data-bottom-nav]");
  const navRect = nav?.getBoundingClientRect();
  const vv = window.visualViewport;
  const safe = probeBox("top:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)");
  return {
    tag,
    path: pathname,
    ua: navigator.userAgent,
    standalone: !!window.navigator.standalone,
    displayMode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser",
    dpr: window.devicePixelRatio,
    screen: { w: window.screen.width, h: window.screen.height },
    inner: { w: window.innerWidth, h: window.innerHeight },
    outerH: window.outerHeight,
    docClientH: document.documentElement.clientHeight,
    bodyClientH: document.body.clientHeight,
    scrollH: document.documentElement.scrollHeight,
    scrollY: window.scrollY,
    vv: vv ? { h: vv.height, top: vv.offsetTop, pageTop: vv.pageTop, scale: vv.scale } : null,
    appHeightVar: getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim(),
    safeTop: safe.pt,
    safeBottom: safe.pb,
    fixedBottom0: probeBox("bottom:0;height:1px"),
    fixedInset0: probeBox("top:0;bottom:0"),
    h100vh: probeBox("top:0;height:100vh").height,
    h100dvh: probeBox("top:0;height:100dvh").height,
    h100svh: probeBox("top:0;height:100svh").height,
    h100lvh: probeBox("top:0;height:100lvh").height,
    h100pct: probeBox("top:0;height:100%").height,
    nav: navRect ? { top: navRect.top, bottom: navRect.bottom, height: navRect.height } : "missing",
  };
}

export default function ViewportProbe() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    let sent = 0;
    try { sent = Number(sessionStorage.getItem("lcl-vp-probe") || 0); } catch {}
    if (sent >= MAX_REPORTS) return;

    const send = (tag) => {
      try {
        const n = Number(sessionStorage.getItem("lcl-vp-probe") || 0);
        if (n >= MAX_REPORTS) return;
        sessionStorage.setItem("lcl-vp-probe", String(n + 1));
        const data = JSON.stringify(measure(pathname, tag));
        if (!navigator.sendBeacon?.("/api/diag/viewport", data)) {
          fetch("/api/diag/viewport", { method: "POST", body: data, keepalive: true }).catch(() => {});
        }
      } catch {}
    };

    const t1 = setTimeout(() => send("t+0.8s"), 800);
    const t2 = setTimeout(() => send("t+3s"), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pathname]);

  return null;
}
