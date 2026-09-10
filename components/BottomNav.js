"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { visibleNavLinks, visibleUtilityLinks, PRIMARY_HREFS } from "@/lib/nav";
import { useHideWhileScrolling } from "@/lib/useHideOnScroll";

// App-style bottom tab bar for mobile. Black surface matching the dark
// sidebar so both navs read as one chrome system. Every tab is a real
// destination — the full menu lives behind the top-bar hamburger.
//
// The bar used to hide on scroll-DOWN and only reveal on an explicit
// scroll-UP — which broke the thing a tab bar exists for: after any downward
// scroll it stayed off-screen until you deliberately scrolled back up, so the
// next tap on a tab either hit nothing or was spent revealing the bar rather
// than navigating (reported: "have to tap Jobs/Dashboard/Reports two or three
// times"). It was removed entirely for that reason.
//
// This is a DIFFERENT, safer pattern: hide only WHILE scrolling is actually
// happening (either direction), reveal a fixed short moment after it stops —
// see useHideWhileScrolling. A real tap only ever happens after scrolling has
// settled, so the bar is reliably back on screen before that tap lands; it
// never depends on which direction you happened to scroll last. This is what
// makes content feel full-screen while moving without repeating the earlier
// tap-reliability bug. Still always visible for the slide-out drawer case
// (translate-y-full there is a real overlap, not a scroll gesture).
export default function BottomNav() {
  const pathname = usePathname();
  const { can, user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollHidden = useHideWhileScrolling({ resetKey: pathname });

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
        drawerOpen || scrollHidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{
        // Only HALF the safe-area inset. The full inset pushed the tabs a
        // long way up from the bottom edge, leaving the dead band the app
        // appeared not to fill; half still clears the iOS home indicator /
        // Android gesture bar while letting the tabs sit down where they
        // belong.
        paddingBottom: "calc(env(safe-area-inset-bottom) / 2)",
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
