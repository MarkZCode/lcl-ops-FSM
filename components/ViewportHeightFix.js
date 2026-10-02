"use client";

import { useEffect } from "react";

// Keeps --app-height on <html> equal to the ACTUAL visible screen, in real
// pixels, measured by the browser itself — not `100vh`/`100dvh`.
//
// Both units have burned this app already: `100vh` on mobile Safari is
// sized off the largest possible viewport (address bar hidden), so the
// page could measure itself as taller than what's really on screen.
// Switching the shell to `100dvh` was the standard fix for that — but on
// this app, installed to the home screen (standalone display), it didn't
// close the gap the report described (~20% of the screen, black, below the
// bottom nav). `dvh` support in standalone iOS PWAs has its own history of
// WebKit bugs where it doesn't track the real visual viewport correctly
// either — which would explain why doubling the bottom nav's safe-area
// padding in the previous pass changed nothing anyone could see: the gap
// was never the padding, it was the shell measuring itself against the
// wrong number entirely.
//
// window.innerHeight has no such ambiguity — it IS the number of real
// pixels the browser is showing right now. Recomputed on resize,
// orientation change, and visualViewport resize (the keyboard opening,
// Safari's UI chrome collapsing/expanding) so it never goes stale.
export default function ViewportHeightFix() {
  useEffect(() => {
    // Installed on an iPhone home screen, with the status bar drawn over the
    // page, WebKit reports innerHeight SHORT by the height of the status bar
    // — so a shell sized to it stops that far above the bottom of the
    // screen, leaving a dead strip under the tab bar. There the real figure
    // is the screen itself. (navigator.standalone exists only on iOS.)
    const setAppHeight = () => {
      let h = window.innerHeight;
      if (window.navigator.standalone === true) {
        const portrait = window.innerHeight >= window.innerWidth;
        const screenH = portrait ? Math.max(window.screen.height, window.screen.width) : Math.min(window.screen.height, window.screen.width);
        // Not while the keyboard is up (then the short figure is the true one).
        if (screenH - h < 120) h = screenH;
      }
      document.documentElement.style.setProperty("--app-height", `${h}px`);
    };
    setAppHeight();
    window.addEventListener("resize", setAppHeight);
    window.addEventListener("orientationchange", setAppHeight);
    window.visualViewport?.addEventListener("resize", setAppHeight);
    return () => {
      window.removeEventListener("resize", setAppHeight);
      window.removeEventListener("orientationchange", setAppHeight);
      window.visualViewport?.removeEventListener("resize", setAppHeight);
    };
  }, []);

  return null;
}
