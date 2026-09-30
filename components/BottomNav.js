"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { visibleNavLinks, visibleUtilityLinks, PRIMARY_HREFS } from "@/lib/nav";

// App-style bottom tab bar for mobile. Black surface matching the dark
// sidebar so both navs read as one chrome system. Every tab is a real
// destination — the full menu lives behind the top-bar hamburger.
//
// UNCONDITIONALLY VISIBLE — no state, no listener, nothing that can hide
// it. This used to translate itself off-screen whenever a global
// "lcl-mobile-drawer" event said the slide-out side drawer was open, so
// the two wouldn't visually overlap. That open event is fired from more
// than one place (including a tour step that spotlights a nav link by
// force-opening the drawer), and at least one of those call sites never
// paired it with a corresponding close — so the flag could get stuck on
// and this bar would stay hidden for the rest of the session, on every
// route, for no reason visible in its own code. That's the third distinct
// way "hide sometimes" has broken this bar (after two reverted scroll-hide
// attempts, described below) — always visible, permanently, is the fix
// that can't have a similar failure mode, because there's no longer any
// condition left to get stuck in.
//
// History for the record: the first scroll-hide hid on scroll-down and
// only returned on an explicit scroll-up, so a tab tap after scrolling was
// spent revealing the bar instead of navigating. The second hid during
// scrolling in either direction and returned 220ms after it settled, but
// momentum scrolling on a phone keeps firing scroll events long after the
// finger lifts, so the bar spent most of a flick off-screen. A tab bar's
// whole job is to be in the same place every time you look down.
export default function BottomNav() {
  const pathname = usePathname();
  const { can, user } = useAuth();

  const visible = [...visibleNavLinks(can, user?.role), ...visibleUtilityLinks(can, user?.role)];
  const primary = PRIMARY_HREFS(can, user?.role)
    .map((href) => visible.find((l) => l.href === href))
    .filter(Boolean)
    .slice(0, 5);

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      style={{
        // Force this element onto its own GPU compositing layer,
        // permanently. Confirmed reproducible: the bar was still present
        // and clickable on the Dashboard even while completely invisible —
        // it was hit-testing correctly but not being PAINTED, which is a
        // real, well-documented iOS Safari bug where a fixed element can
        // silently fail to get composited when something else nearby is
        // under heavy GPU load (the Dashboard mounts a dozen-plus
        // simultaneous Framer Motion counter animations on every load; no
        // other page does this). translateZ(0) is the classic, direct fix —
        // it forces its own persistent layer, independent of what else is
        // animating. This bar used to carry will-change:transform for an
        // unrelated reason (a slide animation, removed along with the
        // conditional visibility it supported) and losing that side effect
        // is almost certainly why this specific bug reappeared right after
        // that pass.
        transform: "translateZ(0)",
        willChange: "transform",
        // Back to the ORIGINAL value this bar shipped with (env(safe-area-
        // inset-bottom), full, not zero) — checked against git history after
        // being told this genuinely worked correctly before. Padding is
        // INSIDE this element's own box, so the background already reaches
        // the true bottom edge at any padding value; the padding only
        // decides how far the tap targets sit above the home indicator,
        // which is what every well-built iOS app reserves this exact amount
        // of room for. Zero was wrong — it was based on a theory (that
        // window.innerHeight already excludes the safe area in standalone
        // mode) that never should have overridden a value already proven
        // correct in production before anything here was touched.
        paddingBottom: "env(safe-area-inset-bottom)",
        // Solid, not translucent. This used backdrop-blur-md over a
        // color-mix(...,transparent) background for a "content reads as one
        // continuous surface" effect — but backdrop-filter on a fixed,
        // always-on-screen element is a well-documented WebKit compositing
        // trap on iOS: it can silently drop out of the render tree after a
        // scroll, a theme change, or seemingly nothing, and the fix isn't a
        // CSS tweak, it's not using backdrop-filter there at all. This bar
        // has now failed three different ways (sliding away mid-scroll, a
        // gap below it, and outright not rendering on some screens) — a
        // primary nav needs to just always be there over looking fancy.
        backgroundColor: "var(--surface-card)",
        borderTop: "1px solid var(--hairline)",
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
