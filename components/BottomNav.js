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
// The bar used to hide on scroll-down (sliding away with the top bar so the
// two read as one chrome system). That looked tidy but broke the thing a tab
// bar exists for: after ANY downward scroll the bar was translated off-screen,
// so the next tap on a tab either hit nothing at all or was spent revealing
// the bar rather than navigating — the reported "I have to tap Jobs/Dashboard/
// Reports two or three times". No mainstream app hides its tab bar for this
// exact reason; it is the one piece of chrome that must always be hittable.
// It now only hides for the slide-out drawer, which genuinely would overlap it.
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
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-navy-200 dark:border-white/[0.08] bg-[var(--surface-card)] transition-transform duration-300 ease-out will-change-transform lg:hidden ${
        drawerOpen ? "translate-y-full" : "translate-y-0"
      }`}
      // Only HALF the safe-area inset. The full inset pushed the tabs a long
      // way up from the bottom edge, leaving the dead band the app appeared
      // not to fill; half still clears the iOS home indicator / Android
      // gesture bar while letting the tabs sit down where they belong.
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) / 2)" }}
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
