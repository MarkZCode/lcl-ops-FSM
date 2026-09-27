"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiMenu,
  FiX,
  FiLogOut,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import { useAuth } from "@/lib/auth";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import { visibleNavLinks, visibleUtilityLinks } from "@/lib/nav";
import { useHideWhileScrolling } from "@/lib/useHideOnScroll";
import { motion } from "framer-motion";

// `dark` = always-dark surface (the mobile drawer), independent of the site
// theme. Without it this followed the same theme-remapped navy-500/900 text
// classes the desktop rail correctly uses — right there (a light, theme-aware
// surface) but on the drawer's permanently-dark background in LIGHT theme
// mode, navy-500 resolves to a dark grey that's barely visible on black.
// Confirmed directly: "the text is barely readable" on the drawer.
function NavLinks({ pathname, onNavigate, can, role, expanded = true, includeUtility = false, dark = false }) {
  const items = [...visibleNavLinks(can, role), ...(includeUtility ? visibleUtilityLinks(can, role) : [])];
  const layoutIdPrefix = includeUtility ? "mobile" : "desktop";
  
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((link) => {
        const Icon = link.icon;
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            data-tour-nav={link.href}
            onClick={onNavigate}
            title={link.label}
            data-active={active ? "true" : "false"}
            className={`nav-item relative z-10 ${expanded ? "" : "justify-center !px-0"} ${
              active
                ? "text-navy-900"
                : dark
                  ? "text-slate-300 hover:text-white"
                  : "text-navy-500 hover:text-navy-900"
            }`}
          >
            {/* Active state is a quiet raised surface, not a saturated brand
                fill — a solid green bar down the rail was the loudest thing
                on screen and pulled the eye away from the actual content. */}
            {active && (
              <motion.div
                layoutId={`activeTab-${layoutIdPrefix}`}
                className="absolute inset-0 -z-10 rounded-[10px]"
                style={{ backgroundColor: "var(--surface-raised)" }}
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <Icon className={`h-[19px] w-[19px] shrink-0 ${active ? "text-brand-400" : ""}`} strokeWidth={1.9} />
            {expanded && <span className="truncate">{link.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

// `dark` forces light text/icon colours regardless of theme — for the
// mobile drawer, which is a permanently dark surface. Without it this
// followed the theme-remapped navy-900/navy-500 tokens, which resolve to
// near-black in light mode: correct on the theme-aware desktop rail, but on
// the drawer's always-dark background it put near-black text on black —
// exactly the "can't even see the name and email" symptom.
function UserFooter({ user, onLogout, expanded = true, withControls = false, dark = false }) {
  const displayName = user?.username || user?.name || "?";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="mt-auto">
      {/* Theme + notifications sit here rather than crowding the brand row. */}
      {withControls && (
        <div className={`mb-2 flex items-center ${expanded ? "gap-1 px-1" : "flex-col gap-1"}`}>
          {/* Theme only. The bell lives in the top bar — the rail used to
              carry a second one a few hundred pixels below it, showing the
              same count, so a glance couldn't tell whether that was two
              notifications or four. */}
          <ThemeToggle className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${dark ? "text-slate-300 hover:text-white" : "text-navy-500 hover:text-navy-900"}`} />
        </div>
      )}
      <div
        className={`flex rounded-lg ${
          expanded ? "items-center gap-2.5 p-2.5" : "flex-col items-center gap-1 p-1.5"
        }`}
      >
        {/* The avatar IS the way into your own profile — clicking it opens
            Settings scrolled to your account, rather than being a decoration
            you have to hunt past to find Settings in the nav. */}
        <Link
          href="/settings?section=profile"
          aria-label="Your profile settings"
          title="Your profile settings"
          className="shrink-0 rounded-full transition hover:opacity-80"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.username || user.name || ""}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-navy-900 dark:ring-white/70" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
              {initials}
            </span>
          )}
        </Link>
        {expanded ? (
          <>
            <Link href="/settings?section=profile" className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${dark ? "text-white" : "text-navy-900"}`}>{user?.username || user?.name}</p>
              <p className={`text-[11px] capitalize ${dark ? "text-slate-400" : "text-navy-500"}`}>{user?.role}</p>
            </Link>
            <button
              onClick={onLogout}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${dark ? "text-slate-300 hover:text-white" : "text-navy-500 hover:text-navy-900"}`}
              aria-label="Sign out"
              title="Sign out"
            >
              <FiLogOut />
            </button>
          </>
        ) : (
          <button
            onClick={onLogout}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:text-navy-900"
            aria-label="Sign out"
            title="Sign out"
          >
            <FiLogOut />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false); // pinned-collapsed (auto-hide)
  const [hover, setHover] = useState(false);
  const { user, can, logout } = useAuth();
  // Hides while actively scrolling (either direction, including momentum),
  // reveals a moment after it settles -- the content should feel full-screen
  // while moving, with the chrome back before the next tap ever lands.
  const barHidden = useHideWhileScrolling({ resetKey: pathname });
  // The bar is `fixed` (not `sticky` — unreliable inside nested flex/overflow
  // containers) so it always pins to the viewport. A measured spacer of the
  // same height reserves its space in the normal document flow, keeping page
  // content clear of it without hardcoding a pixel value (its height varies
  // with the safe-area notch inset).
  const barRef = useRef(null);
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // NOTE: ResizeObserver's `entry.contentRect` reports only the content box
    // (excludes padding) — for this bar almost all of its height IS padding
    // (the safe-area inset), so contentRect.height under-measures it badly
    // and shrinks the spacer, letting content ride up underneath. Read
    // `offsetHeight` instead, which correctly includes padding + border.
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    setBarHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Remember the collapsed preference across sessions.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("lcl-sidebar-collapsed") === "1");
    } catch {}
  }, []);

  // Open/close the drawer when a tour needs a mobile nav target in the DOM
  // (or is done needing one). The open side of this existed alone for a
  // long time with no close event anywhere in the codebase to pair with it
  // — once any tour step highlighted a nav link, the drawer stayed open
  // (and the bottom tab bar, which hides itself while the drawer is open so
  // the two don't visually clash, stayed hidden) for the rest of the
  // session, on every route, regardless of whether the tour itself had long
  // since finished or been dismissed. Reported as the bottom nav going
  // missing entirely on the Dashboard, whose own auto-run first-visit tour
  // has exactly one such step (spotlighting the Dispatch link).
  useEffect(() => {
    const openDrawer = () => setOpen(true);
    const closeDrawer = () => setOpen(false);
    window.addEventListener("lcl-open-mobile-nav", openDrawer);
    window.addEventListener("lcl-close-mobile-nav", closeDrawer);
    return () => {
      window.removeEventListener("lcl-open-mobile-nav", openDrawer);
      window.removeEventListener("lcl-close-mobile-nav", closeDrawer);
    };
  }, []);

  // Let the bottom tab bar know when the drawer is open so it can hide
  // itself (avoids the dimmed bottom bar showing through the overlay).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("lcl-mobile-drawer", { detail: open }));
  }, [open]);
  // Open/close intent timers — see `expanded` below.
  const hoverTimer = useRef(null);
  const openOnHover = () => {
    clearTimeout(hoverTimer.current);
    if (!collapsed) return;               // already open; nothing to do
    hoverTimer.current = setTimeout(() => setHover(true), 140);
  };
  const closeOnHover = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(false), 220);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const toggleCollapsed = () => {
    clearTimeout(hoverTimer.current);
    setHover(false);
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("lcl-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  // Collapsed rail expands on hover (macOS-dock style) and closes when the
  // pointer leaves, so the workspace stays full-width without having to click
  // the chevron every time.
  //
  // Both directions are DELAYED. Hover-expand was removed once because the
  // panel flew open whenever the cursor merely crossed the rail on its way
  // somewhere else; a short intent delay fixes that without losing the
  // feature, and the close delay stops it snapping shut while you travel
  // diagonally toward a nav item.
  const expanded = !collapsed || hover;

  return (
    <>
      {/* Mobile top bar — fixed to the viewport (not `sticky`, which can
          silently fail inside nested flex/overflow containers). Slides up out
          of view on scroll-down, slides back in the instant you scroll up —
          no need to ever scroll all the way to the top to reach the menu. */}
      <div
        className="lg:hidden"
        style={{ height: barHeight ? `${barHeight}px` : "calc(60px + env(safe-area-inset-top))" }}
        aria-hidden="true"
      />
      {/* Translucent + blurred rather than a flat opaque bar with a hard
          border, so content sliding underneath it reads as one continuous
          surface instead of a separate box sitting on top -- reported as
          "it looks separated" when the old solid bg-white bar was visible.
          bg-white was also never theme-aware (a bright white bar in dark
          mode); the CSS variable fixes both at once. */}
      <div
        ref={barRef}
        className={`fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur-md transition-transform duration-300 ease-out will-change-transform lg:hidden ${
          barHidden ? "-translate-y-full" : "translate-y-0"
        }`}
        style={{
          paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
          backgroundColor: "color-mix(in srgb, var(--surface-card) 85%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--hairline) 60%, transparent)",
        }}
      >
        <Link href="/" className="text-[15px] font-semibold tracking-tight text-navy-900">
          LCL Ops
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle className="grid h-9 w-9 place-items-center rounded-lg border border-navy-200 text-navy-700 dark:border-white/10 dark:text-slate-300" />
          <NotificationBell />
          <button
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-navy-200 text-navy-700 dark:border-white/10 dark:text-slate-300"
            aria-label="Open menu"
          >
            <FiMenu />
          </button>
        </div>
      </div>

      {/* Desktop sidebar — collapsible, auto-hide on hover when collapsed.
          The outer div reserves only the rail width when collapsed, so the
          panel slides over the content (it doesn't push it). */}
      <div
        className={`relative hidden shrink-0 transition-[width] duration-200 lg:block ${
          collapsed ? "w-[72px]" : "w-[248px]"
        }`}
      >
        <aside
          onMouseEnter={openOnHover}
          onMouseLeave={closeOnHover}
          className={`absolute inset-y-0 left-0 z-30 flex flex-col border-r border-navy-100 transition-[width] duration-200 will-change-[width] ${
            expanded ? "w-[248px]" : "w-[72px]"
          } `}
          style={{ backgroundColor: "var(--surface-page)" }}
        >
          <div className="flex flex-1 flex-col overflow-visible px-3 pb-4 pt-5">
            {/* Brand row — the wordmark gets the full width to itself.
                Three icon buttons used to share this row, leaving ~86px for
                the name inside a w-64 rail, which clipped it to "LCL Op…".
                Theme + notifications now live down in the user row, which is
                also where a SaaS console usually puts them; only the collapse
                chevron stays up here. */}
            {/* NO brand mark here in either state. The full-width top bar sits
                directly above this column and already carries the logo, so a
                mark in the rail repeats it about 60px below itself — which is
                the doubled logo you could see when the rail was collapsed.
                (The expand/collapse chevron below keeps the rail from looking
                headless without repeating the brand.) */}
            <div className={`mb-4 ${expanded ? "px-1" : "flex flex-col items-center gap-2 px-0"}`}>
              <div className={`flex items-center gap-2 ${expanded ? "w-full justify-end" : "justify-center"}`}>
                {expanded && (
                  <button
                    onClick={toggleCollapsed}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:text-navy-900"
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                  >
                    <FiChevronLeft />
                  </button>
                )}
              </div>
              {!expanded && (
                <button
                  onClick={toggleCollapsed}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:text-navy-900"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <FiChevronRight />
                </button>
              )}
            </div>
            <NavLinks pathname={pathname} can={can} role={user?.role} expanded={expanded} />
            <UserFooter user={user} onLogout={logout} expanded={expanded} withControls />
          </div>
        </aside>
      </div>

      {/* Mobile drawer — always mounted so tour targets exist; slides off-screen when closed */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
          <div
            className={`absolute inset-0 bg-navy-950/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
            onClick={() => setOpen(false)}
          />
          <div className={`absolute left-0 top-0 flex h-full w-72 flex-col bg-[#0a0a0c] transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
            <div className="flex flex-1 flex-col overflow-y-auto p-4" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
            <div className="mb-6 flex items-center justify-between gap-2 px-2 pt-1">
              <span className="flex min-w-0 items-center gap-2.5">
                {/* Wordmark only — the icon mark is gone from the chrome. */}
                <p className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-white">LCL Ops</p>
              </span>
              {/* text-navy-200 remaps to --text-secondary, which is dark in
                  light theme mode -- invisible against this permanently-dark
                  drawer header. Fixed light colour instead. */}
              <button
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <FiX />
              </button>
            </div>
            <NavLinks pathname={pathname} can={can} role={user?.role} onNavigate={() => setOpen(false)} includeUtility dark />
            <UserFooter user={user} onLogout={logout} withControls dark />
          </div>
          </div>
      </div>
    </>
  );
}
