"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useHideWhileScrolling } from "@/lib/useHideOnScroll";
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

  // Moves exactly as the top bar does: away while the page is moving, back
  // the moment it stops. Same hook, same timing (lib/useHideOnScroll.js) —
  // it listens on the document in the capture phase, because on a phone the
  // page scrolls inside <body>, where a plain window scroll listener never
  // fires (which is why the first version of this did nothing).
  const hidden = useHideWhileScrolling({ resetKey: pathname });

  // A floating glass capsule, the way current iOS apps draw their tab bar:
  // inset from the edges, sitting just above the home indicator, the page
  // showing softly through it. The background is mostly opaque on its own,
  // so if a phone ever fails to apply the blur the bar is still solid enough
  // to read — earlier fully-transparent blurred bars could vanish entirely.
  return (
    <nav
      data-bottom-nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 lg:hidden"
      style={{
        // Its own compositing layer, always (see the iOS paint bug this
        // guards against: a fixed bar that hit-tests but isn't drawn).
        transform: hidden ? "translate3d(0, 130%, 0)" : "translate3d(0, 0, 0)",
        transition: "transform 280ms cubic-bezier(0.22, 0.8, 0.24, 1)",
        willChange: "transform",
        paddingBottom: "max(12px, calc(env(safe-area-inset-bottom) - 8px))",
      }}
    >
      <div
        className="pointer-events-auto mx-auto grid h-[62px] max-w-md items-center gap-1 rounded-full border border-black/[0.06] bg-white/75 p-1.5 shadow-[0_10px_34px_-6px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/[0.12] dark:bg-[#1c1c1e]/75 dark:shadow-[0_10px_34px_-6px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]"
        style={{
          gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))`,
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
        }}
      >
        {primary.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-full flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-200 active:opacity-70 ${
                active ? "bg-black/[0.07] dark:bg-white/[0.14]" : ""
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-[22px] w-[22px] ${active ? "text-brand-600 dark:text-brand-300" : "text-navy-600 dark:text-slate-300"}`}
                  strokeWidth={active ? 2.3 : 1.9}
                />
              )}
              <span className={`text-[10.5px] leading-none ${active ? "font-semibold text-brand-700 dark:text-brand-300" : "font-medium text-navy-600 dark:text-slate-300"}`}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
