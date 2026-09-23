"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { visibleNavLinks, visibleUtilityLinks, PRIMARY_HREFS } from "@/lib/nav";

// App-style bottom tab bar for mobile. Black surface matching the dark
// sidebar so both navs read as one chrome system. Every tab is a real
// destination — the full menu lives behind the top-bar hamburger.
//
// ALWAYS VISIBLE. Two attempts at hiding it on scroll have both been
// reverted now. The first hid on scroll-down and only came back on an
// explicit scroll-up, so a tab tap after scrolling was spent revealing the
// bar instead of navigating ("have to tap Jobs two or three times"). The
// second hid while scrolling in either direction and came back 220ms after
// it stopped — but momentum scrolling on a phone keeps firing scroll events
// long after the finger has left the glass, so the bar spends most of a
// flick off-screen and any screenshot or glance mid-scroll shows it sliding
// away half-drawn (reported: "look at the bottom, why is it not properly
// showing at all").
//
// A tab bar's whole job is to be in the same place every time you look
// down. The content behind it already reads as continuous through the
// translucent blur; that's what the full-screen feel was actually for.
// Only the slide-out drawer still hides it, and that's a real overlap
// rather than a scroll gesture.
export default function BottomNav() {
  const pathname = usePathname();
  const { can, user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hide while the slide-out drawer is open so the two don't visually overlap.
  useEffect(() => {
    const onDrawer = (e) => setDrawerOpen(!!e.detail);
    window.addEventListener("lcl-mobile-drawer", onDrawer);
    return () => window.removeEventListener("lcl-mobile-drawer", onDrawer);
  }, []);

  const visible = [...visibleNavLinks(can, user?.role), ...visibleUtilityLinks(can, user?.role)];
  const primary = PRIMARY_HREFS(can, user?.role)
    .map((href) => visible.find((l) => l.href === href))
    .filter(Boolean)
    .slice(0, 5);

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-30 backdrop-blur-md transition-transform duration-300 ease-out will-change-transform lg:hidden ${
        drawerOpen ? "translate-y-full" : "translate-y-0"
      }`}
      style={{
        // NO safe-area padding here — none. Three passes tried a value here
        // (full inset, then half, then full again paired with a dvh/
        // innerHeight shell fix) and every one of them left a real, visible
        // gap between this bar and the true bottom edge, reported each time
        // ("still not going to the bottom... 20% of the screen untouched").
        // This app runs installed to the home screen (standalone display),
        // where window.innerHeight (what --app-height in AuthGate.js is now
        // built from) already comes back SHORTER than the physical screen —
        // iOS has already carved the home-indicator strip out of it. Adding
        // env(safe-area-inset-bottom) again on top of that reserved the same
        // strip a second time, and what showed through in that doubled gap
        // wasn't even this app's own background — it was the OS/PWA chrome
        // behind the page, which is why it stayed a flat light grey in the
        // screenshot even though the app itself was in dark mode: nothing of
        // ours was painting there. Zero padding lets the bar's own
        // background reach the actual edge instead of stopping a second
        // safe-area short of it.
        paddingBottom: 0,
        // Translucent + blurred rather than an opaque bar with a hard border,
        // so content scrolling underneath reads as one continuous surface
        // instead of a separate box sitting on top of it — reported as "it
        // looks separated".
        backgroundColor: "color-mix(in srgb, var(--surface-card) 85%, transparent)",
        borderTop: "1px solid color-mix(in srgb, var(--hairline) 60%, transparent)",
      }}
    >
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}>
        {primary.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center justify-center gap-1"
            >
              <span
                className={`grid h-8 w-12 place-items-center rounded-xl transition ${
                  active ? "bg-brand-500 text-white shadow-sm shadow-brand-500/40" : "text-navy-400 dark:text-slate-400"
                }`}
              >
                {Icon && <Icon className="h-[18px] w-[18px]" />}
              </span>
              <span className={`text-[10px] font-semibold ${active ? "text-brand-400" : "text-navy-500 dark:text-slate-500"}`}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
